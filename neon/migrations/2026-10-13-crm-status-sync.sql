-- Inbound status sync from the customer's own CRM.
--
-- Leadlogr does not need to be the CRM. It needs to know when a deal closed,
-- because that is what gets reported back to the ad platform. Every tool in
-- the "updating" list -- Pipedrive, Zoho, Odoo, Monday, ClickUp, Teamleader --
-- can already send an outbound webhook, so the customer pastes our URL into
-- their tool and nothing here needs an OAuth app, a developer registration or
-- a review. That matters: six OAuth integrations would be six approval queues.
--
-- The URL carries a per-connection secret, which is how an unauthenticated
-- request proves which workspace it belongs to -- the same shape as the
-- tracker's ingest key.

CREATE TYPE crm_provider AS ENUM
  ('pipedrive', 'zoho', 'odoo', 'monday', 'clickup', 'teamleader');

CREATE TABLE public.crm_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  provider         crm_provider NOT NULL,
  -- Secret in the webhook URL. Rotatable by deleting and re-creating.
  webhook_key      text NOT NULL UNIQUE,
  -- Their stage label -> our lead_stage, e.g. {"Deal Won":"won"}. Lower-cased
  -- on both write and read so "Won" and "won" are the same key.
  stage_map        jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled          boolean NOT NULL DEFAULT true,
  last_event_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

-- Every delivery, matched or not. A webhook that silently does nothing is the
-- hardest kind of integration to debug, and the common failures -- an unmapped
-- stage, an email that matches no lead -- are only visible here.
CREATE TABLE public.crm_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  provider         crm_provider NOT NULL,
  lead_id          uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  matched          boolean NOT NULL DEFAULT false,
  external_stage   text,
  mapped_stage     lead_stage,
  email            text,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_events_org_created_idx
  ON public.crm_events (organization_id, created_at DESC);

ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events      ENABLE ROW LEVEL SECURITY;

-- Members manage their own connections. The webhook itself runs on the owner
-- connection after resolving the key, so no INSERT is granted to app_user for
-- events -- only reading them back.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_connections TO app_user;
GRANT SELECT                        ON public.crm_events      TO app_user;

CREATE POLICY crm_connections_rw ON public.crm_connections FOR ALL TO app_user
  USING (app.is_member(organization_id))
  WITH CHECK (app.is_member(organization_id));

CREATE POLICY crm_events_read ON public.crm_events FOR SELECT TO app_user
  USING (
    app.is_member(organization_id)
    OR EXISTS (
         SELECT 1 FROM public.agency_clients ac
          WHERE ac.client_org_id = crm_events.organization_id
            AND app.is_member(ac.agency_org_id))
  );
