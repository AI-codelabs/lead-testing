-- Back-end backstop for a half-filled form arriving before the finished one.
--
-- One submission on hollandhuurt.nl produced four leads: "Test"/"te", then
-- "Test@test.nl", then with a phone number, then with the phone number
-- corrected -- a snapshot of the form every ten seconds as it was typed. The
-- tracker is where that is fixed (it no longer treats a third-party analytics
-- ping as a submission), but the tracker is best effort by construction: it
-- runs in someone else's page, beside scripts nobody has seen, and it cannot
-- be redeployed into a GTM container we do not control.
--
-- app.is_duplicate_lead cannot help here, because these rows are not
-- duplicates -- each one genuinely differs from the last. What they are is one
-- enquiry being completed. So this asks a different question: is the lead
-- arriving now the same form, in the same visit, with the same answers only
-- further along? If so it replaces the earlier row instead of joining it.
--
-- SECURITY DEFINER for the usual reason: the ingest role holds INSERT on
-- public.leads and nothing else, deliberately, so a leaked ingest key can
-- never read leads back. It gets an id or NULL, and no other way in.

-- Is p_new the same answer as p_old, only more complete?
CREATE OR REPLACE FUNCTION app.extends_value(p_old text, p_new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  -- A field that was empty is extended by anything, including by staying
  -- empty. A field that had a value must still be contained in the new one:
  --   'te'         -> 'test@test.nl'      yes, still being typed
  --   '061234567'  -> '0612345678'        yes, one more digit
  --   '0612345678' -> '+31 0612345678'    yes, a prefix added
  --   'Jan'        -> 'Peter'             no, a different person
  -- Containment rather than a prefix test, because people correct the front of
  -- a phone number as often as the end of it.
  SELECT CASE
    WHEN coalesce(p_old, '') = '' THEN true
    WHEN coalesce(p_new, '') = '' THEN false
    ELSE position(
           lower(regexp_replace(p_old, '\s+', '', 'g'))
           IN  lower(regexp_replace(p_new, '\s+', '', 'g'))
         ) > 0
  END
$$;

REVOKE ALL ON FUNCTION app.extends_value(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.extends_value(text, text) TO app_ingest;
GRANT EXECUTE ON FUNCTION app.extends_value(text, text) TO app_user;

CREATE OR REPLACE FUNCTION app.supersede_lead(
  p_org            uuid,
  p_session        text,
  p_form_action    text,
  p_page_path      text,
  p_name           text,
  p_email          text,
  p_phone          text,
  p_message        text,
  p_company        text,
  p_window_minutes integer DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Without a session there is nothing to tie the two rows together, and
  -- merging on form and page alone would collapse two different people
  -- enquiring from the same page minutes apart.
  IF coalesce(p_session, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT l.id INTO v_id
    FROM public.leads l
   WHERE l.organization_id = p_org
     AND l.created_at > now() - make_interval(mins => greatest(p_window_minutes, 0))
     AND coalesce(l.custom_fields->>'session_id', '')  = p_session
     AND coalesce(l.custom_fields->>'form_action', '') = coalesce(p_form_action, '')
     AND coalesce(l.page_path, '')                     = coalesce(p_page_path, '')
     AND app.extends_value(l.name,    p_name)
     AND app.extends_value(l.email,   p_email)
     AND app.extends_value(l.phone,   p_phone)
     AND app.extends_value(l.message, p_message)
     AND app.extends_value(l.company, p_company)
   ORDER BY l.created_at DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fill in what the visitor has since added. coalesce keeps whatever the
  -- earlier row already held when the new one happens to omit it, so this can
  -- only ever make a lead more complete.
  UPDATE public.leads
     SET name       = coalesce(nullif(p_name, ''),    name),
         email      = coalesce(nullif(p_email, ''),   email),
         phone      = coalesce(nullif(p_phone, ''),   phone),
         message    = coalesce(nullif(p_message, ''), message),
         company    = coalesce(nullif(p_company, ''), company),
         updated_at = now()
   WHERE id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION app.supersede_lead(uuid, text, text, text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.supersede_lead(uuid, text, text, text, text, text, text, text, text, integer) TO app_ingest;
GRANT EXECUTE ON FUNCTION app.supersede_lead(uuid, text, text, text, text, text, text, text, text, integer) TO app_user;

-- The lookup is already narrowed by (organization_id, created_at DESC) from
-- the duplicate-guard migration; this makes the session the next cut rather
-- than a scan of the window.
CREATE INDEX IF NOT EXISTS leads_org_session_idx
  ON public.leads (organization_id, (custom_fields->>'session_id'), created_at DESC);
