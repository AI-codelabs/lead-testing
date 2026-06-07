
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type text NOT NULL DEFAULT 'standard' CHECK (account_type IN ('standard','agency')),
  workspace_key text NOT NULL UNIQUE,
  workspace_name text NOT NULL DEFAULT 'My workspace',
  owner_name text NOT NULL DEFAULT '',
  owner_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
