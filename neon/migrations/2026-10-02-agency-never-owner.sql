-- An agency must never own its client's workspace. Better Auth makes whoever
-- creates an organization its owner, so a workspace an agency builds starts out
-- agency-owned; this demotes the creator to admin immediately, leaving the
-- workspace with no owner until the client accepts and becomes its only one.
--
-- Admin, not nothing: getIngestKey, the integrations and the dashboard all check
-- membership, so an agency with none could not install a tracker or connect an
-- ad account - which is the whole reason for building the workspace first.
CREATE OR REPLACE FUNCTION app.demote_agency_creator(client_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, neon_auth, pg_catalog AS $$
DECLARE agency uuid;
BEGIN
  -- Only for a workspace the caller's own agency manages, and only while it is
  -- unclaimed. Never a route to change roles in someone else's workspace.
  SELECT ac.agency_org_id INTO agency
    FROM public.agency_clients ac
   WHERE ac.client_org_id = client_org
     AND ac.claimed_at IS NULL
     AND app.has_role(ac.agency_org_id, ARRAY['owner', 'admin'])
   LIMIT 1;
  IF agency IS NULL THEN RETURN false; END IF;

  UPDATE neon_auth."member"
     SET role = 'admin'
   WHERE "organizationId" = client_org
     AND "userId" = app.current_user_id()
     AND role = 'owner';
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION app.demote_agency_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.demote_agency_creator(uuid) TO app_user;
