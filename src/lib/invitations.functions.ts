import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";
import type { AccessLevel } from "./agency-clients.functions";

/**
 * The invitation lifecycle, shared by both kinds of invite.
 *
 * Deliberately not split by kind: `acceptInvite` has to resolve a token that
 * might be either a membership invitation (neon_auth.invitation) or an
 * agency-to-client invitation (public.agency_client_invites), because the
 * recipient follows one link and should not need to know which it is.
 */

export type InviteRow = {
  id: string;
  /** The invitation id doubles as the signup token. */
  token: string;
  email: string;
  role: string;
  status: string;
  /**
   * node-postgres maps timestamptz to a Date, not a string — the previous
   * `string` here was a lie the compiler had no way to catch, and calling
   * localeCompare on it threw at runtime.
   */
  expires_at: string | Date;
  created_at: string | Date;
  /** The organization that sent the invitation. */
  organization_name: string | null;
  kind: string;
  /** No delivery pipeline yet — see inviteOrganizationMember. */
  email_status: string;
  email_error: string | null;
};

/**
 * The organization the caller is acting in.
 *
 * Deliberately has no fallback to context.activeOrganizationId. Neon's hosted
 * Better Auth persists session.activeOrganizationId but never mints it into
 * the JWT, so that claim is always null — a fallback onto it converts a
 * missing argument into a silent "No organization selected" at runtime.
 * Requiring the id makes the same mistake a type error instead.
 */
async function activeOrg(
  db: { one: <T>(t: string, p?: unknown[]) => Promise<T | null> },
  organizationId: string,
): Promise<string> {
  return requireOrganization(db, organizationId);
}

/** Tolerates either shape, so a driver or serializer change cannot break sorting. */
function millis(value: string | Date): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export const listSentInvites = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const [memberInvites, clientInvites] = await Promise.all([
      context.db.sql<InviteRow>(
        `SELECT i.id, i.id::text AS token, i.email, i.role, i.status,
                i.expires_at, i.created_at,
                i.organization_name,
                'member' AS kind, 'not_sent' AS email_status, NULL AS email_error
           FROM app.org_invitations i
          WHERE i.organization_id = $1`,
        [orgId],
      ),
      context.db.sql<InviteRow>(
        `SELECT ci.id, ci.id::text AS token, ci.client_email AS email, ci.access_level AS role, ci.status,
                ci.expires_at, ci.created_at,
                app.organization_name(ci.agency_org_id) AS organization_name,
                'client' AS kind, 'not_sent' AS email_status, NULL AS email_error
           FROM public.agency_client_invites ci
          WHERE ci.agency_org_id = $1`,
        [orgId],
      ),
    ]);

    const invites = [...memberInvites, ...clientInvites].sort(
      (a, b) => millis(b.created_at) - millis(a.created_at),
    );
    return { invites };
  });

export const listReceivedInvites = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((): Record<string, never> => ({}))
  .handler(async ({ context }): Promise<{ invites: InviteRow[] }> => {
    const email = (context.email ?? "").toLowerCase();
    if (!email) return { invites: [] };

    // Better Auth invitations are readable by address; the agency-client ones
    // are filtered by the same address inside their policy.
    const [memberInvites, clientInvites] = await Promise.all([
      context.db.sql<InviteRow>(
        `SELECT i.id, i.id::text AS token, i.email, i.role, i.status,
                i.expires_at, i.created_at,
                i.organization_name,
                'member' AS kind, 'not_sent' AS email_status, NULL AS email_error
           FROM app.org_invitations i
          WHERE lower(i.email) = $1 AND i.status = 'pending'`,
        [email],
      ),
      context.db.sql<InviteRow>(
        `SELECT ci.id, ci.id::text AS token,
                ci.client_email AS email,
                ci.access_level AS role, ci.status,
                ci.expires_at, ci.created_at,
                app.organization_name(ci.agency_org_id) AS organization_name,
                'client' AS kind, 'not_sent' AS email_status, NULL AS email_error
           FROM public.agency_client_invites ci
          WHERE ci.status = 'pending'
            AND ci.expires_at > now()
            -- The read policy also exposes invites this user's own agency
            -- SENT, so "received" has to narrow to their own address.
            AND lower(ci.client_email) = $1`,
        [email],
      ),
    ]);

    return { invites: [...memberInvites, ...clientInvites] };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { token: string }) => {
    if (!data?.token) throw new Error("token is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const email = (context.email ?? "").toLowerCase();

    // Membership invitation first. The function verifies the invite is pending,
    // unexpired, and addressed to this caller's own verified email.
    const accepted = await context.db.one<{ org: string | null }>(
      `SELECT app.accept_invitation($1) AS org`,
      [data.token],
    );
    if (accepted?.org) {
      return { ok: true, kind: "member" as const, organizationId: accepted.org };
    }

    // Otherwise an agency-to-client invitation.
    const clientInvite = await context.db.one<{ agency_org_id: string; access_level: AccessLevel }>(
      `SELECT agency_org_id, access_level
         FROM public.agency_client_invites
        WHERE id = $1 AND status = 'pending' AND expires_at > now()
          AND lower(client_email) = $2`,
      [data.token, email],
    );
    if (!clientInvite) throw new Error("Invite not found or expired");

    const myOrg = await context.db.one<{ id: string }>(
      `SELECT id FROM app.organizations
        WHERE my_role = 'owner' ORDER BY created_at LIMIT 1`,
      [],
    );
    if (!myOrg) throw new Error("Create a workspace before accepting an agency invite");

    // DO NOTHING rather than DO UPDATE: re-accepting an invite should be a
    // no-op, and an UPDATE would require a grant the accepting client has no
    // reason to hold.
    await context.db.sql(
      `INSERT INTO public.agency_clients (agency_org_id, client_org_id, access_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (agency_org_id, client_org_id) DO NOTHING`,
      [clientInvite.agency_org_id, myOrg.id, clientInvite.access_level],
    );
    await context.db.sql(
      `UPDATE public.agency_client_invites
          SET status = 'accepted', accepted_at = now() WHERE id = $1`,
      [data.token],
    );

    return { ok: true, kind: "client" as const, organizationId: myOrg.id };
  });

export const declineInvite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const email = (context.email ?? "").toLowerCase();
    await context.db.sql(`SELECT app.set_invitation_status($1, 'rejected')`, [data.id]);
    await context.db.sql(
      `UPDATE public.agency_client_invites SET status = 'revoked'
        WHERE id = $1 AND lower(client_email) = $2 AND status = 'pending'`,
      [data.id, email],
    );
    return { ok: true };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    // Both updates are policy-gated to owners and admins of the inviting org,
    // so an id belonging to someone else simply matches no rows.
    await context.db.sql(`SELECT app.set_invitation_status($1, 'canceled')`, [data.id]);
    await context.db.sql(
      `UPDATE public.agency_client_invites SET status = 'revoked'
        WHERE id = $1 AND status = 'pending'`,
      [data.id],
    );
    return { ok: true };
  });
