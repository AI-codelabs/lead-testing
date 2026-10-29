-- Server-side duplicate guard for incoming leads.
--
-- One workspace collected 393 leads from 17 people: the same submission
-- arriving every nine to eleven seconds, up to 97 times for one person. That
-- is not untidiness. The customer loses the overview, and every copy is a
-- separate row that can be marked won and reported to an ad platform as its
-- own conversion.
--
-- The tracker has its own guard, but it is best effort by construction: it
-- cannot see what another tab, a retry, or a re-fire after reload has already
-- sent. The server is the only place that can answer this, and the ingest role
-- holds INSERT on public.leads and nothing else -- deliberately, so a leaked
-- ingest key can never read leads back. Hence a SECURITY DEFINER function that
-- answers one boolean and discloses nothing else.
CREATE OR REPLACE FUNCTION app.is_duplicate_lead(
  p_org             uuid,
  p_email           text,
  p_phone           text,
  p_name            text,
  p_page_path       text,
  p_window_minutes  integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- Same person, same answers, same page, within the window. A genuine second
  -- enquiry an hour later still gets its own row.
  SELECT EXISTS (
    SELECT 1
      FROM public.leads d
     WHERE d.organization_id = p_org
       AND d.created_at > now() - make_interval(mins => greatest(p_window_minutes, 0))
       AND lower(coalesce(d.email, ''))     = lower(coalesce(p_email, ''))
       AND coalesce(d.phone, '')            = coalesce(p_phone, '')
       AND lower(coalesce(d.name, ''))      = lower(coalesce(p_name, ''))
       AND coalesce(d.page_path, '')        = coalesce(p_page_path, '')
  )
$$;

REVOKE ALL ON FUNCTION app.is_duplicate_lead(uuid, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_duplicate_lead(uuid, text, text, text, text, integer) TO app_ingest;
GRANT EXECUTE ON FUNCTION app.is_duplicate_lead(uuid, text, text, text, text, integer) TO app_user;

-- Makes the lookup an index scan rather than a sweep of the workspace.
CREATE INDEX IF NOT EXISTS leads_org_created_dedupe_idx
  ON public.leads (organization_id, created_at DESC);
