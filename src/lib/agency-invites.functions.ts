import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const accessLevels = ["full", "names_only", "metrics_only"] as const;

function makeToken(): string {
  // 32-char URL-safe token
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildInviteEmailHtml(opts: {
  inviterWorkspace: string;
  inviterEmail: string;
  acceptUrl: string;
  accessLabel: string;
  existingAgency: boolean;
}) {
  const { inviterWorkspace, inviterEmail, acceptUrl, accessLabel, existingAgency } = opts;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#0a0a0a;padding:24px;">
  <div style="max-width:520px;margin:0 auto;">
    <h1 style="font-size:22px;margin:0 0 16px;">You've been invited to Leadlogr</h1>
    <p style="font-size:14px;line-height:1.5;color:#444;">
      <strong>${inviterWorkspace}</strong> (${inviterEmail}) invited your agency to manage their Leadlogr workspace
      with <strong>${accessLabel}</strong> access.
    </p>
    <p style="font-size:14px;line-height:1.5;color:#444;">
      ${existingAgency ? "The workspace has been linked to your agency account." : "Click below to create your Leadlogr agency account and accept the invite:"}
    </p>
    <p style="margin:24px 0;">
      <a href="${acceptUrl}" style="background:#0a0a0a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">${existingAgency ? "Open agency dashboard" : "Accept invitation"}</a>
    </p>
    <p style="font-size:12px;color:#999;">If you weren't expecting this, you can ignore this email. The link expires in 14 days.</p>
  </div></body></html>`;
}

async function enqueueInviteEmail(opts: {
  supabaseAdmin: any;
  to: string;
  inviterWorkspace: string;
  inviterEmail: string;
  acceptUrl: string;
  accessLabel: string;
  existingAgency: boolean;
}) {
  const messageId = crypto.randomUUID();
  const html = buildInviteEmailHtml(opts);
  await opts.supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "agency_invite",
    recipient_email: opts.to,
    status: "pending",
  });
  const { error } = await opts.supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: opts.to,
      from: `Leadlogr <noreply@notify.leadlogr.com>`,
      sender_domain: "notify.leadlogr.com",
      subject: `${opts.inviterWorkspace} invited you to Leadlogr`,
      html,
      text: `${opts.inviterWorkspace} invited your agency to Leadlogr. Open: ${opts.acceptUrl}`,
      purpose: "transactional",
      label: "agency_invite",
      queued_at: new Date().toISOString(),
    },
  });
  if (error) console.error("Failed to enqueue invite email", error);
}

const SendInviteInput = z.object({
  agencyEmail: z.string().email().max(255),
  accessLevel: z.enum(accessLevels).default("full"),
});

export const sendAgencyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendInviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const inviterEmail = (claims.email as string) ?? "";

    // Look up inviter profile for workspace name
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
    let matchedAgencyId: string | null = null;
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, account_type")
      .ilike("owner_email", normalizedEmail)
      .maybeSingle();
    if (existingProfile?.id && existingProfile.account_type !== "agency") {
      throw new Error("That email belongs to a standard workspace. Invite an agency account email instead.");
    }
    if (existingProfile?.id) {
      matchedAgencyId = existingProfile.id;
    }

    const token = makeToken();
    const acceptedAt = matchedAgencyId ? new Date().toISOString() : null;
    const { data: invite, error: insertErr } = await supabaseAdmin
      .from("agency_invites")
      .insert({
        inviter_id: userId,
        inviter_workspace_name: inviterProfile.workspace_name,
        inviter_email: inviterEmail,
        agency_email: normalizedEmail,
        agency_id: matchedAgencyId,
        access_level: data.accessLevel,
        token,
        status: matchedAgencyId ? "accepted" : "pending",
        accepted_at: acceptedAt,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    if (matchedAgencyId) {
      const { error: linkErr } = await supabaseAdmin
        .from("profiles")
        .update({ agency_id: matchedAgencyId, agency_access: data.accessLevel })
        .eq("id", userId);
      if (linkErr) throw linkErr;
    }

    const siteUrl = process.env.SITE_URL || process.env.VITE_SITE_URL || "https://lead-testing.lovable.app";
    const accessLabel =
      data.accessLevel === "full"
        ? "full"
        : data.accessLevel === "names_only"
          ? "limited (names only)"
          : "metrics-only";
    await enqueueInviteEmail({
      supabaseAdmin,
      to: normalizedEmail,
      inviterWorkspace: inviterProfile.workspace_name,
      inviterEmail,
      acceptUrl: matchedAgencyId ? `${siteUrl}/agency/account` : `${siteUrl}/signup?invite=${token}`,
      accessLabel,
      existingAgency: Boolean(matchedAgencyId),
    });

    return {
      invite,
      matched: Boolean(matchedAgencyId),
    };
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
      .select("id, inviter_id, agency_id, status")
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

    if (invite.agency_id) {
      const { error: unlinkErr } = await supabaseAdmin
        .from("profiles")
        .update({ agency_id: null, agency_access: null })
        .eq("id", userId)
        .eq("agency_id", invite.agency_id);
      if (unlinkErr) throw unlinkErr;
    }
    return { ok: true };
  });

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
    if (
      invite.agency_id &&
      invite.agency_id !== userId &&
      invite.agency_email.toLowerCase() !== email
    ) {
      throw new Error("This invite is for a different account");
    }

    // Current user must be an agency account
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_type")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.account_type !== "agency") {
      throw new Error("Only agency accounts can accept invites");
    }

    // Link the inviter's standard workspace to this agency
    const { error: linkErr } = await supabaseAdmin
      .from("profiles")
      .update({ agency_id: userId, agency_access: invite.access_level })
      .eq("id", invite.inviter_id);
    if (linkErr) throw linkErr;

    const { error: updErr } = await supabaseAdmin
      .from("agency_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        agency_id: userId,
      })
      .eq("id", invite.id);
    if (updErr) throw updErr;

    return { ok: true };
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
