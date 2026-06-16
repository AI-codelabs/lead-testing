import { createFileRoute } from "@tanstack/react-router";
import { Check, Monitor, Moon, Sun, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useTheme, type Theme } from "@/components/theme-provider";
import { useAccount } from "@/lib/account-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listReceivedInvites,
  acceptInvite,
  declineInvite,
} from "@/lib/agency-invites.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/agency/account")({
  head: () => ({ meta: [{ title: "Account — Leadlogr Agency" }] }),
  ssr: false,
  component: AgencyAccountPage,
});

function AgencyAccountPage() {
  const { ownWorkspace } = useAccount();

  return (
    <>
      <PageHeader
        eyebrow="Agency settings"
        title="Account"
        description="Manage your agency, client invites, and appearance."
      />

      <Tabs defaultValue="invites" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invites">Client invitations</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="agency">Agency</TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="space-y-4">
          <SectionCard
            title="Client invitations"
            description="Workspaces that invited your agency to collaborate. Accept to link them to your dashboard."
          >
            <InvitesList />
          </SectionCard>
        </TabsContent>

        <TabsContent value="appearance">
          <SectionCard title="Appearance" description="Choose how Leadlogr looks for your agency account.">
            <ThemeSwitcher />
          </SectionCard>
        </TabsContent>

        <TabsContent value="agency">
          <SectionCard title="Agency" description="Public-facing details for your agency.">
            <div className="grid md:grid-cols-2 gap-4">
              <Row label="Agency name" value={ownWorkspace.name} />
              <Row label="Primary contact" value={ownWorkspace.ownerEmail || "Not set"} />
              <Row label="Plan" value="Agency · €199/mo" />
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </>
  );
}

function InvitesList() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReceivedInvites);
  const acceptFn = useServerFn(acceptInvite);
  const declineFn = useServerFn(declineInvite);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agency-received-invites"],
    queryFn: () => listFn(),
  });

  const accept = useMutation({
    mutationFn: (token: string) => acceptFn({ data: { token } }),
    onSuccess: () => {
      toast.success("Invite accepted — workspace linked.");
      qc.invalidateQueries({ queryKey: ["agency-received-invites"] });
      qc.invalidateQueries({ queryKey: ["agency-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not accept invite"),
  });

  const decline = useMutation({
    mutationFn: (id: string) => declineFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite declined.");
      qc.invalidateQueries({ queryKey: ["agency-received-invites"] });
      qc.invalidateQueries({ queryKey: ["agency-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not decline invite"),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invites…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Could not load invites.</p>;
  }
  const invites = data?.invites ?? [];
  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invitations yet. When a client invites your agency, it will show up here.
      </p>
    );
  }

  return (
    <div className="rounded-md ring-1 ring-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <th className="px-4 py-2.5">From</th>
            <th className="px-4 py-2.5">Access</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {invites.map((i: any) => (
            <tr key={i.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                <div className="font-medium">{i.inviter_workspace_name}</div>
                <div className="text-xs text-muted-foreground">{i.inviter_email}</div>
              </td>
              <td className="px-4 py-2.5 capitalize">{i.access_level.replace("_", " ")}</td>
              <td className="px-4 py-2.5">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded ring-1 ring-border bg-muted/40 capitalize">
                  {i.status}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                {i.status === "pending" ? (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => accept.mutate(i.token)}
                      disabled={accept.isPending}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Check className="size-3.5" />
                      Accept
                    </button>
                    <button
                      onClick={() => decline.mutate(i.id)}
                      disabled={decline.isPending}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                      Decline
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function TeamPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgencyMembers);
  const inviteFn = useServerFn(sendAgencyMemberInvite);
  const removeFn = useServerFn(removeAgencyMember);
  const [email, setEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["agency-members"],
    queryFn: () => listFn(),
  });

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { email: email.trim() } }),
    onSuccess: (res: any) => {
      setEmail("");
      toast.success("Invitation sent. Link copied to clipboard.");
      if (res?.acceptUrl && typeof navigator !== "undefined") {
        navigator.clipboard?.writeText(res.acceptUrl).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["agency-members"] });
      qc.invalidateQueries({ queryKey: ["sent-agency-invites"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Teammate removed.");
      qc.invalidateQueries({ queryKey: ["agency-members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove teammate"),
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/signup?agencyMember=${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy link"),
    );
  };

  const members = data?.members ?? [];
  const pending = data?.pendingInvites ?? [];

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          placeholder="teammate@youragency.com"
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-card ring-1 ring-border rounded-md text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => email.trim() && invite.mutate()}
          disabled={invite.isPending || !email.trim()}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <UserPlus className="size-4" />
          {invite.isPending ? "Sending…" : "Invite teammate"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : (
        <div className="rounded-md ring-1 ring-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2.5">Member</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{m.name || m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{m.role}</td>
                  <td className="px-4 py-2.5 text-right">
                    {m.role !== "owner" && (
                      <button
                        onClick={() => remove.mutate(m.id)}
                        disabled={remove.isPending}
                        className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:bg-destructive/10 rounded px-2 py-1"
                      >
                        <Trash2 className="size-3" /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pending.map((p: any) => (
                <tr key={p.id} className="border-b border-border last:border-0 bg-muted/20">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.agency_email}</div>
                    <div className="text-xs text-muted-foreground">Invitation pending</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">Invited</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => copyLink(p.token)}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ring-1 ring-border hover:bg-muted"
                    >
                      <Copy className="size-3" /> Copy link
                    </button>
                  </td>
                </tr>
              ))}
              {members.length === 0 && pending.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No teammates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
