-- "Not connected" was shown to every user of every workspace, including ones
-- with a perfectly good refresh token stored.
--
-- ad_platform_credentials deliberately has no grant to app_user — the tokens
-- must never be readable from a user-scoped connection. But the settings query
-- tested for a credential with an EXISTS subquery against that same table, so
-- the whole SELECT failed with "permission denied", the page fell into its
-- catch, and the catch reports connected = false. Nothing could ever say
-- connected, and because the account list only loads once connected is true,
-- the account picker stayed empty too.
--
-- This answers the only question app_user needs answered — is there a usable
-- credential — without exposing the row it is derived from.
CREATE OR REPLACE FUNCTION app.ad_platform_connected(org uuid, net ad_network)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT app.is_member(org)
     AND EXISTS (
           SELECT 1 FROM public.ad_platform_credentials c
            WHERE c.organization_id = org
              AND c.network = net
              AND c.refresh_token IS NOT NULL)
$$;

REVOKE ALL ON FUNCTION app.ad_platform_connected(uuid, ad_network) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ad_platform_connected(uuid, ad_network) TO app_user;
