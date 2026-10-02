-- The account page displayed a hardcoded "America/New_York" for every
-- workspace. Store a real one. Europe/Amsterdam as the default because that is
-- where the product is sold, and it beats showing everyone a timezone that is
-- wrong for them.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Amsterdam';
