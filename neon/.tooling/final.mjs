import pg from 'pg'; import fs from 'node:fs';
const env = fs.readFileSync('/Users/thobiasreinderswerk/Documents/lead-testing/.env.local','utf8');
const url = env.split('\n').find(l=>l.startsWith('DATABASE_URL='))?.slice('DATABASE_URL='.length).trim();
const c = new pg.Client({ connectionString: url }); await c.connect();
const { rows:m } = await c.query(`
  SELECT u.email, m.role, o.name FROM neon_auth."member" m
   JOIN neon_auth."user" u ON u.id=m."userId"
   JOIN neon_auth."organization" o ON o.id=m."organizationId"
   WHERE o.name='Tidewater Dental' ORDER BY m."createdAt"`);
console.log('OWNERS of Tidewater Dental:');
for (const r of m) console.log(`  ${r.email} = ${r.role}`);
const { rows:a } = await c.query(`
  SELECT cl.name, ac.claimed_at IS NOT NULL AS claimed FROM public.agency_clients ac
   JOIN neon_auth."organization" cl ON cl.id=ac.client_org_id ORDER BY cl.name`);
for (const r of a) console.log(`LINK ${r.name.padEnd(20)} claimed=${r.claimed}`);
const { rows:i } = await c.query(`SELECT status FROM neon_auth."invitation" WHERE lower(email)=$1`,['rosa@tidewater-test.example']);
console.log('INVITE status:', i.map(r=>r.status).join(','));
await c.end();
