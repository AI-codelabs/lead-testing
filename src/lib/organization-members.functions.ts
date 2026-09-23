import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * Members of a workspace.
 *
 * Nothing here is agency-specific: a company inviting a colleague and an
 * agency inviting a teammate take exactly the same path. Both resolve to
 * neon_auth.member, and the role checks live in app.create_invitation and
 * app.remove_member so they hold regardless of which UI made the call.
 */

export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const [members, pendingInvites] = await Promise.all([
      context.db.sql<{
        id: string;
        userId: string;
        role: string;
        email: string;
        name: string;
        joinedAt: string;
      }>(
        `SELECT m.id                  AS "id",
                m.user_id             AS "userId",
                m.role                AS "role",
                COALESCE(m.email, '') AS "email",
                COALESCE(m.name, '')  AS "name",
                m.created_at          AS "joinedAt"
           FROM app.org_members m
          WHERE m.organization_id = $1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                m.created_at`,
        [orgId],
      ),
      context.db.sql<{ id: string; email: string; status: string; createdAt: string }>(
        `SELECT i.id, i.email, i.status, i.created_at AS "createdAt"
           FROM app.org_invitations i
          WHERE i.organization_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
        [orgId],
      ),
    ]);

    return { members, pendingInvites };
  });

export const removeOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    // Ownership, role and the owner-protection rule are all enforced inside
    // app.remove_member, which runs with the privileges needed to touch
    // neon_auth without app_user being granted access to it.
    const row = await context.db.one<{ ok: boolean }>(
      `SELECT app.remove_member($1) AS ok`,
      [data.id],
    );
    if (!row?.ok) throw new Error("Member not found");
    return { ok: true };
  });

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { email: string; role?: string; organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    const email = String(data?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("A valid email is required");
    const role = data.role === "admin" ? "admin" : "member";
    return { email, role, organizationId: data.organizationId };
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const existing = await context.db.one<{ id: string }>(
      `SELECT id FROM app.org_members
        WHERE organization_id = $1 AND lower(email) = $2`,
      [orgId, data.email],
    );
    if (existing) throw new Error("That person is already on the team");

    // Role check lives inside the function, alongside the insert it guards.
    const invite = await context.db.one<{ id: string }>(
      `SELECT app.create_invitation($1, $2, $3) AS id`,
      [orgId, data.email, data.role],
    );

    // No email is sent yet: the queue this used to go through was Supabase
    // infrastructure and has not been replaced. The link is returned so the
    // inviter can pass it on, and logged for local development.
    const link = `${process.env.SITE_URL ?? ""}/signup?invite=${invite!.id}`;
    console.info(`[invite] ${data.email} -> ${link}`);

    return { ok: true, inviteId: invite!.id, link, emailSent: false };
  });
