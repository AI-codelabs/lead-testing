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
