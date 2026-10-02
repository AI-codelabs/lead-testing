-- The picker has always offered three levels; the column stored two, and the
-- form cast whatever it was given, so "Limited (names only)" was saved as
-- 'full'. Worse, nothing read the column: the agency read policy on leads does
-- not mention it, and the only enforcement lived in browser code that hid
-- fields the server had already sent. Make the vocabulary honest first.
ALTER TABLE public.agency_clients        DROP CONSTRAINT IF EXISTS agency_clients_access_level_check;
ALTER TABLE public.agency_client_invites DROP CONSTRAINT IF EXISTS agency_client_invites_access_level_check;

-- read_only predates the three-level picker; names_only is its closest meaning.
UPDATE public.agency_clients        SET access_level = 'names_only' WHERE access_level = 'read_only';
UPDATE public.agency_client_invites SET access_level = 'names_only' WHERE access_level = 'read_only';

ALTER TABLE public.agency_clients
  ADD CONSTRAINT agency_clients_access_level_check
  CHECK (access_level IN ('full', 'names_only', 'metrics_only'));
ALTER TABLE public.agency_client_invites
  ADD CONSTRAINT agency_client_invites_access_level_check
  CHECK (access_level IN ('full', 'names_only', 'metrics_only'));

-- Lets a client set what its agency may see. SECURITY DEFINER because app_user
-- holds no UPDATE on agency_clients; the owner of the CLIENT side is the only
-- caller permitted, so an agency cannot widen its own access.
CREATE OR REPLACE FUNCTION app.set_agency_access(client_org uuid, level text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, neon_auth, pg_catalog AS $$
BEGIN
  IF level NOT IN ('full', 'names_only', 'metrics_only') THEN
    RAISE EXCEPTION 'Unknown access level %', level;
  END IF;
  IF NOT app.has_role(client_org, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Only the workspace owner can change agency access';
  END IF;
  UPDATE public.agency_clients SET access_level = level WHERE client_org_id = client_org;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION app.set_agency_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_agency_access(uuid, text) TO app_user;

-- What an agency may see in a workspace it manages but does not belong to.
-- Returns null when there is no such relationship.
CREATE OR REPLACE FUNCTION app.agency_access_level(client_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, neon_auth, pg_catalog AS $$
  SELECT ac.access_level
    FROM public.agency_clients ac
   WHERE ac.client_org_id = client_org
     AND app.is_member(ac.agency_org_id)
   ORDER BY CASE ac.access_level
              WHEN 'full' THEN 0 WHEN 'names_only' THEN 1 ELSE 2 END
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.agency_access_level(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.agency_access_level(uuid) TO app_user;
