// Proves the database enforces tenancy on its own.
// The queries below deliberately contain NO organization filter — the same
// mistake that would have leaked every tenant's leads under the old schema.
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const t = (n, ok, extra = '') =>
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

await c.query('GRANT app_user TO CURRENT_USER').catch(() => {});
await c.query('GRANT app_ingest TO CURRENT_USER').catch(() => {});

// --- seed two tenants directly in Better Auth's tables ---------------------
await c.query(`DELETE FROM neon_auth."member"`);
await c.query(`DELETE FROM neon_auth."organization"`);
await c.query(`DELETE FROM neon_auth."user"`);

const mk = async (name, email) => {
  const { rows: [u] } = await c.query(
    `INSERT INTO neon_auth."user" (id,name,email,"emailVerified","createdAt","updatedAt")
     VALUES (gen_random_uuid(),$1,$2,true,now(),now()) RETURNING id`, [name, email]);
  const { rows: [o] } = await c.query(
    `INSERT INTO neon_auth."organization" (id,name,slug,"createdAt")
     VALUES (gen_random_uuid(),$1,$2,now()) RETURNING id`, [name + ' Co', name.toLowerCase()]);
  await c.query(
    `INSERT INTO neon_auth."member" (id,"organizationId","userId",role,"createdAt")
     VALUES (gen_random_uuid(),$1,$2,'owner',now())`, [o.id, u.id]);
  await c.query(`INSERT INTO public.organization_settings (organization_id) VALUES ($1)`, [o.id]);
  await c.query(
    `INSERT INTO public.leads (organization_id,name,email,gclid,stage)
     VALUES ($1,$2,$3,$4,'new')`, [o.id, name + ' Lead', `lead@${name.toLowerCase()}.com`, 'GCL_' + name]);
  return { user: u.id, org: o.id };
};

const alpha = await mk('Alpha', 'owner@alpha.com');
const beta  = await mk('Beta',  'owner@beta.com');

const { rows: [all] } = await c.query('SELECT count(*)::int n FROM public.leads');
t('two tenants seeded', all.n === 2, `${all.n} leads total as owner`);

// --- as an end user, with NO tenant filter in the query --------------------
const asUser = async (userId, sql, params = []) => {
  await c.query('BEGIN');
  await c.query('SET LOCAL ROLE app_user');
  await c.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
  try { return (await c.query(sql, params)).rows; }
  finally { await c.query('COMMIT'); }
};

const alphaSees = await asUser(alpha.user, 'SELECT id, name FROM public.leads');
t('unfiltered SELECT returns only own tenant', alphaSees.length === 1, `${alphaSees.length} row(s)`);
t('and it is the right row', alphaSees[0]?.name === 'Alpha Lead', alphaSees[0]?.name);

const betaSees = await asUser(beta.user, 'SELECT id, name FROM public.leads');
t('other tenant sees only theirs', betaSees.length === 1 && betaSees[0].name === 'Beta Lead', betaSees[0]?.name);

// --- targeted cross-tenant read attempt ------------------------------------
const stolen = await asUser(alpha.user,
  'SELECT id FROM public.leads WHERE organization_id = $1', [beta.org]);
t('explicit cross-tenant read blocked', stolen.length === 0, `${stolen.length} row(s)`);

// --- cross-tenant write attempt --------------------------------------------
let wrote = 'blocked';
try {
  await asUser(alpha.user,
    `INSERT INTO public.leads (organization_id, name) VALUES ($1,'injected')`, [beta.org]);
  wrote = 'ALLOWED';
} catch { /* policy rejected it */ }
t('cross-tenant INSERT blocked', wrote === 'blocked', wrote);

// --- no session at all ------------------------------------------------------
const anon = await asUser('00000000-0000-0000-0000-000000000000', 'SELECT id FROM public.leads');
t('unknown user sees nothing', anon.length === 0, `${anon.length} row(s)`);

// --- credentials are unreachable by app_user --------------------------------
await c.query(`INSERT INTO public.ad_platform_credentials (organization_id,network,refresh_token)
               VALUES ($1,'google_ads','SECRET-REFRESH-TOKEN')`, [alpha.org]);
let credRead = 'ALLOWED';
try { await asUser(alpha.user, 'SELECT refresh_token FROM public.ad_platform_credentials'); }
catch (e) { credRead = e.code === '42501' ? 'blocked (permission denied)' : 'blocked'; }
t('app_user cannot read ad credentials', credRead.startsWith('blocked'), credRead);

// --- ingest role: insert yes, read no ---------------------------------------
const asIngest = async (org, sql, params = []) => {
  await c.query('BEGIN');
  await c.query('SET LOCAL ROLE app_ingest');
  await c.query(`SELECT set_config('app.ingest_org', $1, true)`, [org]);
  try { return (await c.query(sql, params)).rows; }
  finally { await c.query('COMMIT'); }
};

let ingestOk = false;
try {
  await asIngest(alpha.org,
    `INSERT INTO public.leads (organization_id,name) VALUES ($1,'From Tracker')`, [alpha.org]);
  ingestOk = true;
} catch { /* */ }
t('collector can insert into its own org', ingestOk);

let ingestWrong = 'blocked';
try {
  await asIngest(alpha.org,
    `INSERT INTO public.leads (organization_id,name) VALUES ($1,'Wrong Org')`, [beta.org]);
  ingestWrong = 'ALLOWED';
} catch { /* */ }
t('collector cannot insert into another org', ingestWrong === 'blocked', ingestWrong);

let ingestRead = 'ALLOWED';
try { await asIngest(alpha.org, 'SELECT id FROM public.leads'); }
catch { ingestRead = 'blocked'; }
t('collector cannot read leads back', ingestRead === 'blocked', ingestRead);

// --- role gate on integration settings --------------------------------------
await c.query(`INSERT INTO public.ad_platform_settings (organization_id,network) VALUES ($1,'google_ads')`, [alpha.org]);
await c.query(`UPDATE neon_auth."member" SET role='member' WHERE "userId"=$1`, [alpha.user]);
let memberWrite = 'ALLOWED';
try {
  await asUser(alpha.user, `UPDATE public.ad_platform_settings SET enabled=true WHERE organization_id=$1`, [alpha.org]);
  const [r] = await asUser(alpha.user, `SELECT enabled FROM public.ad_platform_settings WHERE organization_id=$1`, [alpha.org]);
  if (r?.enabled !== true) memberWrite = 'blocked';
} catch { memberWrite = 'blocked'; }
t('plain member cannot change integrations', memberWrite === 'blocked', memberWrite);

await c.query(`UPDATE neon_auth."member" SET role='owner' WHERE "userId"=$1`, [alpha.user]);
let ownerWrite = 'blocked';
try {
  await asUser(alpha.user, `UPDATE public.ad_platform_settings SET enabled=true WHERE organization_id=$1`, [alpha.org]);
  const [r] = await asUser(alpha.user, `SELECT enabled FROM public.ad_platform_settings WHERE organization_id=$1`, [alpha.org]);
  if (r?.enabled === true) ownerWrite = 'allowed';
} catch { /* */ }
t('owner can change integrations', ownerWrite === 'allowed', ownerWrite);

await c.end();
