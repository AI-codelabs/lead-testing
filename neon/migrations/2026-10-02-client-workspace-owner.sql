-- An agency can now create a client's workspace before the client exists. While
-- it is unclaimed the only owner is the agency member who created it, so
-- app.org_owner reports the agency's own person as the client contact, which
-- reads as if the client had already joined.
--
-- This resolves the owner who is NOT one of the agency's own people: null while
-- the workspace is unclaimed, the real client once they accept.
CREATE OR REPLACE FUNCTION app.client_workspace_owner(agency uuid, client uuid)
RETURNS TABLE (name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = neon_auth, public, pg_catalog AS $$
  SELECT u.name, u.email
    FROM neon_auth."member" m
    JOIN neon_auth."user" u ON u.id = m."userId"
   WHERE m."organizationId" = client
     AND m.role = 'owner'
     AND NOT EXISTS (
           SELECT 1 FROM neon_auth."member" am
            WHERE am."organizationId" = agency AND am."userId" = m."userId")
     -- Readable only by the managing agency's own members, and only for a
     -- workspace it actually manages.
     AND app.is_member(agency)
     AND EXISTS (
           SELECT 1 FROM public.agency_clients ac
            WHERE ac.agency_org_id = agency AND ac.client_org_id = client)
   ORDER BY m."createdAt"
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.client_workspace_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.client_workspace_owner(uuid, uuid) TO app_user;
