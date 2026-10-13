-- Count a Meta connection as a connection.
--
-- The function only looked at refresh_token, which is what Google's OAuth
-- leaves behind. Meta has no OAuth round trip here -- the customer pastes a
-- long-lived System User token, which is stored as access_token -- so a fully
-- working Meta setup reported itself as not connected, forever.
CREATE OR REPLACE FUNCTION app.ad_platform_connected(org uuid, net ad_network)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT app.is_member(org)
     AND EXISTS (
           SELECT 1 FROM public.ad_platform_credentials c
            WHERE c.organization_id = org
              AND c.network = net
              AND COALESCE(c.refresh_token, c.access_token) IS NOT NULL)
$$;
