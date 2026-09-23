// Applies the Supabase-compat shim, then every supabase/migrations/*.sql file
// in filename order, to the database in $DATABASE_URL.
// Each file runs in its own transaction: one bad file rolls back alone.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDir = join(repo, 'supabase', 'migrations');

const files = [
  { label: '00_supabase_shim.sql', path: join(repo, 'neon', '00_supabase_shim.sql') },
  ...readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ label: f, path: join(migrationsDir, f) })),
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let ok = 0;
const failures = [];

// Neon refuses CREATE EXTENSION for extensions outside its allowlist, even with
// IF NOT EXISTS. The shim provides these surfaces already, so neutralise the
// statements rather than editing the upstream migrations.
const UNSUPPORTED = ['pg_net', 'supabase_vault', 'pgmq', 'pg_cron'];
const stripExtensions = (sql) =>
  sql.replace(/CREATE\s+EXTENSION[^;]*;/gi, (stmt) =>
    UNSUPPORTED.some((e) => stmt.toLowerCase().includes(e))
      ? `-- [neon-shim] removed: ${stmt.replace(/\s+/g, ' ').trim()}\n`
      : stmt,
  );

for (const { label, path } of files) {
  const raw = readFileSync(path, 'utf8');
  const sql = label === '00_supabase_shim.sql' ? raw : stripExtensions(raw);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    ok++;
    console.log(`  ok    ${label}`);
  } catch (err) {
    await client.query('ROLLBACK');
    failures.push({ label, message: err.message });
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message.split('\n')[0]}`);
  }
}

console.log(`\n${ok}/${files.length} files applied, ${failures.length} failed`);
await client.end();
process.exit(failures.length ? 1 : 0);
