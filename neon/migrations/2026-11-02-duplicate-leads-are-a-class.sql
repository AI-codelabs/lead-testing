-- One submission must not become several leads, on anybody's site.
--
-- The first version of supersede_lead required the lead's form_action to match
-- exactly. That value comes from the visitor's page, and a form field named
-- "action" shadows the property it was read from -- Forminator ships one, so
-- four real Holland Huurt enquiries arrived tagged {} and were booked two or
-- three times each. The comparison could never hold, and nothing said so.
--
-- The lesson is not about Forminator. A key built from a value we neither
-- generate nor validate will fail again on the next plugin, and it buys
-- nothing: session_id is ours, page_path is stable, and extends_value already
-- refuses to merge two people or two different answers. So form_action is no
-- longer part of the match. The parameter stays so the existing call site
-- keeps working and the database can be migrated before the code.

CREATE OR REPLACE FUNCTION app.supersede_lead(
  p_org uuid, p_session text, p_form_action text, p_page_path text,
  p_name text, p_email text, p_phone text, p_message text, p_company text,
  p_window_minutes integer DEFAULT 10
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Without a session there is nothing trustworthy to match on.
  IF coalesce(p_session, '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT l.id INTO v_id
    FROM public.leads l
   WHERE l.organization_id = p_org
     AND l.created_at > now() - make_interval(mins => greatest(p_window_minutes, 0))
     AND coalesce(l.custom_fields->>'session_id', '') = p_session
     AND coalesce(l.page_path, '')                    = coalesce(p_page_path, '')
     -- p_form_action is deliberately not compared; see the note above.
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
$function$;

-- A phone number compared the way a person would read it.
-- Formatters rewrite 0634893503 into +31 0634893503 mid-submit, which is a
-- different string and the same number. The last nine digits survive both.
CREATE OR REPLACE FUNCTION app.phone_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
           WHEN coalesce(p, '') = '' THEN ''
           ELSE right(regexp_replace(p, '\D', '', 'g'), 9)
         END;
$$;

-- What slipped through, for any workspace.
-- Detection matters as much as the fix: this one was found by watching a
-- video. One row per group of leads that look like one enquiry arriving more
-- than once -- same session, same page, same person, inside the window.
CREATE OR REPLACE FUNCTION app.find_duplicate_leads(
  p_org uuid DEFAULT NULL, p_window_minutes integer DEFAULT 60
) RETURNS TABLE (
  organization_id uuid, session_id text, page_path text,
  who text, copies bigint, first_seen timestamptz, last_seen timestamptz,
  keep_id uuid, duplicate_ids uuid[], safe_to_collapse boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $$
  WITH g AS (
    SELECT l.organization_id,
           coalesce(l.custom_fields->>'session_id', '') AS sid,
           coalesce(l.page_path, '')                    AS page,
           lower(coalesce(nullif(l.email, ''), app.phone_key(l.phone), lower(l.name), '')) AS who,
           l.id, l.created_at, l.stage, l.notes, l.tags
      FROM public.leads l
     WHERE (p_org IS NULL OR l.organization_id = p_org)
       AND coalesce(l.custom_fields->>'session_id', '') <> ''
       AND l.excluded = false
  )
  SELECT g.organization_id, g.sid, g.page, g.who,
         count(*) AS copies,
         min(g.created_at), max(g.created_at),
         (array_agg(g.id ORDER BY g.created_at))[1]                  AS keep_id,
         (array_agg(g.id ORDER BY g.created_at))[2:]                 AS duplicate_ids,
         -- Only untouched leads are safe to merge automatically: one stage
         -- between them, nobody's notes, nobody's tags.
         (count(DISTINCT g.stage) = 1
          AND count(*) FILTER (WHERE coalesce(g.notes, '') <> '') = 0
          AND count(*) FILTER (WHERE coalesce(array_length(g.tags, 1), 0) > 0) = 0) AS safe_to_collapse
    FROM g
   WHERE g.who <> ''
   GROUP BY g.organization_id, g.sid, g.page, g.who
  HAVING count(*) > 1
     AND max(g.created_at) - min(g.created_at)
         <= make_interval(mins => greatest(p_window_minutes, 0))
   ORDER BY copies DESC, max(g.created_at) DESC;
$$;

-- Collapse them, for any workspace, repeatably.
-- The earliest row is kept and each later one folded into it, longest value
-- winning per field, because "+31 6 21572792" is the same number written out
-- more fully. Groups a human has already touched are left alone. Dry run by
-- default: this deletes leads, so saying so out loud is the point.
CREATE OR REPLACE FUNCTION app.collapse_duplicate_leads(
  p_org uuid, p_window_minutes integer DEFAULT 60, p_dry_run boolean DEFAULT true
) RETURNS TABLE (kept uuid, removed integer, who text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM app.find_duplicate_leads(p_org, p_window_minutes)
     WHERE safe_to_collapse
  LOOP
    IF NOT p_dry_run THEN
      UPDATE public.leads k SET
        name    = (SELECT x.name    FROM public.leads x
                    WHERE x.id = ANY(r.duplicate_ids || r.keep_id)
                    ORDER BY length(coalesce(x.name, '')) DESC LIMIT 1),
        email   = (SELECT x.email   FROM public.leads x
                    WHERE x.id = ANY(r.duplicate_ids || r.keep_id)
                    ORDER BY length(coalesce(x.email, '')) DESC LIMIT 1),
        phone   = (SELECT x.phone   FROM public.leads x
                    WHERE x.id = ANY(r.duplicate_ids || r.keep_id)
                    ORDER BY length(coalesce(x.phone, '')) DESC LIMIT 1),
        message = (SELECT x.message FROM public.leads x
                    WHERE x.id = ANY(r.duplicate_ids || r.keep_id)
                    ORDER BY length(coalesce(x.message, '')) DESC LIMIT 1),
        company = (SELECT x.company FROM public.leads x
                    WHERE x.id = ANY(r.duplicate_ids || r.keep_id)
                    ORDER BY length(coalesce(x.company, '')) DESC LIMIT 1),
        updated_at = now()
      WHERE k.id = r.keep_id;

      DELETE FROM public.leads WHERE id = ANY(r.duplicate_ids);
    END IF;

    kept := r.keep_id;
    removed := coalesce(array_length(r.duplicate_ids, 1), 0);
    who := r.who;
    RETURN NEXT;
  END LOOP;
END;
$function$;
