import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

/**
 * Attaches the caller's JWT to every server function call.
 *
 * Registered once as a global `functionMiddleware` in src/start.ts, so
 * individual server functions cannot forget it.
 */
export const attachAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const { getAuthToken } = await import('./client');
  const token = await getAuthToken().catch(() => null);
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

/**
 * Requires a verified session and opens a tenant-scoped database connection.
 *
 * Every server function that touches user data must list this in
 * `.middleware([...])`. It provides `context.db`, which is bound to this
 * user's row level security scope — there is no unscoped client in context,
 * so a handler cannot accidentally query across tenants the way the Supabase
 * previous implementation did with its service-role client.
 */
export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers?.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Unauthorized');
  }

  const { verifyAuthToken } = await import('./verify.server');
  const { withUser } = await import('@/db');

  let claims;
  try {
    claims = await verifyAuthToken(token);
  } catch {
    // Never surface the verification reason: it tells an attacker whether a
    // token was expired, malformed or signed by the wrong key.
    throw new Error('Unauthorized');
  }

  return withUser(claims.userId, claims.email, (db) =>
    next({
      context: {
        db,
        userId: claims.userId,
        email: claims.email,
        activeOrganizationId: claims.activeOrganizationId,
      },
    }),
  );
});

/**
 * Resolves the organization a request is acting on, and proves membership.
 *
 * Callers pass an organization id, but it is never trusted on its own — the
 * `app.is_member` check runs inside the database against neon_auth.member.
 * Row level security would block the data anyway; this turns a silent empty
 * result into an explicit error.
 */
export type WorkspaceAccess = {
  organizationId: string;
  /** 'full' for a member; whatever the client granted for a managing agency. */
  level: "full" | "names_only" | "metrics_only";
  /** True when the caller belongs to the workspace rather than managing it. */
  viaMembership: boolean;
};

/**
 * Resolves what the caller may see in a workspace.
 *
 * requireOrganization answers only "are you a member", which throws for an
 * agency managing a workspace it does not belong to — so the agency read policy
 * on leads was unreachable through the server functions, and the access level
 * the client chose was never consulted by anything but browser code.
 *
 * Membership wins: someone who belongs to a workspace sees all of it. The level
 * applies to an agency that manages the workspace from outside. Note that an
 * agency which co-owns a workspace it built is a member, so no level restricts
 * it — ownership is the broader grant, and pretending otherwise would be the
 * same false promise in a new place.
 */
export async function resolveWorkspaceAccess(
  db: { one: <T>(text: string, params?: unknown[]) => Promise<T | null> },
  organizationId: string | null | undefined,
): Promise<WorkspaceAccess> {
  if (!organizationId) throw new Error('No organization selected');

  const member = await db.one<{ ok: boolean }>('SELECT app.is_member($1) AS ok', [organizationId]);
  if (member?.ok) return { organizationId, level: 'full', viaMembership: true };

  const agency = await db.one<{ level: string | null }>(
    'SELECT app.agency_access_level($1) AS level',
    [organizationId],
  );
  if (!agency?.level) throw new Error('Forbidden');

  const level =
    agency.level === 'names_only' || agency.level === 'metrics_only' ? agency.level : 'full';
  return { organizationId, level, viaMembership: false };
}

export async function requireOrganization(
  db: { one: <T>(text: string, params?: unknown[]) => Promise<T | null> },
  organizationId: string | null | undefined,
): Promise<string> {
  if (!organizationId) {
    throw new Error('No organization selected');
  }

  const row = await db.one<{ ok: boolean }>('SELECT app.is_member($1) AS ok', [organizationId]);
  if (!row?.ok) {
    throw new Error('Forbidden');
  }

  return organizationId;
}
