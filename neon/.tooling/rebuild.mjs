// Drops the ported Supabase schema and applies the rebuilt one.
// Leaves neon_auth (Better Auth) untouched.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const neonDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Everything the Supabase port created. neon_auth is Better Auth's — keep it.
const DROP = [
  'DROP SCHEMA IF EXISTS public CASCADE',
  'DROP SCHEMA IF EXISTS app CASCADE',
  'DROP SCHEMA IF EXISTS auth CASCADE',
  'DROP SCHEMA IF EXISTS pgmq CASCADE',
  'DROP SCHEMA IF EXISTS vault CASCADE',
  'DROP SCHEMA IF EXISTS net CASCADE',
  'DROP SCHEMA IF EXISTS shim CASCADE',
  'DROP SCHEMA IF EXISTS extensions CASCADE',
  'DROP PUBLICATION IF EXISTS supabase_realtime',
  'CREATE SCHEMA public',
];

for (const sql of DROP) {
  try { await c.query(sql); } catch (e) { console.log(`  skip: ${e.message}`); }
}
console.log('  dropped Supabase-era schemas (neon_auth preserved)');

// Old Supabase roles are gone with the schema; drop them too if unused.
for (const r of ['anon', 'authenticated', 'service_role', 'rls_probe']) {
  try {
    await c.query(`DROP OWNED BY ${r}`);
    await c.query(`DROP ROLE ${r}`);
    console.log(`  dropped role ${r}`);
  } catch { /* still referenced, or never existed */ }
}

const sql = readFileSync(join(neonDir, '10_schema.sql'), 'utf8');
try {
  await c.query('BEGIN');
  await c.query(sql);
  await c.query('COMMIT');
  console.log('  ok    10_schema.sql');
} catch (err) {
  await c.query('ROLLBACK');
  console.log(`  FAIL  10_schema.sql\n        ${err.message}`);
  await c.end();
  process.exit(1);
}

const { rows } = await c.query(`
  SELECT
    (SELECT count(*) FROM pg_tables  WHERE schemaname='public') AS tables,
    (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
    (SELECT count(*) FROM pg_tables  WHERE schemaname='public' AND rowsecurity) AS rls,
    (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes,
    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typtype='e') AS enums`);
console.log('\n ', rows[0]);
await c.end();
