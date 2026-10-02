-- The agency's invite form has always asked for the client's workspace name and
-- owner name, and always discarded both: the mutation sent neither, and there
-- was nowhere to put them. Signup, meanwhile, hid its own workspace-name field
-- whenever a clientInvite token was present, on the assumption the invite would
-- supply it — so the name arrived empty and Better Auth rejected the
-- organization with "[body.name] Too small".
--
-- Both columns are nullable: invites created before this migration keep working,
-- and the signup form simply starts from an empty field for them.
ALTER TABLE public.agency_client_invites
  ADD COLUMN IF NOT EXISTS client_workspace_name text,
  ADD COLUMN IF NOT EXISTS client_owner_name     text;
