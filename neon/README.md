# Neon port

The app was built on Supabase (project `kxyzckxlazutdvvazvug`). This directory
moves the **database** to Neon. The application layer has not been ported yet.

- **Neon project:** `lead-testing` / `empty-mountain-75598862`, eu-central-1, PG 18
- **Status:** schema is live and verified. App still talks to Supabase.

## Running it

```bash
export DATABASE_URL='<neon connection string>'   # never commit this
cd neon/.tooling
node apply.mjs    # shim + all 16 migrations, one transaction per file
node smoke.mjs    # 8 functional checks
```

`apply.mjs` is **not** idempotent across runs, because the upstream migrations
aren't (`CREATE POLICY` without a guard). Re-running against a populated
database reports `already exists` failures. To start clean, drop and recreate
schemas `public, auth, pgmq, vault, net, shim, cron` plus the
`supabase_realtime` publication, then run once.

## What the shim does

`00_supabase_shim.sql` recreates the Supabase platform surface so the 16
migrations apply to plain Postgres **unmodified**.

| Surface | Treatment | Faithful? |
|---|---|---|
| `anon` / `authenticated` / `service_role` roles | real roles | yes |
| `auth.users` | real table (only the columns the app reads) | yes |
| `auth.uid()` | reads `request.jwt.claim.sub` GUC | yes |
| `auth.role()` | reads `request.jwt.claim.role` GUC, defaults `anon` | yes |
| `pgmq.{create,send,read,delete}` | table-backed queue on `pgmq.q` | yes |
| `supabase_realtime` publication | empty publication | inert |
| `net.http_post` | **stub** — writes to `shim.http_outbox`, sends nothing | **no** |
| `vault.*` | **stub** — plaintext table, not a secret store | **no** |
| `cron.unschedule` | **stub** — no-op | **no** |

`apply.mjs` also strips `CREATE EXTENSION` for `pg_net`, `supabase_vault`,
`pgmq` and `pg_cron`, which Neon rejects. The shim supplies those surfaces
instead.

The server must set both GUCs per request, or every RLS policy denies:

```sql
SET LOCAL request.jwt.claim.sub  = '<user uuid>';
SET LOCAL request.jwt.claim.role = 'authenticated';
```

## Verified

`smoke.mjs`, all passing against Neon:

1. `handle_new_user` fires on signup and creates the profile + `workspace_key`
2. `account_type` carries through from user metadata
3. agency signup auto-creates the owner `agency_members` row
4. `touch_updated_at` trigger fires on update
5. `pgmq` send + read round-trips
6. `pgmq` delete removes the message
7. RLS shows a tenant their own profile
8. RLS hides other tenants' rows

Result: 12 tables, 19 policies, RLS on all 12, 33 indexes, 7 triggers.

## Not ported

**Email delivery is dead under the shim.** The pipeline was
`pgmq` → `pg_cron` (poll) → `pg_net` (HTTP to the send endpoint), with
credentials in `supabase_vault`. Neon has `pg_cron` but only in the `postgres`
database, and has neither `pg_net` nor `vault`. Messages still *queue*
correctly; nothing drains them. Replace with an external worker — a Vercel Cron
route that calls `pgmq.read` / `pgmq.delete` and sends over HTTP — and move the
secrets to environment variables.

**Auth is still Supabase.** 9 call sites in `src/`:
`signUp`, `signInWithPassword`, `signOut`, `getUser`, `getSession`,
`getClaims`, `onAuthStateChange`. `auth.users` here is an inert table — nothing
issues or validates sessions. Needs Neon Auth (or another provider) wired to
populate `auth.users` and set the two GUCs per request.

**Data layer is still `supabase-js`** — 26 of 135 files in `src/` import the
client. Each `.from(...)` call needs replacing with SQL over `pg`/Drizzle, or a
PostgREST-compatible layer in front of Neon.

**No production data was copied.** Schema only.
