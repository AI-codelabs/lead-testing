
-- Allow new invite kind
ALTER TABLE public.agency_invites DROP CONSTRAINT agency_invites_kind_check;
ALTER TABLE public.agency_invites ADD CONSTRAINT agency_invites_kind_check
  CHECK (kind IN ('agency_invite','client_invite','agency_member'));

-- Team membership
CREATE TABLE public.agency_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_members TO authenticated;
GRANT ALL ON public.agency_members TO service_role;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.effective_agency_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT agency_id FROM public.agency_members WHERE user_id = _user_id LIMIT 1),
    (SELECT id FROM public.profiles WHERE id = _user_id AND account_type = 'agency')
  );
$$;

CREATE POLICY "Team members can read team roster"
  ON public.agency_members
  FOR SELECT
  TO authenticated
  USING (agency_id = public.effective_agency_id(auth.uid()));

CREATE POLICY "Owners can manage team"
  ON public.agency_members
  FOR ALL
  TO authenticated
  USING (
    agency_id = public.effective_agency_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = public.effective_agency_id(auth.uid())
        AND am.user_id = auth.uid()
        AND am.role = 'owner'
    )
  )
  WITH CHECK (
    agency_id = public.effective_agency_id(auth.uid())
  );

-- Backfill: every existing agency is its own owner
INSERT INTO public.agency_members (agency_id, user_id, role)
SELECT id, id, 'owner' FROM public.profiles WHERE account_type = 'agency'
ON CONFLICT (user_id) DO NOTHING;
