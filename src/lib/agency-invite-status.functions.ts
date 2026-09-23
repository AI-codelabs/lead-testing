import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * Pending invitation counts for the badges in the agency UI.
 *
 * Both invitation kinds are counted in one round trip.
 */
export const listInviteStatuses = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const row = await context.db.one<{ pending_members: string; pending_clients: string }>(
      `SELECT
         (SELECT count(*) FROM neon_auth."invitation"
           WHERE "organizationId" = $1 AND status = 'pending')      AS pending_members,
         (SELECT count(*) FROM public.agency_client_invites
           WHERE agency_org_id = $1 AND status = 'pending')         AS pending_clients`,
      [orgId],
    );

    return {
      pendingMembers: Number(row?.pending_members ?? 0),
      pendingClients: Number(row?.pending_clients ?? 0),
    };
  });
