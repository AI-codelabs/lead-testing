
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_name text;
  v_owner_name text;
  v_account_type text;
  v_workspace_key text;
  v_slug text;
BEGIN
  v_workspace_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'workspace_name',''), 'My workspace');
  v_owner_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'owner_name',''), NEW.email, 'Workspace owner');
  v_account_type := COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type',''), 'standard');
  IF v_account_type NOT IN ('standard','agency') THEN
    v_account_type := 'standard';
  END IF;
  v_slug := regexp_replace(lower(v_workspace_name), '[^a-z0-9]', '', 'g');
  IF v_slug = '' THEN v_slug := 'workspace'; END IF;
  v_workspace_key := 'ws_' || substr(v_slug, 1, 24) || '_' || substr(replace(gen_random_uuid()::text,'-',''), 1, 8);

  INSERT INTO public.profiles (id, account_type, workspace_key, workspace_name, owner_name, owner_email)
  VALUES (NEW.id, v_account_type, v_workspace_key, v_workspace_name, v_owner_name, COALESCE(NEW.email,''));

  -- Agency accounts always own their own workspace as the "owner" teammate.
  IF v_account_type = 'agency' THEN
    INSERT INTO public.agency_members (agency_id, user_id, role, invited_email)
    VALUES (NEW.id, NEW.id, 'owner', COALESCE(NEW.email,''))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill any existing agency profile that doesn't yet have an owner member row.
INSERT INTO public.agency_members (agency_id, user_id, role, invited_email)
SELECT p.id, p.id, 'owner', p.owner_email
FROM public.profiles p
LEFT JOIN public.agency_members m ON m.user_id = p.id
WHERE p.account_type = 'agency' AND m.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Ensure handle_new_user trigger is wired on auth.users (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;
