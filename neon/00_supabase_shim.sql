-- ---------------------------------------------------------------------------
-- Supabase compatibility shim for Neon
-- ---------------------------------------------------------------------------
-- Recreates the parts of the Supabase platform that supabase/migrations/*.sql
-- depend on, so those 16 migrations apply to a plain Postgres database
-- unchanged. Apply this FIRST, then the migrations in filename order.
--
-- Emulated faithfully (behaviour matches Supabase):
--   * roles anon / authenticated / service_role
--   * auth.users + auth.uid()          -> real table, uid from a session GUC
--   * pgmq.{create,send,read,delete}   -> real table-backed queue
--
-- Emulated as INERT STUBS (they record intent, they do not act):
--   * net.http_post   -> writes to shim.http_outbox instead of making a request
--   * vault.*         -> plaintext table; NOT a secret store
--   * cron.unschedule -> no-op when pg_cron is unavailable
--
-- The stubs exist so the schema loads and can be inspected. The email delivery
-- pipeline is NOT functional under them - see neon/README.md.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- roles -----------------------------------------------------------------
DO $shim$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$shim$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS pgmq;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS shim;

GRANT USAGE ON SCHEMA auth, extensions, pgmq, vault, net TO anon, authenticated, service_role;

-- --- auth.users ------------------------------------------------------------
-- Only the columns this application actually reads are modelled.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON auth.users TO authenticated, service_role;

-- auth.uid() reads the current user id from a per-connection setting.
-- The server sets it per request:  SET LOCAL request.jwt.claim.sub = '<uuid>';
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $shim$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$shim$;

-- auth.role() mirrors the JWT "role" claim: anon | authenticated | service_role.
-- The server sets it per request: SET LOCAL request.jwt.claim.role = '...';
-- Defaults to 'anon' so an unconfigured connection gets the least privilege.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $shim$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon')
$shim$;

-- --- pgmq (real, table-backed) ---------------------------------------------
CREATE TABLE IF NOT EXISTS pgmq.q (
  msg_id      bigserial PRIMARY KEY,
  queue_name  text        NOT NULL,
  message     jsonb       NOT NULL,
  read_ct     integer     NOT NULL DEFAULT 0,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  vt          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pgmq_q_poll_idx ON pgmq.q (queue_name, vt, msg_id);

CREATE OR REPLACE FUNCTION pgmq.create(p_queue text)
RETURNS void LANGUAGE plpgsql AS $shim$
BEGIN
  -- Queues are logical in this shim; nothing to provision.
  PERFORM 1;
END
$shim$;

CREATE OR REPLACE FUNCTION pgmq.send(p_queue text, p_msg jsonb)
RETURNS bigint LANGUAGE plpgsql AS $shim$
DECLARE new_id bigint;
BEGIN
  INSERT INTO pgmq.q (queue_name, message)
  VALUES (p_queue, p_msg)
  RETURNING pgmq.q.msg_id INTO new_id;
  RETURN new_id;
END
$shim$;

-- Claims up to p_qty messages and hides them for p_vt seconds.
CREATE OR REPLACE FUNCTION pgmq.read(p_queue text, p_vt integer, p_qty integer)
RETURNS TABLE (
  msg_id      bigint,
  read_ct     integer,
  enqueued_at timestamptz,
  vt          timestamptz,
  message     jsonb
)
LANGUAGE plpgsql AS $shim$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT q.msg_id AS id
    FROM pgmq.q q
    WHERE q.queue_name = p_queue
      AND q.vt <= now()
    ORDER BY q.msg_id
    LIMIT p_qty
    FOR UPDATE SKIP LOCKED
  )
  UPDATE pgmq.q u
     SET read_ct = u.read_ct + 1,
         vt      = now() + make_interval(secs => p_vt)
   WHERE u.msg_id IN (SELECT claimed.id FROM claimed)
  RETURNING u.msg_id, u.read_ct, u.enqueued_at, u.vt, u.message;
END
$shim$;

CREATE OR REPLACE FUNCTION pgmq.delete(p_queue text, p_msg_id bigint)
RETURNS boolean LANGUAGE plpgsql AS $shim$
DECLARE hit integer;
BEGIN
  DELETE FROM pgmq.q q
   WHERE q.queue_name = p_queue
     AND q.msg_id     = p_msg_id;
  GET DIAGNOSTICS hit = ROW_COUNT;
  RETURN hit > 0;
END
$shim$;

-- --- net.http_post (INERT STUB) --------------------------------------------
CREATE TABLE IF NOT EXISTS shim.http_outbox (
  id         bigserial PRIMARY KEY,
  url        text NOT NULL,
  body       jsonb,
  headers    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE shim.http_outbox IS
  'Requests net.http_post WOULD have made. Nothing is actually sent.';

CREATE OR REPLACE FUNCTION net.http_post(
  p_url     text,
  p_body    jsonb   DEFAULT '{}'::jsonb,
  p_params  jsonb   DEFAULT '{}'::jsonb,
  p_headers jsonb   DEFAULT '{}'::jsonb,
  p_timeout integer DEFAULT 5000
)
RETURNS bigint LANGUAGE plpgsql AS $shim$
DECLARE new_id bigint;
BEGIN
  INSERT INTO shim.http_outbox (url, body, headers)
  VALUES (p_url, p_body, p_headers)
  RETURNING id INTO new_id;
  RETURN new_id;
END
$shim$;

-- --- vault (INERT STUB - plaintext, not a secret store) ---------------------
CREATE TABLE IF NOT EXISTS vault.secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE,
  secret      text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE vault.secrets IS
  'STUB. Values are stored in PLAINTEXT. Do not put real secrets here.';

CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT ''
)
RETURNS uuid LANGUAGE plpgsql AS $shim$
DECLARE new_id uuid;
BEGIN
  INSERT INTO vault.secrets (name, secret, description)
  VALUES (new_name, new_secret, new_description)
  ON CONFLICT (name) DO UPDATE
    SET secret = EXCLUDED.secret, updated_at = now()
  RETURNING id INTO new_id;
  RETURN new_id;
END
$shim$;

CREATE OR REPLACE FUNCTION vault.update_secret(
  secret_id uuid, new_secret text DEFAULT NULL,
  new_name text DEFAULT NULL, new_description text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $shim$
BEGIN
  UPDATE vault.secrets
     SET secret      = COALESCE(new_secret, secret),
         name        = COALESCE(new_name, name),
         description = COALESCE(new_description, description),
         updated_at  = now()
   WHERE id = secret_id;
END
$shim$;

-- --- realtime publication --------------------------------------------------
-- Supabase ships a publication named supabase_realtime; migrations ALTER it.
DO $shim$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$shim$;

-- --- cron ------------------------------------------------------------------
-- Neon ships pg_cron, but it is only installable on the default branch. Try it;
-- fall back to a no-op so the migrations still apply on child branches.
DO $shim$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable (%); installing no-op cron stub', SQLERRM;
  END;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    CREATE SCHEMA cron;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'cron' AND p.proname = 'unschedule'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION cron.unschedule(job_name text)
      RETURNS boolean LANGUAGE sql AS 'SELECT true'
    $fn$;
  END IF;
END
$shim$;
