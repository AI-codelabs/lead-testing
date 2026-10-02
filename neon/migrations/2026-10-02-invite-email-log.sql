-- Invite history showed a hardcoded "not sent" for every row, because nothing
-- sent anything. Now that it does, record the outcome so the column reports
-- what actually happened rather than a constant.
--
-- Keyed by invite id so it covers both kinds: neon_auth.invitation for a person
-- joining a workspace, and public.agency_client_invites for an agency inviting
-- a whole company. Better Auth owns the first of those tables, so the log has
-- to live beside them rather than inside either.
CREATE TABLE IF NOT EXISTS public.invite_email_log (
  invite_id       uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  email           text NOT NULL,
  status          text NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id     text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_email_log_org_idx
  ON public.invite_email_log (organization_id, created_at DESC);

ALTER TABLE public.invite_email_log ENABLE ROW LEVEL SECURITY;

-- Readable by the organization that sent it. Writes happen on the owner
-- connection from the send path, so app_user is granted no INSERT: a client
-- cannot fabricate a delivery record.
GRANT SELECT ON public.invite_email_log TO app_user;

CREATE POLICY invite_email_log_read ON public.invite_email_log FOR SELECT TO app_user
  USING (app.is_member(organization_id));
