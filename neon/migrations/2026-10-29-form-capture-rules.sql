-- Which forms on a customer's site count as leads.
--
-- We cannot decide this for them. A courier company's job-application form is
-- noise in a sales pipeline; a recruiter running ads for that same form has
-- nothing BUT that form. MKG Koeriers is 88% applications and 12% enquiries,
-- and both readings are correct depending on whose campaign it is.
--
-- So the workspace chooses, from the forms we have actually seen, and the
-- default is to collect. A pipeline with noise in it is a visible problem
-- somebody fixes; a pipeline silently missing real enquiries is invisible and
-- costs money, so a form nobody has ruled on is collected.
CREATE TYPE form_capture_mode AS ENUM (
  'collect',  -- the default: a normal lead
  'hide',     -- stored, kept out of the pipeline, dashboard and conversions,
              -- and reversible: turn it back on and the history is there
  'block'     -- never stored at all. For forms whose contents we should not
              -- hold, a self-hosted payment form being the case that matters
);

CREATE TABLE public.form_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  -- Matched on either or both. form_action is the robust key -- every vacancy
  -- page at MKG posts to the same /!/forms/apply -- while page_path is the one
  -- a marketer recognises, and is what lets a single campaign landing page be
  -- collected while the rest of its section is not. Empty string means "any".
  form_action      text NOT NULL DEFAULT '',
  page_path        text NOT NULL DEFAULT '',
  mode             form_capture_mode NOT NULL DEFAULT 'collect',
  -- What to call it in the UI; seeded from the page title we saw.
  label            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, form_action, page_path)
);

CREATE INDEX form_rules_org_idx ON public.form_rules (organization_id);

-- Leads that matched a 'hide' rule. Kept, but out of sight.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

-- Every list, count and conversion filters on this, so it earns an index.
CREATE INDEX IF NOT EXISTS leads_org_visible_idx
  ON public.leads (organization_id, created_at DESC) WHERE NOT excluded;

ALTER TABLE public.form_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_rules TO app_user;

CREATE POLICY form_rules_rw ON public.form_rules FOR ALL TO app_user
  USING (
    app.is_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.agency_clients ac
                WHERE ac.client_org_id = form_rules.organization_id
                  AND app.is_member(ac.agency_org_id))
  )
  WITH CHECK (
    app.is_member(organization_id)
    OR EXISTS (SELECT 1 FROM public.agency_clients ac
                WHERE ac.client_org_id = form_rules.organization_id
                  AND app.is_member(ac.agency_org_id))
  );

-- The ingest role holds INSERT on leads and nothing else, so it cannot read
-- this table either. It gets one answer and no more, the same shape as the
-- duplicate guard.
CREATE OR REPLACE FUNCTION app.form_capture_mode(
  p_org         uuid,
  p_form_action text,
  p_page_path   text
)
RETURNS form_capture_mode
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- Most specific rule wins: one naming both the form and the page beats one
  -- naming only the form, which beats one naming only the page. That is what
  -- lets "collect /open-sollicitatie, hide every other vacancy" be expressed.
  SELECT r.mode
    FROM public.form_rules r
   WHERE r.organization_id = p_org
     AND (r.form_action = '' OR r.form_action = coalesce(p_form_action, ''))
     AND (r.page_path   = '' OR r.page_path   = coalesce(p_page_path, ''))
   ORDER BY (r.form_action <> '')::int + (r.page_path <> '')::int DESC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.form_capture_mode(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.form_capture_mode(uuid, text, text) TO app_ingest;
GRANT EXECUTE ON FUNCTION app.form_capture_mode(uuid, text, text) TO app_user;
