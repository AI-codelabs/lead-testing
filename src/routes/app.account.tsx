import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Lock, Monitor, Moon, Sun } from "lucide-react";
import { AgencyAccessPanel } from "@/components/account/agency-access-panel";
import { ReceivedInvitesPanel } from "@/components/account/received-invites-panel";
import { TeamMembersPanel } from "@/components/account/team-members-panel";
import { useAccount } from "@/lib/account-context";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { authClient } from "@/auth/client";
import { renameOrganization, updateProfileName } from "@/auth/session";
import {
  CURRENCIES,
  getOrganization,
  updateWorkspaceSettings,
} from "@/lib/organization.functions";


export const Route = createFileRoute("/app/account")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Account — Leadlogr" }] }),
  ssr: false,
  component: AccountPage,
});

function AccountPage() {
  const { isAgencyViewing, ownWorkspace } = useAccount();
  if (isAgencyViewing) {
    return (
      <div className="max-w-xl mx-auto mt-20 rounded-xl bg-card shadow-xs ring-1 ring-border p-8 text-center">
        <div className="size-10 rounded-full bg-muted ring-1 ring-border mx-auto flex items-center justify-center mb-4">
          <Lock className="size-4 text-muted-foreground" />
        </div>
        <h2 className="font-semibold">Account settings are private to the client</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          As an agency you cannot view or change a client's account, billing, or workspace settings. Manage your own agency from your agency account page.
        </p>
        <Link
          to="/agency/account"
          className="inline-flex mt-5 text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
        >
          Go to agency account
        </Link>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Manage your profile, workspace, billing, and team access."
      />

      <div className="space-y-4">
        <SectionCard
          title="Invitations"
          description="Agencies that have asked to manage this workspace."
        >
          <ReceivedInvitesPanel />
        </SectionCard>

        <SectionCard
          title="Team"
          description="People and agencies that can access this workspace. Owners and admins can invite."
        >
          <TeamMembersPanel />
        </SectionCard>

        <SectionCard title="Agency access" description="Invite an agency and control what they can see in your workspace.">
          <AgencyAccessPanel />
        </SectionCard>

        <SectionCard title="Profile" description="How your name appears across the workspace.">
          <ProfilePanel />
        </SectionCard>

        <SectionCard title="Appearance" description="Choose how Leadlogr looks. The selected theme is saved to this device.">
          <ThemeSwitcher />
        </SectionCard>

        <SectionCard title="Workspace" description="The name, currency and timezone this workspace runs on.">
          <WorkspacePanel />
        </SectionCard>

        <SectionCard title="Billing" description="Not set up yet.">
          {/* Was "Growth · $99/mo, next invoice Jul 1 2026" with a button that
              did nothing. No plan exists and nothing is charged, so saying so
              beats showing a figure nobody is paying. */}
          <p className="text-sm text-muted-foreground">
            There is no plan on this workspace and nothing is being charged. Billing arrives
            with pricing.
          </p>
        </SectionCard>

        <SectionCard title="Danger zone" description="Irreversible actions for this workspace.">
          {/* Disabled rather than removed: deleting a workspace takes its leads,
              integrations and agency links with it, and nothing implements that
              yet. A button that silently does nothing is worse than none. */}
          <button
            type="button"
            disabled
            title="Not available yet — ask support to delete a workspace"
            className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border text-muted-foreground cursor-not-allowed opacity-60"
          >
            Delete workspace
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            Deleting a workspace removes its leads, integrations and agency links. Not available
            from here yet.
          </p>
        </SectionCard>
      </div>
    </>
  );
}

/**
 * Editable profile and workspace settings.
 *
 * These rows were display-only, with Timezone, Currency and Seats hardcoded —
 * so a client invited into a workspace an agency named had nowhere to correct
 * anything about themselves. Saving is per-section rather than per-field: one
 * explicit Save beats a field that quietly writes on blur.
 */
function ProfilePanel() {
  const { ownWorkspace } = useAccount();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Seeded from the session rather than from local state, which holds the email
  // as the owner name until the real one is known.
  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then(({ data }) => {
      if (cancelled) return;
      setName(data?.user?.name ?? "");
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const save = useMutation({
    mutationFn: () => updateProfileName(name),
    onSuccess: () => {
      toast.success("Name saved.");
      void qc.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save your name"),
  });

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <FieldRow label="Full name">
          <input
            id="profile-name"
            value={name}
            disabled={!loaded}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </FieldRow>
        {/* The email is the sign-in identity; changing it needs a verification
            round trip that nothing sends yet, so it stays read-only. */}
        <Row label="Email" value={ownWorkspace.ownerEmail || "Not set"} />
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!loaded || !name.trim() || save.isPending}
        className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save name"}
      </button>
    </div>
  );
}

/** Timezones offered in the picker; any IANA zone is accepted by the server. */
const TIMEZONES = [
  "Europe/Amsterdam", "Europe/Brussels", "Europe/London", "Europe/Berlin",
  "Europe/Paris", "Europe/Madrid", "Europe/Lisbon", "Europe/Stockholm",
  "Europe/Warsaw", "UTC", "America/New_York", "America/Chicago",
  "America/Los_Angeles", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney",
];

function WorkspacePanel() {
  const { ownWorkspace, activeOrganizationId } = useAccount();
  const qc = useQueryClient();
  const getFn = useServerFn(getOrganization);
  const saveFn = useServerFn(updateWorkspaceSettings);

  const { data: org } = useQuery({
    queryKey: ["organization", activeOrganizationId],
    queryFn: () => getFn({ data: { organizationId: activeOrganizationId } }),
    enabled: !!activeOrganizationId,
  });

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");

  // Only seeds empty fields, so a reply arriving mid-edit cannot overwrite what
  // is being typed.
  useEffect(() => {
    if (!org) return;
    setName((c) => c || org.name);
    setCurrency((c) => c || org.defaultCurrency);
    setTimezone((c) => c || org.timezone);
  }, [org]);

  const save = useMutation({
    mutationFn: async () => {
      if (org && name.trim() && name.trim() !== org.name) {
        await renameOrganization(activeOrganizationId, name.trim());
      }
      await saveFn({
        data: { organizationId: activeOrganizationId, defaultCurrency: currency, timezone },
      });
    },
    onSuccess: () => {
      toast.success("Workspace updated.");
      void qc.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the workspace"),
  });

  const dirty =
    !!org && (name.trim() !== org.name || currency !== org.defaultCurrency || timezone !== org.timezone);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <FieldRow label="Workspace name">
          <input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My business"
            className="w-full rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </FieldRow>
        <Row label="Workspace ID" value={ownWorkspace.key} mono />
        <FieldRow label="Default currency" hint="Used when reporting deal values back to ad platforms.">
          <select
            id="workspace-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {currency && !CURRENCIES.includes(currency as never) && <option value={currency}>{currency}</option>}
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Timezone" hint="Stored with the workspace. Nothing schedules against it yet.">
          <select
            id="workspace-timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {timezone && !TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FieldRow>
      </div>
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {save.isPending ? "Saving…" : "Save workspace"}
      </button>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-6">
      <div className="mb-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`text-sm mt-1 ${mono ? "font-mono" : "font-medium"}`}>{value}</div>
    </div>
  );
}

function ThemeSwitcher() {
  const { theme, resolved, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: typeof Sun; hint: string }[] = [
    { value: "light", label: "Light", icon: Sun, hint: "Bright surfaces for daytime." },
    { value: "dark", label: "Dark", icon: Moon, hint: "Deep ink — default experience." },
    { value: "system", label: "System", icon: Monitor, hint: "Follow your OS preference." },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map(({ value, label, icon: Icon, hint }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={`text-left rounded-md p-3 ring-1 transition-colors ${
                active
                  ? "ring-foreground bg-muted"
                  : "ring-border bg-card hover:bg-muted/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4" />
                <span className="text-sm font-semibold">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{hint}</p>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Currently using <span className="font-medium text-foreground">{resolved}</span> theme.
      </p>
    </div>
  );
}

