import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Monitor, Moon, Plus, Sun, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useTheme, type Theme } from "@/components/theme-provider";
import { useAccount } from "@/lib/account-context";

export const Route = createFileRoute("/agency/account")({
  head: () => ({ meta: [{ title: "Account — Leadlogr Agency" }] }),
  ssr: false,
  component: AgencyAccountPage,
});

type TeamRole = "Owner" | "Admin" | "Member";
type TeamMember = { id: string; name: string; email: string; role: TeamRole };
type Invite = { id: string; email: string; role: TeamRole };

const SEED_TEAM: TeamMember[] = [
  { id: "u1", name: "Jane Doe", email: "jane@acmemedia.com", role: "Owner" },
  { id: "u2", name: "Mark Lin", email: "mark@acmemedia.com", role: "Admin" },
  { id: "u3", name: "Sara Park", email: "sara@acmemedia.com", role: "Member" },
];

function AgencyAccountPage() {
  const { ownWorkspace } = useAccount();
  const [team, setTeam] = useState<TeamMember[]>(SEED_TEAM);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("Member");

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInvites((p) => [...p, { id: `inv_${Date.now()}`, email: email.trim(), role }]);
    setEmail("");
    setRole("Member");
  };

  const removeMember = (id: string) =>
    setTeam((p) => p.filter((m) => m.id !== id || m.role === "Owner"));

  const revokeInvite = (id: string) =>
    setInvites((p) => p.filter((i) => i.id !== id));

  return (
    <>
      <PageHeader
        eyebrow="Agency settings"
        title="Account"
        description="Manage your agency team and how Leadlogr looks for you."
      />

      <div className="space-y-4">
        <SectionCard
          title="Team"
          description="Invite teammates to collaborate on client workspaces."
        >
          <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2 mb-5">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="email"
                required
                placeholder="teammate@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md ring-1 ring-border bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              className="text-sm rounded-md ring-1 ring-border bg-background px-3 py-2"
            >
              <option value="Member">Member</option>
              <option value="Admin">Admin</option>
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" />
              Send invite
            </button>
          </form>

          <div className="rounded-md ring-1 ring-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded ring-1 ring-border bg-muted/40">
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {m.role !== "Owner" && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remove"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {invites.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0 bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground italic">Pending invite</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{i.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded ring-1 ring-border bg-muted/40">
                        {i.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => revokeInvite(i.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Revoke invite"
                      >
                        <X className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Appearance" description="Choose how Leadlogr looks for your agency account.">
          <ThemeSwitcher />
        </SectionCard>

        <SectionCard title="Agency" description="Public-facing details for your agency.">
          <div className="grid md:grid-cols-2 gap-4">
            <Row label="Agency name" value={ownWorkspace.name} />
            <Row label="Primary contact" value={ownWorkspace.ownerEmail || "Not set"} />
            <Row label="Seats used" value={`${team.length + invites.length} of 10`} />
            <Row label="Plan" value="Agency · €199/mo" />
          </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-sm mt-1 font-medium">{value}</div>
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
                active ? "ring-foreground bg-muted" : "ring-border bg-card hover:bg-muted/60"
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
