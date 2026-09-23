-- ---------------------------------------------------------------------------
-- Leadlogr schema, rebuilt on Neon + Better Auth
-- ---------------------------------------------------------------------------
-- Identity and organizations are owned by Better Auth in the neon_auth schema
-- (user, session, account, verification, jwks, organization, member,
-- invitation). This file owns the application tables only.
--
-- The central change from the Supabase version: tenancy is enforced by the
-- DATABASE, not by application code. Every request runs as the app_user role
-- with SET LOCAL app.user_id, and every policy checks membership in
-- neon_auth.member. A query that forgets its tenant filter returns nothing
-- instead of leaking another tenant's rows.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- === roles ==================================================================
-- The app connects as the database owner, then drops to one of these per
-- request with SET LOCAL ROLE. Neither owns any table, so RLS applies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;      -- an authenticated end user
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ingest') THEN
    CREATE ROLE app_ingest NOLOGIN;    -- the public lead collector, insert only
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app, public TO app_user, app_ingest;

-- === request context ========================================================
-- Set per request by the server:  SET LOCAL app.user_id = '<uuid>';
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Set per request for the public collector: SET LOCAL app.ingest_org = '<uuid>';
CREATE OR REPLACE FUNCTION app.current_ingest_org()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.ingest_org', true), '')::uuid
$$;

-- Membership test. SECURITY DEFINER so app_user needs no grant on neon_auth —
-- it can prove membership without being able to read the member table.
CREATE OR REPLACE FUNCTION app.is_member(org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = neon_auth, pg_catalog AS $$
  SELECT org IS NOT NULL AND EXISTS (
    SELECT 1 FROM neon_auth.member m
    WHERE m."organizationId" = org
      AND m."userId" = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
$$;

CREATE OR REPLACE FUNCTION app.has_role(org uuid, roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = neon_auth, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM neon_auth.member m
    WHERE m."organizationId" = org
      AND m."userId" = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND m.role = ANY(roles)
  )
$$;

REVOKE ALL ON FUNCTION app.is_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.has_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_member(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app.has_role(uuid, text[]) TO app_user;

CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END
$$;

-- === neon_auth bridge =======================================================
-- app_user is deliberately NOT granted anything in neon_auth: a blanket SELECT
-- there would let any signed-in user read every organization and every user's
-- email. These views are owned by the database owner and run with its rights
-- (views are security-definer unless created WITH security_invoker), and each
-- one filters to the current user. Reads go through them; writes go through the
-- SECURITY DEFINER functions below.

CREATE VIEW app.my_memberships AS
  SELECT m.id, m."organizationId" AS organization_id, m."userId" AS user_id,
         m.role, m."createdAt" AS created_at
    FROM neon_auth."member" m
   WHERE m."userId" = app.current_user_id();

CREATE VIEW app.organizations AS
  SELECT o.id, o.name, o.slug, o.logo, o."createdAt" AS created_at,
         mm.role AS my_role
    FROM neon_auth."organization" o
    JOIN app.my_memberships mm ON mm.organization_id = o.id;

-- Members of organizations the caller belongs to — not of every organization.
CREATE VIEW app.org_members AS
  SELECT m.id, m."organizationId" AS organization_id, m."userId" AS user_id,
         m.role, m."createdAt" AS created_at,
         u.email, u.name
    FROM neon_auth."member" m
    JOIN neon_auth."user" u ON u.id = m."userId"
   WHERE app.is_member(m."organizationId");

-- Invitations the caller can legitimately see: ones their organization sent,
-- and ones addressed to their own verified email.
CREATE VIEW app.org_invitations AS
  SELECT i.id, i."organizationId" AS organization_id, i.email, i.role, i.status,
         i."expiresAt" AS expires_at, i."createdAt" AS created_at,
         i."inviterId" AS inviter_id, o.name AS organization_name
    FROM neon_auth."invitation" i
    JOIN neon_auth."organization" o ON o.id = i."organizationId"
   WHERE app.is_member(i."organizationId")
      OR lower(i.email) = lower(COALESCE(current_setting('app.user_email', true), ''));

GRANT SELECT ON app.my_memberships, app.organizations,
                app.org_members, app.org_invitations TO app_user;

CREATE OR REPLACE FUNCTION app.create_invitation(org uuid, invite_email text, invite_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT app.has_role(org, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Only owners and admins can invite teammates';
  END IF;
  INSERT INTO neon_auth."invitation"
    (id, "organizationId", email, role, status, "expiresAt", "createdAt", "inviterId")
  VALUES (gen_random_uuid(), org, lower(invite_email), invite_role, 'pending',
          now() + interval '14 days', now(), app.current_user_id())
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Accepting proves the invitation was addressed to the caller's own email.
CREATE OR REPLACE FUNCTION app.accept_invitation(invite_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM neon_auth."invitation"
   WHERE id = invite_id AND status = 'pending' AND "expiresAt" > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF lower(inv.email) <> lower(COALESCE(current_setting('app.user_email', true), '')) THEN
    RAISE EXCEPTION 'This invite is for a different email';
  END IF;

  INSERT INTO neon_auth."member" (id, "organizationId", "userId", role, "createdAt")
  VALUES (gen_random_uuid(), inv."organizationId", app.current_user_id(), inv.role, now())
  ON CONFLICT DO NOTHING;

  UPDATE neon_auth."invitation" SET status = 'accepted' WHERE id = invite_id;
  RETURN inv."organizationId";
END $$;

CREATE OR REPLACE FUNCTION app.set_invitation_status(invite_id uuid, new_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
DECLARE inv record;
BEGIN
  SELECT * INTO inv FROM neon_auth."invitation" WHERE id = invite_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- The inviting organization may cancel; the recipient may reject.
  IF NOT (app.has_role(inv."organizationId", ARRAY['owner','admin'])
          OR lower(inv.email) = lower(COALESCE(current_setting('app.user_email', true), ''))) THEN
    RETURN false;
  END IF;
  UPDATE neon_auth."invitation" SET status = new_status WHERE id = invite_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION app.remove_member(member_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
DECLARE m record;
BEGIN
  SELECT * INTO m FROM neon_auth."member" WHERE id = member_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF m.role = 'owner' THEN RAISE EXCEPTION 'Cannot remove the owner'; END IF;
  IF NOT app.has_role(m."organizationId", ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'Only owners and admins can remove teammates';
  END IF;
  DELETE FROM neon_auth."member" WHERE id = member_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app.create_invitation(uuid, text, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_invitation(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION app.set_invitation_status(uuid, text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION app.remove_member(uuid)                     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_invitation(uuid, text, text)  TO app_user;
GRANT EXECUTE ON FUNCTION app.accept_invitation(uuid)              TO app_user;
GRANT EXECUTE ON FUNCTION app.set_invitation_status(uuid, text)    TO app_user;
GRANT EXECUTE ON FUNCTION app.remove_member(uuid)                  TO app_user;

-- === enums ==================================================================
-- Replaces unconstrained text with inconsistent casing. The vocabularies match
-- src/components/leadlogr/lead-types.ts exactly, lowercased — the UI's display
-- names stay in the UI, the database stores stable identifiers.
CREATE TYPE lead_stage AS ENUM
  ('new', 'contacted', 'qualified', 'won', 'lost', 'disqualified');
CREATE TYPE lead_priority      AS ENUM ('low', 'medium', 'high');
CREATE TYPE lead_qualification AS ENUM ('unqualified', 'qualified', 'customer');
CREATE TYPE lead_consent       AS ENUM ('unknown', 'accepted', 'declined');
CREATE TYPE lead_label         AS ENUM ('none', 'hot', 'spam', 'quotation_sent');
CREATE TYPE ad_network         AS ENUM ('google_ads', 'meta_ads');
CREATE TYPE upload_status      AS ENUM ('pending', 'sent', 'failed', 'skipped');
CREATE TYPE activity_kind AS ENUM
  ('created', 'stage_changed', 'qualified', 'won', 'lost', 'reopened',
   'value_changed', 'label_changed', 'note', 'edited');

-- === organization settings ==================================================
-- App-level settings for a Better Auth organization. Replaces the half of
-- `profiles` that described a workspace.
--
-- ingest_key replaces workspace_key for public lead collection. It is a real
-- credential: high entropy, rotatable, and never used as an identifier
-- anywhere else. The organization's uuid is never exposed to the tracker.
CREATE TABLE public.organization_settings (
  organization_id  uuid PRIMARY KEY REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  account_type     text NOT NULL DEFAULT 'standard'
                     CHECK (account_type IN ('standard', 'agency')),
  ingest_key       text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  default_currency text NOT NULL DEFAULT 'EUR',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- === agency -> client links =================================================
-- An agency organization manages other organizations' workspaces. Previously
-- this was profiles.agency_id pointing at another profile row, which only
-- worked because a profile was simultaneously a user and an organization.
-- Now it is an explicit relationship between two organizations.
CREATE TABLE public.agency_clients (
  agency_org_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  client_org_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  access_level  text NOT NULL DEFAULT 'full'
                  CHECK (access_level IN ('full', 'read_only')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_org_id, client_org_id),
  CONSTRAINT agency_not_own_client CHECK (agency_org_id <> client_org_id)
);

CREATE INDEX agency_clients_client_idx ON public.agency_clients (client_org_id);

-- Invitations from an agency to a prospective client workspace. Distinct from
-- neon_auth.invitation, which Better Auth owns and which invites a PERSON into
-- an organization. This invites an ORGANIZATION into a management relationship.
CREATE TABLE public.agency_client_invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_org_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  client_email  text NOT NULL,
  access_level  text NOT NULL DEFAULT 'full'
                  CHECK (access_level IN ('full', 'read_only')),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  inviter_id    uuid,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agency_client_invites_agency_idx ON public.agency_client_invites (agency_org_id, status);
CREATE INDEX agency_client_invites_email_idx  ON public.agency_client_invites (lower(client_email), status);

-- === leads ==================================================================
-- Attribution columns are nullable: absent and empty are now distinguishable.
CREATE TABLE public.leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,

  stage            lead_stage NOT NULL DEFAULT 'new',
  stage_changed_at timestamptz,
  qualification    lead_qualification NOT NULL DEFAULT 'unqualified',
  qualified_at     timestamptz,
  priority         lead_priority NOT NULL DEFAULT 'medium',
  label            lead_label NOT NULL DEFAULT 'none',
  won_value        numeric(12,2),
  currency         text NOT NULL DEFAULT 'EUR',
  lost_reason      text,
  -- Leads auto-close when nothing happens. Nullable: not every lead expires.
  expires_at       timestamptz,

  name             text,
  email            text,
  phone            text,
  company          text,
  message          text,
  description      text,
  notes            text,
  tags             text[] NOT NULL DEFAULT '{}',

  source           text,
  campaign_name    text,
  website_url      text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  utm_term         text,
  utm_content      text,

  gclid            text,
  wbraid           text,
  gbraid           text,
  fbclid           text,
  msclkid          text,
  li_fat_id        text,
  fbp              text,
  ga_client_id     text,
  ga_session_id    text,

  landing_page_url text,
  page_path        text,
  referrer_url     text,
  user_agent       text,

  consent          lead_consent NOT NULL DEFAULT 'unknown',
  custom_fields    jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_org_created_idx ON public.leads (organization_id, created_at DESC);
CREATE INDEX leads_org_stage_idx   ON public.leads (organization_id, stage);
CREATE INDEX leads_org_email_idx   ON public.leads (organization_id, lower(email)) WHERE email IS NOT NULL;
-- Partial indexes are now useful, because absent click ids are NULL not ''.
CREATE INDEX leads_gclid_idx       ON public.leads (organization_id, gclid)  WHERE gclid  IS NOT NULL;
CREATE INDEX leads_fbclid_idx      ON public.leads (organization_id, fbclid) WHERE fbclid IS NOT NULL;

CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Keep stage_changed_at honest without the application having to remember.
CREATE OR REPLACE FUNCTION public.leads_stamp_stage_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN NEW.stage_changed_at = now(); END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER leads_stage_stamp BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_stamp_stage_change();

CREATE INDEX leads_org_expiry_idx ON public.leads (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX leads_tags_idx ON public.leads USING gin (tags);

-- === lead activity ==========================================================
-- The timeline the UI shows per lead. Previously held only in browser state,
-- so it was lost on reload and invisible to teammates.
CREATE TABLE public.lead_activity (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind            activity_kind NOT NULL,
  message         text NOT NULL,
  -- Who did it. Null for events the system generated.
  actor_id        uuid,
  actor_name      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_activity_lead_idx ON public.lead_activity (lead_id, created_at DESC);
CREATE INDEX lead_activity_org_idx  ON public.lead_activity (organization_id, created_at DESC);

-- Record stage transitions automatically, so the timeline cannot drift from
-- the data the way a client-side history does.
CREATE OR REPLACE FUNCTION public.leads_log_stage_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.lead_activity (organization_id, lead_id, kind, message, actor_id)
    VALUES (
      NEW.organization_id, NEW.id,
      CASE NEW.stage
        WHEN 'qualified' THEN 'qualified'::activity_kind
        WHEN 'won'       THEN 'won'::activity_kind
        WHEN 'lost'      THEN 'lost'::activity_kind
        ELSE 'stage_changed'::activity_kind
      END,
      format('Stage changed from %s to %s', OLD.stage, NEW.stage),
      NULLIF(current_setting('app.user_id', true), '')::uuid
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER leads_log_stage AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_log_stage_change();

CREATE OR REPLACE FUNCTION public.leads_log_created()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.lead_activity (organization_id, lead_id, kind, message)
  VALUES (NEW.organization_id, NEW.id, 'created', 'Lead created');
  RETURN NEW;
END
$$;

CREATE TRIGGER leads_log_create AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_log_created();

-- === ad platform settings ===================================================
-- Non-secret configuration. Safe for app_user to read and write.
CREATE TABLE public.ad_platform_settings (
  organization_id  uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  network          ad_network NOT NULL,
  enabled          boolean NOT NULL DEFAULT false,
  default_currency text NOT NULL DEFAULT 'EUR',
  -- google: customer_id / login_customer_id. meta: pixel_id / test_event_code.
  account_id       text,
  secondary_id     text,
  test_event_code  text,
  -- stage -> conversion action (google) or event name (meta)
  action_new       text,
  action_qualified text,
  action_won       text,
  action_lost      text,
  connected_email  text,
  connected_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, network)
);

CREATE TRIGGER ad_platform_settings_touch BEFORE UPDATE ON public.ad_platform_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- === ad platform credentials ================================================
-- Separated from settings so that app_user has NO grant here at all. Even a
-- fully compromised user session cannot read a refresh token; only the owner
-- connection used by server-side conversion upload can.
CREATE TABLE public.ad_platform_credentials (
  organization_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  network         ad_network NOT NULL,
  refresh_token   text,
  access_token    text,
  expires_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, network)
);

CREATE TRIGGER ad_platform_credentials_touch BEFORE UPDATE ON public.ad_platform_credentials
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMENT ON TABLE public.ad_platform_credentials IS
  'Secrets. app_user is granted nothing here by design — see 10_schema.sql.';

-- === conversion uploads =====================================================
CREATE TABLE public.conversion_uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  lead_id           uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  network           ad_network NOT NULL,
  stage             lead_stage NOT NULL,
  click_id          text,
  click_id_type     text,
  conversion_action text,
  value             numeric(12,2),
  currency          text,
  status            upload_status NOT NULL DEFAULT 'pending',
  attempts          integer NOT NULL DEFAULT 0,
  request_payload   jsonb,
  response_payload  jsonb,
  error             text,
  attempted_at      timestamptz,
  succeeded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One upload per lead, network and stage: makes the uploader idempotent, so a
-- retried stage change cannot double-report a conversion to the ad platform.
CREATE UNIQUE INDEX conversion_uploads_unique_idx
  ON public.conversion_uploads (lead_id, network, stage);
CREATE INDEX conversion_uploads_org_idx     ON public.conversion_uploads (organization_id, created_at DESC);
CREATE INDEX conversion_uploads_lead_idx    ON public.conversion_uploads (lead_id);
CREATE INDEX conversion_uploads_pending_idx ON public.conversion_uploads (status, attempts)
  WHERE status = 'pending';

CREATE TRIGGER conversion_uploads_touch BEFORE UPDATE ON public.conversion_uploads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- === oauth states ===========================================================
CREATE TABLE public.oauth_states (
  state           text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  network         ad_network NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);

CREATE INDEX oauth_states_expiry_idx ON public.oauth_states (expires_at);

-- === grants =================================================================
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.leads, public.conversion_uploads, public.ad_platform_settings,
     public.lead_activity
  TO app_user;
GRANT SELECT, UPDATE ON public.organization_settings TO app_user;
GRANT SELECT, INSERT, DELETE ON public.agency_clients TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.agency_client_invites TO app_user;
-- app_ingest may only add leads, never read them. Note this also rules out
-- INSERT ... RETURNING, because Postgres applies a SELECT policy to the
-- returned row — the collector generates the lead id itself instead.
GRANT INSERT ON public.leads TO app_ingest;
-- The created-activity trigger runs as the inserting role.
GRANT INSERT ON public.lead_activity TO app_ingest;
-- Deliberately no grants to app_user or app_ingest on:
--   public.ad_platform_credentials, public.oauth_states

-- === row level security =====================================================
ALTER TABLE public.organization_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_platform_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_platform_credentials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_uploads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_client_invites    ENABLE ROW LEVEL SECURITY;

-- Members see and change their own organization's rows. Nothing else.
CREATE POLICY leads_member ON public.leads FOR ALL TO app_user
  USING (app.is_member(organization_id))
  WITH CHECK (app.is_member(organization_id));

CREATE POLICY lead_activity_member ON public.lead_activity FOR ALL TO app_user
  USING (app.is_member(organization_id))
  WITH CHECK (app.is_member(organization_id));

CREATE POLICY conversion_uploads_member ON public.conversion_uploads FOR ALL TO app_user
  USING (app.is_member(organization_id))
  WITH CHECK (app.is_member(organization_id));

CREATE POLICY ad_platform_settings_read ON public.ad_platform_settings FOR SELECT TO app_user
  USING (app.is_member(organization_id));

-- Only owners and admins may change integration configuration.
CREATE POLICY ad_platform_settings_write ON public.ad_platform_settings FOR ALL TO app_user
  USING (app.has_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (app.has_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY organization_settings_read ON public.organization_settings FOR SELECT TO app_user
  USING (app.is_member(organization_id));

CREATE POLICY organization_settings_write ON public.organization_settings FOR UPDATE TO app_user
  USING (app.has_role(organization_id, ARRAY['owner', 'admin']))
  WITH CHECK (app.has_role(organization_id, ARRAY['owner', 'admin']));

-- Either side of the relationship can see it; only the agency's owners and
-- admins can create or remove a link.
CREATE POLICY agency_clients_read ON public.agency_clients FOR SELECT TO app_user
  USING (app.is_member(agency_org_id) OR app.is_member(client_org_id));

CREATE POLICY agency_clients_manage ON public.agency_clients FOR ALL TO app_user
  USING (app.has_role(agency_org_id, ARRAY['owner', 'admin']))
  WITH CHECK (app.has_role(agency_org_id, ARRAY['owner', 'admin']));

-- Accepting an invitation is performed by the CLIENT, who is not a member of
-- the agency and so cannot satisfy the policy above. They may create the link
-- only for an organization they own, and only when that agency has a live
-- invitation addressed to their own verified email.
CREATE POLICY agency_clients_accept ON public.agency_clients FOR INSERT TO app_user
  WITH CHECK (
    app.has_role(client_org_id, ARRAY['owner'])
    AND EXISTS (
      SELECT 1 FROM public.agency_client_invites ci
       WHERE ci.agency_org_id = agency_clients.agency_org_id
         AND ci.status = 'pending'
         AND ci.expires_at > now()
         AND lower(ci.client_email)
             = lower(COALESCE(current_setting('app.user_email', true), ''))
    )
  );

-- An agency's members can read their clients' leads. This is the one place
-- tenancy legitimately crosses an organization boundary, and it is written
-- down here rather than assumed by application code.
CREATE POLICY leads_agency_read ON public.leads FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM public.agency_clients ac
     WHERE ac.client_org_id = leads.organization_id
       AND app.is_member(ac.agency_org_id)
  ));

-- The inviting agency sees its own invites. Recipients are matched by email,
-- which Better Auth verified at sign-up.
CREATE POLICY agency_client_invites_read ON public.agency_client_invites FOR SELECT TO app_user
  USING (
    app.is_member(agency_org_id)
    OR lower(client_email) = lower(COALESCE(current_setting('app.user_email', true), ''))
  );

CREATE POLICY agency_client_invites_send ON public.agency_client_invites FOR INSERT TO app_user
  WITH CHECK (app.has_role(agency_org_id, ARRAY['owner', 'admin']));

-- The agency may revoke; the recipient may accept or decline.
CREATE POLICY agency_client_invites_update ON public.agency_client_invites FOR UPDATE TO app_user
  USING (
    app.has_role(agency_org_id, ARRAY['owner', 'admin'])
    OR lower(client_email) = lower(COALESCE(current_setting('app.user_email', true), ''))
  );

-- The public collector inserts only into the organization its ingest key
-- resolved to, and can read nothing.
CREATE POLICY leads_ingest ON public.leads FOR INSERT TO app_ingest
  WITH CHECK (organization_id = app.current_ingest_org());

CREATE POLICY lead_activity_ingest ON public.lead_activity FOR INSERT TO app_ingest
  WITH CHECK (organization_id = app.current_ingest_org());

-- === late helpers ===========================================================
-- Defined last: app.org_owner depends on public.agency_clients.
-- An organization's display name. Needed for organizations the caller is NOT a
-- member of — the agency that invited them, or a client they manage. Returns
-- the name only; nothing else about the organization is exposed.
CREATE OR REPLACE FUNCTION app.organization_name(org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = neon_auth, pg_catalog AS $$
  SELECT name FROM neon_auth."organization" WHERE id = org
$$;

-- The owner of an organization the caller manages as an agency, or belongs to.
-- Anything else returns no rows.
CREATE OR REPLACE FUNCTION app.org_owner(org uuid)
RETURNS TABLE (name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
  SELECT u.name, u.email
    FROM neon_auth."member" m
    JOIN neon_auth."user" u ON u.id = m."userId"
   WHERE m."organizationId" = org
     AND m.role = 'owner'
     AND (
       app.is_member(org)
       OR EXISTS (SELECT 1 FROM public.agency_clients ac
                   WHERE ac.client_org_id = org AND app.is_member(ac.agency_org_id))
     )
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.organization_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.org_owner(uuid)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_name(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app.org_owner(uuid)         TO app_user;
