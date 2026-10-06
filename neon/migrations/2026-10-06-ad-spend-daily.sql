-- The dashboard reported spend as a hardcoded 0, so the ROI and ROAS cards were
-- permanently empty - the one figure the product exists to show.
--
-- Spend is cached per day rather than queried on each dashboard load: the
-- dashboard is opened constantly, a Google Ads query takes about a second, and
-- yesterday's spend does not change. The day rows are the unit because every
-- range the dashboard offers is a sum of days.
CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
  organization_id uuid        NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  network         ad_network  NOT NULL,
  day             date        NOT NULL,
  cost_micros     bigint      NOT NULL,
  -- The ad account's own currency, which need not match the workspace default.
  currency        text        NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, network, day)
);

CREATE INDEX IF NOT EXISTS ad_spend_daily_org_day_idx
  ON public.ad_spend_daily (organization_id, day DESC);

ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;

-- Readable by the workspace and by an agency managing it, the same reach the
-- dashboard figures already have. Written only on the owner connection by the
-- sync, so no INSERT or UPDATE is granted here.
GRANT SELECT ON public.ad_spend_daily TO app_user;

CREATE POLICY ad_spend_daily_read ON public.ad_spend_daily FOR SELECT TO app_user
  USING (
    app.is_member(organization_id)
    OR EXISTS (
         SELECT 1 FROM public.agency_clients ac
          WHERE ac.client_org_id = ad_spend_daily.organization_id
            AND app.is_member(ac.agency_org_id))
  );
