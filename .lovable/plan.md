# Two Account Types: Standard & Agency

This is a sizable architectural shift. Below is the proposed plan before I touch any code.

## Concept

- **Standard Account** — owns one workspace (the current app experience). Can invite an agency and control what that agency sees.
- **Agency Account** — manages many client workspaces. Simplified UI focused on overview + switching into a client's workspace.

## New Data Model (frontend mock, no backend yet)

```text
Account
  ├─ type: "standard" | "agency"
  ├─ id, name, email
  └─ (agency only) clientWorkspaces: Workspace[]

Workspace
  ├─ id, name, ownerAccountId
  ├─ monthlyReferralFee
  ├─ leads, pipeline, integrations, etc. (existing data)
  └─ agencyAccess: {
       agencyId,
       level: "full" | "names_only" | "metrics_only"
     } | null
```

Persisted in `localStorage` for now, ready to swap to Lovable Cloud later.

## New Pages / Routes

### Standard account (existing app, +1 settings panel)
- `/app/*` — unchanged
- `/app/account` — add an **"Agency Access"** section:
  - Invite agency by email
  - Permission level selector: Full / Names only / Read-only metrics
  - Revoke access

### Agency account (new, minimal)
- `/agency` — **Overview**: table of all client workspaces with name, monthly referral fee, total leads, conversion rate, "Open workspace" button
- `/agency/new-client` — Create a new workspace on behalf of a client
- When agency clicks "Open workspace" → enters that workspace in **agency view mode** (existing `/app/*` UI but filtered by the workspace's permission level)

### Account switching
- Account type chosen at signup (or via a dev toggle in `/app/account` for now)
- Top-bar switcher when an agency is "inside" a client workspace (shows "Viewing as agency · [Client name] · Exit")

## Permission Enforcement (UI layer)

A `useWorkspaceAccess()` hook returns the current access level. Components check it:

- **full** → render as today
- **names_only** → show lead names, hide email/phone/value/notes; pipeline stage names visible, no card details
- **metrics_only** → only dashboard charts/numbers; CRM and Pipeline pages show a "Restricted by client" empty state with aggregate counts only

## Files to Add

```text
src/lib/account-context.tsx          # AccountProvider + useAccount, useWorkspace
src/lib/workspace-access.ts          # access level enum + helpers
src/routes/agency.tsx                # agency layout
src/routes/agency.index.tsx          # client overview table
src/routes/agency.new-client.tsx     # create workspace form
src/components/agency/ClientCard.tsx
src/components/agency/AgencyBar.tsx  # "viewing as agency" top bar
src/components/account/AgencyAccessPanel.tsx
```

## Files to Edit

```text
src/routes/__root.tsx                # mount AccountProvider, AgencyBar
src/routes/app.account.tsx           # add Agency Access section + account-type toggle
src/routes/app.dashboard.tsx         # respect access level
src/routes/app.crm.tsx               # gate fields by access level
src/routes/app.pipeline.tsx          # gate card detail by access level
src/components/leadlogr/lead-types.ts # add workspace scoping to SEED data
```

## Out of Scope (this round)
- Real auth / Lovable Cloud wiring — staying on local state so you can validate the flow first
- Billing for referral fees — just a display field
- Multi-agency per workspace — one agency relationship per workspace

## Open Questions

1. **Signup flow:** should account type be picked on a new auth screen, or is a toggle in `/app/account` enough for now (since auth is mocked)?
2. **Agency in "names only" mode** — should they still see pipeline stage *counts*, or nothing past the lead list?
3. **Referral fee** — entered by the agency per client, or by the client? Currency assumption (EUR)?

Reply with answers (or "go ahead, your call") and I'll implement.