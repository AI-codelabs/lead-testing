
DROP POLICY IF EXISTS "Public can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can update leads" ON public.leads;
REVOKE INSERT ON public.leads FROM anon;
