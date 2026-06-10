ALTER TABLE public.agency_invites
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'agency_invite';
ALTER TABLE public.agency_invites
  DROP CONSTRAINT IF EXISTS agency_invites_kind_check;
ALTER TABLE public.agency_invites
  ADD CONSTRAINT agency_invites_kind_check
  CHECK (kind IN ('agency_invite', 'client_invite'));
CREATE INDEX IF NOT EXISTS agency_invites_kind_idx ON public.agency_invites(kind);