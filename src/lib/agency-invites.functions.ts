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
}) {
  const { inviterWorkspace, inviterEmail, acceptUrl, accessLabel } = opts;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#0a0a0a;padding:24px;">
  <div style="max-width:520px;margin:0 auto;">
    <h1 style="font-size:22px;margin:0 0 16px;">You've been invited to Leadlogr</h1>
    <p style="font-size:14px;line-height:1.5;color:#444;">
      <strong>${inviterWorkspace}</strong> (${inviterEmail}) invited your agency to manage their Leadlogr workspace
      with <strong>${accessLabel}</strong> access.
    </p>
    <p style="font-size:14px;line-height:1.5;color:#444;">
      Click below to create your Leadlogr agency account and accept the invite:
    </p>
    <p style="margin:24px 0;">
      <a href="${acceptUrl}" style="background:#0a0a0a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block;">Accept invitation</a>
    </p>
    <p style="font-size:12px;color:#999;">If you weren't expecting this, you can ignore this email. The link expires in 14 days.</p>
  </div></body></html>`;
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

    // Use admin client to look up existing agency profile by email (auth.users lookup)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingUser } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    let matchedAgencyId: string | null = null;
    if (existingUser?.id) {
      const { data: agencyProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, account_type")
        .eq("id", existingUser.id)
        .maybeSingle();
      if (agencyProfile?.account_type === "agency") {
        matchedAgencyId = agencyProfile.id;
      }
    }

    const token = makeToken();
    const { data: invite, error: insertErr } = await supabase
      .from("agency_invites")
      .insert({
        inviter_id: userId,
        inviter_workspace_name: inviterProfile.workspace_name,
        inviter_email: inviterEmail,
        agency_email: normalizedEmail,
        agency_id: matchedAgencyId,
        access_level: data.accessLevel,
        token,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // If agency does NOT exist yet, send signup email via queue
    if (!matchedAgencyId) {
      const siteUrl =
        process.env.SITE_URL ||
        process.env.VITE_SITE_URL ||
        "https://lead-testing.lovable.app";
      const acceptUrl = `${siteUrl}/signup?invite=${token}`;
      const accessLabel =
        data.accessLevel === "full"
          ? "full"
          : data.accessLevel === "names_only"
            ? "limited (names only)"
            : "metrics-only";
      const html = buildInviteEmailHtml({
        inviterWorkspace: inviterProfile.workspace_name,
        inviterEmail,
        acceptUrl,
        accessLabel,
      });

      const messageId = crypto.randomUUID();
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "agency_invite",
        recipient_email: normalizedEmail,
        status: "pending",
      });
      const { error: enqueueErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: normalizedEmail,
          from: `Leadlogr <noreply@notify.leadlogr.com>`,
          sender_domain: "notify.leadlogr.com",
          subject: `${inviterProfile.workspace_name} invited you to Leadlogr`,
          html,
          text: `${inviterProfile.workspace_name} invited your agency to Leadlogr. Accept: ${acceptUrl}`,
          purpose: "transactional",
          label: "agency_invite",
          queued_at: new Date().toISOString(),
        },
      });
      if (enqueueErr) {
        console.error("Failed to enqueue invite email", enqueueErr);
      }
    }

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

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agency_invites")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .eq("inviter_id", userId);
    if (error) throw error;
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
