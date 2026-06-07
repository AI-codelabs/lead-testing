-- Drop the permissive public read policy
DROP POLICY IF EXISTS "Anyone can read leads" ON public.leads;

-- Remove leads from the realtime publication so changes are no longer broadcast publicly
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.leads';
  END IF;
END $$;

-- Revoke any direct Data API access for anon/authenticated. All reads/writes
-- must go through server functions using the service role.
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.leads FROM authenticated;
GRANT ALL ON public.leads TO service_role;