import pg from 'pg';

// Single pool for the process. Neon's pooled endpoint handles the rest.
let _pool: pg.Pool | undefined;

function pool(): pg.Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing DATABASE_URL. Set it in .env.local (see neon/README.md).');
    }
    _pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return _pool;
}

/**
 * A connection scoped to one request.
 *
 * `sql` is the only way the application talks to Postgres. Callers cannot
 * reach the underlying client, so they cannot escape the role and GUCs that
 * were set for them.
 */
export type Db = {
  sql<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
};

type Scope =
  | { role: 'app_user'; userId: string; email: string | null }
  | { role: 'app_ingest'; organizationId: string }
  | { role: 'owner' };

async function withScope<T>(scope: Scope, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');

    // SET LOCAL binds these to the transaction, so a pooled connection handed
    // to the next request can never inherit the previous user's identity.
    if (scope.role === 'app_user') {
      await client.query('SET LOCAL ROLE app_user');
      await client.query('SELECT set_config($1, $2, true)', ['app.user_id', scope.userId]);
      // Some policies match an invitation by the address Better Auth verified.
      await client.query('SELECT set_config($1, $2, true)', ['app.user_email', scope.email ?? '']);
    } else if (scope.role === 'app_ingest') {
      await client.query('SET LOCAL ROLE app_ingest');
      await client.query('SELECT set_config($1, $2, true)', ['app.ingest_org', scope.organizationId]);
    }
    // scope.role === 'owner' stays as the connection role: RLS does not apply.

    const db: Db = {
      async sql(text, params) {
        const res = await client.query(text, params as unknown[]);
        return res.rows;
      },
      async one(text, params) {
        const res = await client.query(text, params as unknown[]);
        return res.rows[0] ?? null;
      },
    };

    const result = await fn(db);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run queries as an authenticated end user.
 *
 * Row level security restricts every statement to organizations this user is
 * a member of. A query that forgets its tenant filter returns nothing rather
 * than another tenant's rows, so correctness here does not depend on the
 * caller remembering to filter.
 */
export function withUser<T>(
  userId: string,
  email: string | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  return withScope({ role: 'app_user', userId, email }, fn);
}

/**
 * Run queries as the public lead collector. Insert-only, and only into the
 * organization its ingest key resolved to.
 */
export function withIngest<T>(organizationId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return withScope({ role: 'app_ingest', organizationId }, fn);
}

/**
 * Run queries with row level security bypassed.
 *
 * Only for work with no user in scope: resolving an ingest key, reading ad
 * platform credentials to upload a conversion, scheduled jobs. Never reachable
 * from a request whose tenant comes from client input — that was the flaw in
 * the Supabase implementation, where every query ran this way.
 */
export function withOwner<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return withScope({ role: 'owner' }, fn);
}

/** Resolve a tracker's ingest key to an organization. Returns null if unknown. */
export async function resolveIngestKey(ingestKey: string): Promise<string | null> {
  const row = await withOwner((db) =>
    db.one<{ organization_id: string }>(
      'SELECT organization_id FROM public.organization_settings WHERE ingest_key = $1',
      [ingestKey],
    ),
  );
  return row?.organization_id ?? null;
}
