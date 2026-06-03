import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Monitor, Moon, Sun } from "lucide-react";


export const Route = createFileRoute("/app/account")({
  head: () => ({ meta: [{ title: "Account — Leadlogr" }] }),
  component: AccountPage,
});

function AccountPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account"
        description="Manage your profile, workspace, billing, and team access."
      />

      <div className="space-y-4">
        <SectionCard title="Profile" description="How your name appears across the workspace.">
          <div className="grid md:grid-cols-2 gap-4">
            <Row label="Full name" value="Jane Doe" />
            <Row label="Email" value="jane@acmemedia.com" />
            <Row label="Role" value="Owner" />
            <Row label="Timezone" value="America/New_York" />
          </div>
        </SectionCard>

        <SectionCard title="Appearance" description="Choose how Leadlogr looks. The selected theme is saved to this device.">
          <ThemeSwitcher />
        </SectionCard>

        <SectionCard title="Workspace" description="Branding and defaults applied to every client account.">

          <div className="grid md:grid-cols-2 gap-4">
            <Row label="Agency name" value="Acme Media" />
            <Row label="Workspace ID" value="ws_8f3a2c1b" mono />
            <Row label="Default currency" value="USD" />
            <Row label="Seats used" value="4 of 10" />
          </div>
        </SectionCard>

        <SectionCard title="Billing" description="Your current plan and upcoming invoice.">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Growth · $99/mo</div>
              <div className="text-xs text-muted-foreground mt-1">Next invoice on Jul 1, 2026</div>
            </div>
            <button className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors">
              Manage billing
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Danger zone" description="Irreversible actions for this workspace.">
          <button className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-destructive/40 text-destructive hover:bg-destructive/10 transition-colors">
            Delete workspace
          </button>
        </SectionCard>
      </div>
    </>
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
    <div className="bg-card ring-1 ring-border rounded-lg p-6">
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
