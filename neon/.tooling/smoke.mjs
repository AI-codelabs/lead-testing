import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const t = (n, ok, extra='') => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
const EMAIL = `demo+${Date.now()}@vadelo.nl`;


// 1. signup -> handle_new_user trigger -> profile + workspace_key
const { rows: [u] } = await c.query(
  `INSERT INTO auth.users (email, raw_user_meta_data)
   VALUES ($1, '{"account_type":"agency","workspace_name":"Vadelo Demo","owner_name":"Thobias"}'::jsonb)
   RETURNING id`, [EMAIL]);
const { rows: [p] } = await c.query('SELECT * FROM public.profiles WHERE id=$1', [u.id]);
t('handle_new_user creates profile', !!p, p && `workspace_key=${p.workspace_key}`);
t('account_type carried from metadata', p?.account_type === 'agency', p?.account_type);

// 2. agency owner row auto-created
const { rows: [m] } = await c.query('SELECT * FROM public.agency_members WHERE user_id=$1', [u.id]);
t('agency owner member row created', m?.role === 'owner', m?.role);

// 3. lead insert + updated_at trigger
const { rows: [l] } = await c.query(
  `INSERT INTO public.leads (workspace_key, name, email, gclid, utm_source, stage)
   VALUES ($1,'Test Lead','lead@example.com','GCL123','google','new') RETURNING id, updated_at`,
  [p.workspace_key]);
await c.query(`UPDATE public.leads SET stage='qualified' WHERE id=$1`, [l.id]);
const { rows: [l2] } = await c.query('SELECT updated_at, stage FROM public.leads WHERE id=$1', [l.id]);
t('touch_updated_at trigger fires', l2.updated_at > l.updated_at, l2.stage);

// 4. email queue through the pgmq shim
await c.query(`SELECT pgmq.create('transactional_emails')`);
const { rows: [q] } = await c.query(`SELECT pgmq.send('transactional_emails','{"to":"a@b.c"}'::jsonb) AS id`);
const { rows: read } = await c.query(`SELECT * FROM pgmq.read('transactional_emails', 30, 10)`);
t('pgmq send + read round-trips', read.length === 1 && read[0].msg_id === q.id);
const { rows: [d] } = await c.query(`SELECT pgmq.delete('transactional_emails', $1) AS ok`, [q.id]);
t('pgmq delete removes message', d.ok === true);

// 5. RLS actually isolates tenants
await c.query(`DO $rp$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_probe') THEN
    CREATE ROLE rls_probe LOGIN;
  END IF; END $rp$;`);
await c.query('GRANT authenticated TO rls_probe');
await c.query('GRANT rls_probe TO CURRENT_USER').catch(()=>{});
await c.query('GRANT USAGE ON SCHEMA public, auth TO rls_probe');
await c.query('GRANT SELECT ON public.profiles TO rls_probe');
await c.query('SET ROLE rls_probe');
await c.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [u.id]);
const { rows: mine } = await c.query('SELECT id FROM public.profiles');
await c.query(`SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', false)`);
const { rows: theirs } = await c.query('SELECT id FROM public.profiles');
await c.query('RESET ROLE');
t('RLS shows own profile', mine.length === 1, `${mine.length} row(s)`);
t('RLS hides other tenants', theirs.length === 0, `${theirs.length} row(s)`);


await c.end();
