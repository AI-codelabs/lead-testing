import { withOwner } from "@/db";

/**
 * Outbound email, via Resend.
 *
 * Called with fetch rather than the Resend SDK: one HTTP POST does not justify
 * a dependency, and the server bundle stays smaller.
 *
 * Every send is recorded against the invite id in public.invite_email_log, so
 * invite history can report what happened instead of the hardcoded "not sent"
 * it used to show. The write runs on the owner connection — app_user has no
 * INSERT on that table, so a client cannot fabricate a delivery record.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendResult = {
  ok: boolean;
  /** Resend's own id for the message, useful when chasing a delivery. */
  providerId?: string;
  error?: string;
};

function config(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  // A verified sender on the account's own domain; Resend rejects anything else.
  const from = process.env.EMAIL_FROM || "Leadlogr <invites@leadlogr.com>";
  return { apiKey, from };
}

/** True when email is configured at all, so callers can say so honestly. */
export function emailEnabled(): boolean {
  return config() !== null;
}

async function send(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "email_not_configured" };

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text }),
    });

    const body = (await resp.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!resp.ok) {
      return { ok: false, error: body.message || `http_${resp.status}` };
    }
    return { ok: true, providerId: body.id };
  } catch (err) {
    // A send failing must never fail the invite: the link still works, and the
    // inviter can pass it on by hand.
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

async function record(row: {
  inviteId: string;
  organizationId: string;
  email: string;
  result: SendResult;
}): Promise<void> {
  try {
    await withOwner((db) =>
      db.sql(
        `INSERT INTO public.invite_email_log
           (invite_id, organization_id, email, status, provider_id, error)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (invite_id) DO UPDATE SET
           status      = EXCLUDED.status,
           provider_id = EXCLUDED.provider_id,
           error       = EXCLUDED.error,
           created_at  = now()`,
        [
          row.inviteId,
          row.organizationId,
          row.email,
          row.result.ok ? "sent" : "failed",
          row.result.providerId ?? null,
          row.result.error ?? null,
        ],
      ),
    );
  } catch (err) {
    console.error("[email] could not record delivery", err);
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One layout for every invite we send.
 *
 * Deliberately plain HTML with inline styles: email clients strip stylesheets,
 * and Outlook ignores most of what survives. The link is also shown as text,
 * because a button that does not render leaves the recipient with nothing.
 */
function layout(opts: { heading: string; body: string; cta: string; url: string }): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0c1b2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d5dfea;border-radius:12px;padding:32px">
        <tr><td>
          <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6d7f95;font-weight:600">Leadlogr</div>
          <h1 style="margin:14px 0 10px;font-size:23px;line-height:1.25;color:#0c1b2e">${esc(opts.heading)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a5d75">${opts.body}</p>
          <a href="${esc(opts.url)}" style="display:inline-block;background:#1c4e9e;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(opts.cta)}</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6d7f95">
            If the button does not work, paste this into your browser:<br>
            <span style="color:#1c4e9e;word-break:break-all">${esc(opts.url)}</span>
          </p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#6d7f95;text-align:center">
        You received this because someone invited you to a Leadlogr workspace. If you were not expecting it, ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

type InviteEmail = {
  inviteId: string;
  organizationId: string;
  to: string;
  /** The workspace or agency doing the inviting. */
  fromName: string;
  url: string;
};

/** Someone is being added to a workspace that already exists. */
export async function sendTeammateInvite(opts: InviteEmail): Promise<SendResult> {
  const result = await send(
    opts.to,
    `You have been invited to ${opts.fromName} on Leadlogr`,
    layout({
      heading: `Join ${esc(opts.fromName)}`,
      body: `You have been invited to the <strong>${esc(opts.fromName)}</strong> workspace on Leadlogr, where the team tracks its leads and what they turn into.`,
      cta: "Join the workspace",
      url: opts.url,
    }),
    `You have been invited to ${opts.fromName} on Leadlogr.\n\nJoin here: ${opts.url}`,
  );
  await record({ inviteId: opts.inviteId, organizationId: opts.organizationId, email: opts.to, result });
  return result;
}

/** An agency built a workspace and is handing it to its client. */
export async function sendWorkspaceOwnerInvite(
  opts: InviteEmail & { workspaceName: string },
): Promise<SendResult> {
  const result = await send(
    opts.to,
    `${opts.workspaceName} is ready for you on Leadlogr`,
    layout({
      heading: `${esc(opts.workspaceName)} is ready`,
      body: `<strong>${esc(opts.fromName)}</strong> has set up the <strong>${esc(opts.workspaceName)}</strong> workspace for you on Leadlogr. Create your account to take ownership of it — you will be its owner, and you decide what the agency can see.`,
      cta: "Claim your workspace",
      url: opts.url,
    }),
    `${opts.fromName} has set up ${opts.workspaceName} for you on Leadlogr.\n\nClaim it here: ${opts.url}`,
  );
  await record({ inviteId: opts.inviteId, organizationId: opts.organizationId, email: opts.to, result });
  return result;
}

/** An agency inviting a company that has no workspace yet. */
export async function sendClientSignupInvite(opts: InviteEmail): Promise<SendResult> {
  const result = await send(
    opts.to,
    `${opts.fromName} invited you to Leadlogr`,
    layout({
      heading: "You have been invited to Leadlogr",
      body: `<strong>${esc(opts.fromName)}</strong> would like to manage your lead tracking in Leadlogr. Create your workspace to get started — you stay its owner, and you choose how much the agency can see.`,
      cta: "Create your workspace",
      url: opts.url,
    }),
    `${opts.fromName} invited you to Leadlogr.\n\nGet started here: ${opts.url}`,
  );
  await record({ inviteId: opts.inviteId, organizationId: opts.organizationId, email: opts.to, result });
  return result;
}
