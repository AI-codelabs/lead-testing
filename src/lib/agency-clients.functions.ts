import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * The agency-to-client relationship: an agency managing another organization's
 * workspace. This is the genuinely agency-specific half — everything about
 * workspace membership lives in organization-members.functions.ts.
 */

/** How much of a client workspace the managing agency can see. */
export type AccessLevel = "full" | "read_only";

export const inviteClientWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: { email: string; accessLevel?: AccessLevel; organizationId: string }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      const email = String(data?.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) throw new Error("A valid email is required");
      return {
        email,
        accessLevel: data.accessLevel === "read_only" ? "read_only" : "full",
        organizationId: data.organizationId,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const rows = await context.db.sql<{ id: string }>(
      `INSERT INTO public.agency_client_invites
         (agency_org_id, client_email, access_level, inviter_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orgId, data.email, data.accessLevel, context.userId],
    );
    if (rows.length === 0) throw new Error("Only owners and admins can invite clients");

    const link = `${process.env.SITE_URL ?? ""}/signup?invite=${rows[0].id}`;
    console.info(`[client-invite] ${data.email} -> ${link}`);

    return { ok: true, inviteId: rows[0].id, link, emailSent: false };
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
    }>(
      `SELECT ac.client_org_id                       AS "id",
              app.organization_name(ac.client_org_id) AS "name",
              COALESCE(owner.name, '')               AS "ownerName",
              COALESCE(owner.email, '')              AS "ownerEmail",
              COALESCE(stats.total, 0)               AS "leadsCount",
              COALESCE(stats.won, 0)                 AS "wonCount",
              ac.access_level                        AS "agencyAccess"
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
          ownerName: c.ownerName || c.ownerEmail,
          ownerEmail: c.ownerEmail,
          monthlyReferralFee: 0,
          currency: "EUR" as const,
          leadsCount: total,
          conversionRate: total > 0 ? Number(c.wonCount) / total : 0,
          agencyAccess: c.agencyAccess,
        };
      }),
    };
  });
