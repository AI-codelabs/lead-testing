# Audit — pre-rebuild state

Findings from the Supabase implementation, in severity order. Evidence is from
the live schema applied to Neon and from `src/`.

---

## 1. CRITICAL — 24 server functions have no authentication

Eight files expose `createServerFn` endpoints that take `workspaceKey` **from
the request body**, never verify the caller, and query through
`supabaseAdmin` — the service-role client, which carries `BYPASSRLS`.

| File | serverFns | with auth |
|---|---|---|
| `leads-read.functions.ts` | 2 | 0 |
| `leads-write.functions.ts` | 2 | 0 |
| `lead-stage.functions.ts` | 2 | 0 |
| `dashboard-metrics.functions.ts` | 2 | 0 |
| `google-ads-settings.functions.ts` | 7 | 0 |
| `meta-ads-settings.functions.ts` | 5 | 0 |
| `integration-status.functions.ts` | 2 | 0 |
| `leads.functions.ts` | 2 | 0 |

`getWorkspaceLeads` ([leads-read.functions.ts:31](../src/lib/leads-read.functions.ts))
validates only that `workspaceKey` is a string under 128 chars, then returns
every lead for it: name, email, phone, company, message, and the full
attribution record.

**Impact.** Anyone holding a `workspace_key` can read and write that tenant's
leads without logging in. The write paths (`leads-write`, `lead-stage`) allow
modification; `saveGoogleAdsSettings` and `saveMetaAdsSettings` allow
overwriting a tenant's conversion configuration.

**Is the key secret?** No. Format is `ws_<name-slug>_<8 hex>`. It is loaded into
the browser ([account-context.tsx:150](../src/lib/account-context.tsx)) and
passed as a parameter on every call, so it is visible in network traffic to
anyone with access to a session, permanently — it cannot be rotated. The 8 hex
characters resist blind brute force, but the key behaves as a non-expiring
bearer token with no authorization check behind it.

**Not exposed:** `oauth_refresh_token` and Meta `access_token` are excluded from
the returned projections — the read handlers map to `connected: boolean`. That
part was done carefully.

## 2. CRITICAL — RLS is enabled everywhere and enforces nothing

All 12 tables have `ENABLE ROW LEVEL SECURITY`. The five core business tables
have **zero policies**, which means deny-all:

`leads`, `conversion_uploads`, `google_ads_settings`, `meta_ads_settings`,
`google_ads_oauth_states`

The app never notices, because **every query runs through `supabaseAdmin`** and
bypasses RLS. Zero files use the user-scoped client. The 19 policies that do
exist (on `profiles`, `agency_*`, `email_*`) are therefore decorative.

`requireSupabaseAuth` ([auth-middleware.ts](../src/integrations/supabase/auth-middleware.ts))
builds a correctly user-scoped client and is applied to 12 call sites — all of
them in `agency-invites.functions.ts` and `agency-invite-status.functions.ts`.
Nothing else uses it, and even those files then query via `supabaseAdmin`
(61 references in `agency-invites.functions.ts` alone).

Net effect: **tenant isolation depends entirely on application code remembering
to write `.eq("workspace_key", ...)` on every query.** One omission is a
cross-tenant leak, and the database cannot catch it.

## 3. HIGH — tenancy keyed by an unenforced text column

`workspace_key text` is the tenancy discriminator on five tables, with **no
foreign key** anywhere (198 references in `src/`). Nothing prevents an orphaned
or mistyped key. `profiles.workspace_key` is the only unique copy.

## 4. HIGH — `profiles` conflates user and organization

`profiles.id` references `auth.users(id)`, so a profile *is* a user — yet
`agency_members.agency_id` and `agency_invites.agency_id` both reference
`profiles(id)`, so a profile is *also* an organization. A user and the agency
they own are the same row, which is why "agency" and "workspace" are used
interchangeably and inconsistently throughout the code.

## 5. MEDIUM — hand-rolled invites duplicate a solved problem

`agency_invites` (14 columns) implements tokens, status, expiry, inviter
tracking and email matching by hand, with 5 RLS policies and ~68 supabase
references in one file. Better Auth's organization plugin provides
`invitation` (id, organizationId, email, role, status, expiresAt, inviterId)
plus accept/revoke flows.

## 6. MEDIUM — `NOT NULL DEFAULT ''` across ~25 lead columns

Every attribution column defaults to empty string, so "no `gclid`" and "empty
`gclid`" are indistinguishable. Forces `<> ''` instead of `IS NOT NULL` and
makes partial indexes on attribution useless.

## 7. MEDIUM — `stage` is unconstrained text with inconsistent casing

`stage TEXT NOT NULL DEFAULT 'New'` has no CHECK or enum. The default is
capitalised; code elsewhere uses `new` / `qualified` / `won` / `lost`.

## 8. MEDIUM — email subsystem cannot run on Neon

Four tables and five functions built on `pgmq` + `pg_cron` + `pg_net` +
`supabase_vault`. Neon has `pg_cron` only in the `postgres` database and has
neither `pg_net` nor `vault`. Must move out of the database entirely.

## 9. LOW — hydration mismatch on every page

Server renders `<html>` without `className="dark"`; the client adds it
([__root.tsx:123](../src/routes/__root.tsx)). React discards the server tree and
re-renders, losing most of the SSR benefit.

## 10. LOW — production is missing configuration

The Vercel project has exactly 3 environment variables. Code requires
`LOVABLE_API_KEY`, `SITE_URL`, four `GOOGLE_ADS_OAUTH_*` values and
`STRIPE_SECRET_KEY`. Those paths cannot be working in the deployed app.

---

## What the rebuild changes

| Problem | Fix |
|---|---|
| 1, 2 | Every query runs on a **user-scoped** connection with `SET LOCAL` GUCs. RLS policies check membership in `neon_auth.member`. A forgotten filter leaks nothing. |
| 3 | `organization_id uuid REFERENCES neon_auth.organization(id)` replaces `workspace_key`. |
| 4 | Identity (`neon_auth.user`) and organization (`neon_auth.organization`) become separate, per Better Auth. |
| 5 | `agency_members` / `agency_invites` deleted; Better Auth's `member` / `invitation` take over. |
| 6 | Attribution columns become nullable. |
| 7 | `stage` becomes an enum. |
| 8 | Email tables dropped; sending moves to an app-level worker. |
