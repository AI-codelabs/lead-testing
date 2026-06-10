import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const accessLevels = ["full", "names_only", "metrics_only"] as const;

function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeUnsubscribeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildInviteEmailHtml(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  acceptUrl: string;
}) {
  const { heading, bodyHtml, ctaLabel, acceptUrl } = opts;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#0a0a0a;padding:24px;">
  <div style="max-width:520px;margin:0 auto;">
    <h1 style="font-size:22px;margin:0 0 16px;">${heading}</h1>
    <div style="font-size:14px;line-height:1.5;color:#444;">${bodyHtml}</div>
    <p style="margin:24px 0;">
      <a href="${acceptUrl}" style="background:#0a0a0a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">${ctaLabel}</a>
    </p>
    <p style="font-size:12px;color:#999;">If you weren't expecting this, you can ignore this email. The link expires in 14 days.</p>
  </div></body></html>`;
}

async function enqueueEmail(opts: {
  supabaseAdmin: any;
  to: string;
  subject: string;
  html: string;
  text: string;
  label: string;
  idempotencyKey?: string;
}) {
  const messageId = crypto.randomUUID();
  const idempotencyKey = opts.idempotencyKey ?? `${opts.label}-${messageId}`;
  const normalizedTo = opts.to.trim().toLowerCase();

  const { data: suppressed, error: suppressionError } = await opts.supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalizedTo)
    .maybeSingle();
  if (suppressionError) throw suppressionError;
  if (suppressed) {
    const { error: suppressedLogError } = await opts.supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: opts.label,
      recipient_email: normalizedTo,
      status: "suppressed",
    });
    if (suppressedLogError) throw suppressedLogError;
    return;
  }

  const { data: existingToken, error: tokenLookupError } = await opts.supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedTo)
    .maybeSingle();
  if (tokenLookupError) throw tokenLookupError;

  if (existingToken?.used_at) {
    const { error: usedTokenLogError } = await opts.supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: opts.label,
      recipient_email: normalizedTo,
      status: "suppressed",
      error_message: "Recipient unsubscribed",
    });
    if (usedTokenLogError) throw usedTokenLogError;
    return;
  }

  let unsubscribeToken = existingToken?.token as string | undefined;
  if (!unsubscribeToken) {
    unsubscribeToken = makeUnsubscribeToken();
    const { error: tokenCreateError } = await opts.supabaseAdmin
      .from("email_unsubscribe_tokens")
      .upsert({ token: unsubscribeToken, email: normalizedTo }, { onConflict: "email", ignoreDuplicates: true });
    if (tokenCreateError) throw tokenCreateError;

    const { data: storedToken, error: storedTokenError } = await opts.supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalizedTo)
      .maybeSingle();
    if (storedTokenError || !storedToken?.token) throw storedTokenError ?? new Error("Failed to create unsubscribe token");
    unsubscribeToken = storedToken.token;
  }

  const { error: logError } = await opts.supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: opts.label,
    recipient_email: normalizedTo,
    status: "pending",
  });
  if (logError) throw logError;

  const { error } = await opts.supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: normalizedTo,
      from: `Leadlogr <noreply@notify.leadlogr.com>`,
      sender_domain: "notify.leadlogr.com",
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      purpose: "transactional",
      label: opts.label,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) throw error;
}

const SendInviteInput = z.object({
  agencyEmail: z.string().email().max(255),
  accessLevel: z.enum(accessLevels).default("full"),
});

/**
 * Standard workspace invites an agency. The agency MUST already have an
 * agency account on Leadlogr — we don't create accounts on their behalf.
 */
export const sendAgencyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendInviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const inviterEmail = (claims.email as string) ?? "";

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("workspace_name, account_type")
      .eq("id", userId)
      .maybeSingle();
    if (!inviterProfile) throw new Error("Profile not found");
    if (inviterProfile.account_type !== "standard") {
      throw new Error("Only standard accounts can invite an agency");
    }

    const normalizedEmail = data.agencyEmail.trim().toLowerCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, account_type, workspace_name")
      .ilike("owner_email", normalizedEmail)
      .maybeSingle();

    if (!existingProfile) {
      throw new Error(
        "No Leadlogr agency account found for that email. Ask the agency to sign up first, then invite them.",
      );
    }
    if (existingProfile.account_type !== "agency") {
      throw new Error("That email is registered as a standard workspace, not an agency.");
    }

    const matchedAgencyId = existingProfile.id;
    const token = makeToken();
    const { data: invite, error: insertErr } = await supabaseAdmin
      .from("agency_invites")
      .insert({
        kind: "agency_invite",
        inviter_id: userId,
        inviter_workspace_name: inviterProfile.workspace_name,
        inviter_email: inviterEmail,
        agency_email: normalizedEmail,
        agency_id: matchedAgencyId,
        access_level: data.accessLevel,
        token,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // Immediately link inviter's workspace to that agency.
    const { error: linkErr } = await supabaseAdmin
      .from("profiles")
      .update({ agency_id: matchedAgencyId, agency_access: data.accessLevel })
      .eq("id", userId);
    if (linkErr) throw linkErr;

    const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || "https://lead-testing.lovable.app";
    const accessLabel =
      data.accessLevel === "full"
        ? "full"
        : data.accessLevel === "names_only"
          ? "limited (names only)"
          : "metrics-only";
    const heading = `You've been added as an agency on Leadlogr`;
    const bodyHtml = `
      <p><strong>${inviterProfile.workspace_name}</strong> (${inviterEmail}) gave your agency
      <strong>${accessLabel}</strong> access to their Leadlogr workspace.</p>
      <p>The workspace already appears in your agency dashboard — sign in to start working with it.</p>
    `;
    await enqueueEmail({
      supabaseAdmin,
      to: normalizedEmail,
      subject: `${inviterProfile.workspace_name} added you as their agency on Leadlogr`,
      html: buildInviteEmailHtml({
        heading,
        bodyHtml,
        ctaLabel: "Open agency dashboard",
        acceptUrl: `${siteUrl}/agency`,
      }),
      text: `${inviterProfile.workspace_name} added you as their agency. Open: ${siteUrl}/agency`,
      label: "agency_invite",
      idempotencyKey: `agency-invite-${invite.id}`,
    });

    return { invite, matched: true };
  });

const CreateClientInput = z.object({
  workspaceName: z.string().min(1).max(120),
  ownerName: z.string().max(120).optional(),
  ownerEmail: z.string().email().max(255),
  accessLevel: z.enum(accessLevels).default("full"),
});

/**
 * Agency creates a client workspace setup invite. The client receives an
 * email with a signup link. On signup we auto-create their standard
 * workspace and link this agency to it with the requested access level.
 */
export const createClientWorkspaceInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateClientInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const inviterEmail = (claims.email as string) ?? "";

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("workspace_name, account_type")
      .eq("id", userId)
      .maybeSingle();
    if (!inviterProfile) throw new Error("Profile not found");
    if (inviterProfile.account_type !== "agency") {
      throw new Error("Only agency accounts can create client workspaces");
    }

    const normalizedEmail = data.ownerEmail.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, account_type")
      .ilike("owner_email", normalizedEmail)
      .maybeSingle();
    if (existing) {
      throw new Error("Someone with that email already has a Leadlogr account.");
    }

    const token = makeToken();
    const { data: invite, error: insertErr } = await supabaseAdmin
      .from("agency_invites")
      .insert({
        kind: "client_invite",
        inviter_id: userId,
        inviter_workspace_name: data.workspaceName.trim(),
        inviter_email: inviterEmail,
        agency_email: normalizedEmail,
        agency_id: null,
        access_level: data.accessLevel,
        token,
        status: "pending",
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || "https://lead-testing.lovable.app";
    const acceptUrl = `${siteUrl}/signup?clientInvite=${token}`;
    const heading = `${inviterProfile.workspace_name} set up a Leadlogr workspace for you`;
    const ownerLine = data.ownerName ? `Hi ${data.ownerName},` : `Hi,`;
    const bodyHtml = `
      <p>${ownerLine}</p>
      <p><strong>${inviterProfile.workspace_name}</strong> (${inviterEmail}) created a
      Leadlogr workspace called <strong>${data.workspaceName.trim()}</strong> for you and would like
      to manage it on your behalf.</p>
      <p>Click below to finish setting up your account — you'll be the owner of the workspace, and
      ${inviterProfile.workspace_name} will have access too.</p>
    `;
    await enqueueEmail({
      supabaseAdmin,
      to: normalizedEmail,
      subject: `${inviterProfile.workspace_name} created your Leadlogr workspace`,
      html: buildInviteEmailHtml({
        heading,
        bodyHtml,
        ctaLabel: "Create my account",
        acceptUrl,
      }),
      text: `${inviterProfile.workspace_name} created a Leadlogr workspace for you. Finish signup: ${acceptUrl}`,
      label: "client_invite",
      idempotencyKey: `client-invite-${invite.id}`,
    });

    return { invite };
  });

export const listSentInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("agency_invites")
      .select("*")
      .eq("inviter_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { invites: data ?? [] };
  });

export const listReceivedInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const email = ((claims.email as string) ?? "").toLowerCase();
    const { data, error } = await supabase
      .from("agency_invites")
      .select("*")
      .or(`agency_id.eq.${userId},agency_email.eq.${email}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { invites: data ?? [] };
  });

export const listAgencyClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clients, error } = await supabaseAdmin
      .from("profiles")
      .select("id, workspace_key, workspace_name, owner_name, owner_email, agency_access")
      .eq("agency_id", userId)
      .order("workspace_name", { ascending: true });
    if (error) throw error;

    const workspaceKeys = (clients ?? []).map((c: any) => c.workspace_key).filter(Boolean);
    const leadCounts = new Map<string, { total: number; won: number }>();
    if (workspaceKeys.length > 0) {
      const { data: leads, error: leadsErr } = await supabaseAdmin
        .from("leads")
        .select("workspace_key, stage")
        .in("workspace_key", workspaceKeys);
      if (leadsErr) throw leadsErr;
      for (const lead of leads ?? []) {
        const current = leadCounts.get(lead.workspace_key) ?? { total: 0, won: 0 };
        current.total += 1;
        if ((lead.stage ?? "").toLowerCase() === "won") current.won += 1;
        leadCounts.set(lead.workspace_key, current);
      }
    }

    return {
      clients: (clients ?? []).map((c: any) => {
        const counts = leadCounts.get(c.workspace_key) ?? { total: 0, won: 0 };
        return {
          id: c.workspace_key,
          name: c.workspace_name,
          ownerName: c.owner_name || c.owner_email,
          ownerEmail: c.owner_email,
          monthlyReferralFee: 0,
          currency: "EUR" as const,
          leadsCount: counts.total,
          conversionRate: counts.total > 0 ? counts.won / counts.total : 0,
          agencyAccess: c.agency_access,
        };
      }),
    };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error: lookupErr } = await supabaseAdmin
      .from("agency_invites")
      .select("id, inviter_id, agency_id, status, kind")
      .eq("id", data.id)
      .eq("inviter_id", userId)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!invite) throw new Error("Invite not found");

    const { error } = await supabaseAdmin
      .from("agency_invites")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw error;

    if (invite.kind === "agency_invite" && invite.agency_id) {
      const { error: unlinkErr } = await supabaseAdmin
        .from("profiles")
        .update({ agency_id: null, agency_access: null })
        .eq("id", userId)
        .eq("agency_id", invite.agency_id);
      if (unlinkErr) throw unlinkErr;
    }
    return { ok: true };
  });

/**
 * Accept any invite (agency_invite or client_invite) by token.
 * Called automatically from /signup right after the new user signs in.
 */
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = ((claims.email as string) ?? "").toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error: lookupErr } = await supabaseAdmin
      .from("agency_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is no longer pending");
    if (new Date(invite.expires_at) < new Date()) {
      await supabaseAdmin
        .from("agency_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);
      throw new Error("Invite has expired");
    }
    if (invite.agency_email.toLowerCase() !== email) {
      throw new Error("This invite is for a different email address");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_type, id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");

    if (invite.kind === "agency_invite") {
      if (profile.account_type !== "agency") {
        throw new Error("Only agency accounts can accept this invite");
      }
      const { error: linkErr } = await supabaseAdmin
        .from("profiles")
        .update({ agency_id: userId, agency_access: invite.access_level })
        .eq("id", invite.inviter_id);
      if (linkErr) throw linkErr;
    } else if (invite.kind === "client_invite") {
      if (profile.account_type !== "standard") {
        throw new Error("This invite must be accepted by a standard workspace account");
      }
      // The new client becomes a standard owner whose workspace is managed
      // by the inviting agency.
      const { error: linkErr } = await supabaseAdmin
        .from("profiles")
        .update({
          agency_id: invite.inviter_id,
          agency_access: invite.access_level,
          // Use the workspace name the agency set up for them.
          workspace_name: invite.inviter_workspace_name,
        })
        .eq("id", userId);
      if (linkErr) throw linkErr;
    }

    const { error: updErr } = await supabaseAdmin
      .from("agency_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        agency_id: invite.kind === "agency_invite" ? userId : invite.inviter_id,
      })
      .eq("id", invite.id);
    if (updErr) throw updErr;

    return { ok: true, kind: invite.kind as "agency_invite" | "client_invite" };
  });

export const declineInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const email = ((claims.email as string) ?? "").toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("agency_invites")
      .select("id, agency_id, agency_email")
      .eq("id", data.id)
      .maybeSingle();
    if (!invite) throw new Error("Invite not found");
    if (invite.agency_id !== userId && invite.agency_email.toLowerCase() !== email) {
      throw new Error("Not authorized");
    }
    const { error } = await supabaseAdmin
      .from("agency_invites")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
