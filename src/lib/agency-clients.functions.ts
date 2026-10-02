import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * The agency-to-client relationship: an agency managing another organization's
 * workspace. This is the genuinely agency-specific half — everything about
 * workspace membership lives in organization-members.functions.ts.
 */

/**
 * How much of a client workspace the managing agency can see.
 *
 * These are the three levels the UI has always offered. The column used to
 * store only two, so a form casting its value saved "Limited" as "full".
 */
export type AccessLevel = "full" | "names_only" | "metrics_only";

/** Narrows anything arriving from a client to a level the database accepts. */
export function toAccessLevel(value: unknown): AccessLevel {
  return value === "names_only" || value === "metrics_only" ? value : "full";
}

export const inviteClientWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      email: string;
      accessLevel?: AccessLevel;
      organizationId: string;
      workspaceName?: string;
      ownerName?: string;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      const email = String(data?.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) throw new Error("A valid email is required");
      // The form has always required a workspace name; until now it was thrown
      // away here, which left signup with nothing to name the organization.
      const workspaceName = String(data?.workspaceName ?? "").trim().slice(0, 120);
      if (!workspaceName) throw new Error("A workspace name is required");
      return {
        email,
        accessLevel: toAccessLevel(data.accessLevel),
        organizationId: data.organizationId,
        workspaceName,
        ownerName: String(data?.ownerName ?? "").trim().slice(0, 120) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const agencyRow = await context.db.one<{ name: string }>(
      `SELECT app.organization_name($1) AS name`,
      [orgId],
    );
    const agencyName = agencyRow?.name ?? null;

    const rows = await context.db.sql<{ id: string }>(
      `INSERT INTO public.agency_client_invites
         (agency_org_id, client_email, access_level, inviter_id,
          client_workspace_name, client_owner_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [orgId, data.email, data.accessLevel, context.userId,
       data.workspaceName, data.ownerName],
    );
    if (rows.length === 0) throw new Error("Only owners and admins can invite clients");

    // clientInvite, not the generic invite: /signup reads this parameter to
    // decide the account type, and `invite` forces an agency account — which
    // signs the invited company up as an agency.
    const link = `${process.env.SITE_URL ?? ""}/signup?clientInvite=${rows[0].id}`;

    const { sendClientSignupInvite } = await import("./email.server");
    const sent = await sendClientSignupInvite({
      inviteId: rows[0].id,
      organizationId: orgId,
      to: data.email,
      fromName: agencyName ?? "Your agency",
      url: link,
    });
    if (!sent.ok) console.error(`[client-invite] send failed for ${data.email}: ${sent.error}`);

    return { ok: true, inviteId: rows[0].id, link, emailSent: sent.ok };
  });



/**
 * The agencies managing this workspace — the relationship read from the
 * client's side rather than the agency's.
 *
 * Only pending invitations were ever surfaced, so once a client accepted, the
 * agency holding access to their leads disappeared from the account page
 * entirely. The RLS policy on agency_clients already allows either side to
 * read the link, so this needs no new privileges.
 *
 * The agency's owner is deliberately not returned. app.org_owner resolves only
 * for an organization the caller belongs to or manages, and widening it so a
 * client could read a person at the agency is a privacy decision, not a
 * display one.
 */
const INVITE_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What an invite link should say before the recipient has an account.
 *
 * Unauthenticated by necessity: the invitee arrives with no session, so the
 * read policy on agency_client_invites — which matches on membership or on the
 * caller's verified email — cannot resolve for them. The token is the
 * credential, exactly as it is for the link itself.
 *
 * Returns the invited address so signup can fill it in. The server already
 * refuses to accept an invitation under any other address, so making the
 * recipient retype it only creates a way to get it wrong — someone who typed a
 * different address got an account and no workspace. The token is the
 * credential here, exactly as it is for the link itself; anyone holding it
 * holds the message that was sent to that address.
 */
export const lookupClientInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => {
    const token = String(data?.token ?? "").trim();
    if (!INVITE_TOKEN_RE.test(token)) throw new Error("invalid token");
    return { token };
  })
  .handler(async ({ data }): Promise<{
    valid: boolean;
    workspaceName: string | null;
    agencyName: string | null;
    email: string | null;
  }> => {
    const { withOwner } = await import("@/db");
    const row = await withOwner((db) =>
      db.one<{ workspaceName: string | null; agencyName: string | null; email: string }>(
        `SELECT ci.client_workspace_name AS "workspaceName",
                o.name                   AS "agencyName",
                ci.client_email          AS "email"
           FROM public.agency_client_invites ci
           JOIN neon_auth."organization" o ON o.id = ci.agency_org_id
          WHERE ci.id = $1
            AND ci.status = 'pending'
            AND ci.expires_at > now()`,
        [data.token],
      ),
    );
    if (!row) return { valid: false, workspaceName: null, agencyName: null, email: null };
    return {
      valid: true,
      workspaceName: row.workspaceName,
      agencyName: row.agencyName,
      email: row.email,
    };
  });

export const listManagingAgencies = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const agencies = await context.db.sql<{
      id: string;
      name: string;
      accessLevel: AccessLevel;
      linkedAt: string;
    }>(
      `SELECT ac.agency_org_id                        AS "id",
              app.organization_name(ac.agency_org_id) AS "name",
              ac.access_level                         AS "accessLevel",
              ac.created_at                           AS "linkedAt"
         FROM public.agency_clients ac
        WHERE ac.client_org_id = $1
     ORDER BY 2`,
      [orgId],
    );

    return { agencies };
  });

/**
 * Attaches a workspace the agency has just created to that agency.
 *
 * Split from creating the organization because Better Auth owns organization
 * creation and runs it from the browser against the caller's session; this half
 * is ours. The insert is gated by the agency_clients_manage policy, which
 * already allows an agency's owners and admins to add a link without the client
 * being involved — nothing new is granted here.
 */
export const linkClientWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: { organizationId: string; clientOrgId: string; accessLevel?: AccessLevel }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      if (!data?.clientOrgId) throw new Error("clientOrgId is required");
      return {
        organizationId: data.organizationId,
        clientOrgId: data.clientOrgId,
        accessLevel: toAccessLevel(data.accessLevel),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const agencyOrgId = await requireOrganization(context.db, data.organizationId);

    // DO NOTHING rather than DO UPDATE: app_user is granted SELECT, INSERT and
    // DELETE on this table but deliberately not UPDATE, so an upsert is refused
    // outright by the grant, before any policy is consulted.
    const rows = await context.db.sql<{ client_org_id: string }>(
      `INSERT INTO public.agency_clients (agency_org_id, client_org_id, access_level, claimed_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (agency_org_id, client_org_id) DO NOTHING
       RETURNING client_org_id`,
      [agencyOrgId, data.clientOrgId, data.accessLevel],
    );
    if (rows.length > 0) {
      // Better Auth made the creator the owner. The agency must never hold that
      // on a client's workspace, so step down to admin the moment the link
      // exists — leaving the workspace ownerless until its client accepts.
      await context.db.sql(`SELECT app.demote_agency_creator($1)`, [data.clientOrgId]);
      return { ok: true, clientOrgId: rows[0].client_org_id };
    }

    // No row can mean the link already existed, or that the policy refused it.
    // Only the first is success, so distinguish them rather than guessing.
    const existing = await context.db.one<{ client_org_id: string }>(
      `SELECT client_org_id FROM public.agency_clients
        WHERE agency_org_id = $1 AND client_org_id = $2`,
      [agencyOrgId, data.clientOrgId],
    );
    if (!existing) throw new Error("Only owners and admins can add a client workspace");

    return { ok: true, clientOrgId: existing.client_org_id };
  });

/**
 * Invites the client into a workspace the agency already built for them.
 *
 * The role is owner, not member: this is handing someone their own workspace,
 * not adding a teammate to the agency's. app.create_invitation checks the
 * caller holds owner or admin on that workspace, which the agency does because
 * it created it — so no privilege is added here either.
 *
 * The recipient follows an ordinary member-invite link, which joins the
 * existing workspace rather than creating a second one.
 */
export const inviteClientOwner = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { clientOrgId: string; email: string }) => {
    if (!data?.clientOrgId) throw new Error("clientOrgId is required");
    const email = String(data?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("A valid email is required");
    return { clientOrgId: data.clientOrgId, email };
  })
  .handler(async ({ data, context }) => {
    // Membership in the workspace is what authorises the invite, so prove it
    // before the function that would otherwise raise a bare SQL exception.
    const orgId = await requireOrganization(context.db, data.clientOrgId);

    const existing = await context.db.one<{ id: string }>(
      `SELECT id FROM app.org_members
        WHERE organization_id = $1 AND lower(email) = $2`,
      [orgId, data.email],
    );
    if (existing) throw new Error("That person already has access to this workspace");

    const invite = await context.db.one<{ id: string }>(
      `SELECT app.create_invitation($1, $2, 'owner') AS id`,
      [orgId, data.email],
    );

    const link = `${process.env.SITE_URL ?? ""}/signup?memberInvite=${invite!.id}`;

    const names = await context.db.one<{ workspace: string; agency: string | null }>(
      `SELECT app.organization_name($1) AS workspace,
              (SELECT app.organization_name(ac.agency_org_id)
                 FROM public.agency_clients ac
                WHERE ac.client_org_id = $1 LIMIT 1) AS agency`,
      [orgId],
    );

    const { sendWorkspaceOwnerInvite } = await import("./email.server");
    const sent = await sendWorkspaceOwnerInvite({
      inviteId: invite!.id,
      organizationId: orgId,
      to: data.email,
      fromName: names?.agency ?? "Your agency",
      workspaceName: names?.workspace ?? "Your workspace",
      url: link,
    });
    if (!sent.ok) console.error(`[client-owner-invite] send failed for ${data.email}: ${sent.error}`);

    return { ok: true, inviteId: invite!.id, link, emailSent: sent.ok };
  });

/**
 * Sets what the managing agency may see in this workspace.
 *
 * Only the client's own owners and admins may call it, enforced inside
 * app.set_agency_access — an agency cannot widen its own access. Until now the
 * picker only moved React state, so reloading the page restored "Full access".
 */
export const setAgencyAccess = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; accessLevel: AccessLevel }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return { organizationId: data.organizationId, accessLevel: toAccessLevel(data.accessLevel) };
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    await context.db.sql(`SELECT app.set_agency_access($1, $2)`, [orgId, data.accessLevel]);
    return { ok: true, accessLevel: data.accessLevel };
  });

export const listAgencyClients = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    // Lead counts come back in the same statement rather than a second query
    // plus a JavaScript grouping pass.
    const clients = await context.db.sql<{
      id: string;
      name: string;
      ownerName: string;
      ownerEmail: string;
      leadsCount: string;
      wonCount: string;
      agencyAccess: AccessLevel;
      claimed: boolean;
    }>(
      `SELECT ac.client_org_id                       AS "id",
              app.organization_name(ac.client_org_id) AS "name",
              COALESCE(owner.name, '')               AS "ownerName",
              COALESCE(owner.email, '')              AS "ownerEmail",
              COALESCE(stats.total, 0)               AS "leadsCount",
              COALESCE(stats.won, 0)                 AS "wonCount",
              ac.access_level                        AS "agencyAccess",
              (ac.claimed_at IS NOT NULL)            AS "claimed"
         FROM public.agency_clients ac
    LEFT JOIN LATERAL app.org_owner(ac.client_org_id) owner ON true
    LEFT JOIN LATERAL (
              SELECT count(*) AS total,
                     count(*) FILTER (WHERE l.stage = 'won') AS won
                FROM public.leads l
               WHERE l.organization_id = ac.client_org_id
         ) stats ON true
        WHERE ac.agency_org_id = $1
     ORDER BY 2`,
      [orgId],
    );

    return {
      clients: clients.map((c) => {
        const total = Number(c.leadsCount);
        return {
          id: c.id,
          name: c.name,
          claimed: c.claimed,
          // While unclaimed the only owner is whoever at the agency created it,
          // so there is no client contact to show yet.
          ownerName: c.claimed ? c.ownerName || c.ownerEmail : "",
          ownerEmail: c.claimed ? c.ownerEmail : "",
          monthlyReferralFee: 0,
          currency: "EUR" as const,
          leadsCount: total,
          conversionRate: total > 0 ? Number(c.wonCount) / total : 0,
          agencyAccess: c.agencyAccess,
        };
      }),
    };
  });
