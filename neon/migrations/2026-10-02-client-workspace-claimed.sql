-- Whether a client has taken over a workspace is state, not something to infer.
-- The first attempt compared the workspace's owners against the agency's own
-- members, which mislabels the legitimate case of one person owning both an
-- agency and a client workspace: a real client reads as "awaiting client"
-- forever. Record it instead.
ALTER TABLE public.agency_clients
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Every link that exists today was created by the old client-initiated flow,
-- where the client signed up first and the link followed. All claimed.
UPDATE public.agency_clients SET claimed_at = created_at WHERE claimed_at IS NULL;

-- Superseded by the column above.
DROP FUNCTION IF EXISTS app.client_workspace_owner(uuid, uuid);

-- Marks a pre-made workspace as taken over, called when its owner invite is
-- accepted. SECURITY DEFINER because app_user holds no UPDATE on this table,
-- and deliberately so: the only permitted change is this one transition, by the
-- person who just proved they own the workspace.
CREATE OR REPLACE FUNCTION app.claim_client_workspace(client_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, neon_auth, pg_catalog AS $$
BEGIN
  IF NOT app.has_role(client_org, ARRAY['owner']) THEN
    RETURN false;
  END IF;
  UPDATE public.agency_clients
     SET claimed_at = now()
   WHERE client_org_id = client_org AND claimed_at IS NULL;
  RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION app.claim_client_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_client_workspace(uuid) TO app_user;
