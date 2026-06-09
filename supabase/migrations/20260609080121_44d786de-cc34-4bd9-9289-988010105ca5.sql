
-- Extend profiles with agency linkage
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_access text CHECK (agency_access IN ('full','names_only','metrics_only'));

CREATE INDEX IF NOT EXISTS profiles_agency_id_idx ON public.profiles(agency_id);

-- Invitation status enum
DO $$ BEGIN
  CREATE TYPE public.agency_invite_status AS ENUM ('pending','accepted','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.agency_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_workspace_name text NOT NULL,
  inviter_email text NOT NULL,
  agency_email text NOT NULL,
  agency_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  access_level text NOT NULL DEFAULT 'full' CHECK (access_level IN ('full','names_only','metrics_only')),
  token text NOT NULL UNIQUE,
  status public.agency_invite_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_invites_inviter_idx ON public.agency_invites(inviter_id);
CREATE INDEX IF NOT EXISTS agency_invites_agency_email_idx ON public.agency_invites(lower(agency_email));
CREATE INDEX IF NOT EXISTS agency_invites_agency_id_idx ON public.agency_invites(agency_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_invites TO authenticated;
GRANT ALL ON public.agency_invites TO service_role;

ALTER TABLE public.agency_invites ENABLE ROW LEVEL SECURITY;

-- Inviter can manage their own invites
CREATE POLICY "inviter_select_own_invites" ON public.agency_invites
  FOR SELECT TO authenticated
  USING (inviter_id = auth.uid());

CREATE POLICY "inviter_insert_own_invites" ON public.agency_invites
  FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid());

CREATE POLICY "inviter_update_own_invites" ON public.agency_invites
  FOR UPDATE TO authenticated
  USING (inviter_id = auth.uid());

-- Recipient agency (matched by linked profile id OR matching email) can view + update their invites
CREATE POLICY "agency_select_received_invites" ON public.agency_invites
  FOR SELECT TO authenticated
  USING (
    agency_id = auth.uid() OR
    lower(agency_email) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  );

CREATE POLICY "agency_update_received_invites" ON public.agency_invites
  FOR UPDATE TO authenticated
  USING (
    agency_id = auth.uid() OR
    lower(agency_email) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  );

CREATE TRIGGER set_agency_invites_updated_at
  BEFORE UPDATE ON public.agency_invites
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
