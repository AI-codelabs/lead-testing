import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAccount } from "@/lib/account-context";
import { TeamMembersPanel } from "@/components/account/team-members-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, X } from "lucide-react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACCESS_LEVEL_META, type AccessLevel } from "@/lib/account-context";
import { listSentInvites } from "@/lib/invitations.functions";
import { inviteClientWorkspace } from "@/lib/agency-clients.functions";
import { acceptInvite, declineInvite, listReceivedInvites, revokeInvite } from "@/lib/invitations.functions";

export const Route = createFileRoute("/agency/invites")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Invites — Leadlogr Agency" }] }),
  ssr: false,
  component: InvitesPage,
});

const LEVELS: AccessLevel[] = ["full", "names_only", "metrics_only"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900 ring-amber-200",
    accepted: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    revoked: "bg-muted text-muted-foreground ring-border",
    expired: "bg-muted text-muted-foreground ring-border",
  };
  return map[status] ?? "bg-muted text-muted-foreground ring-border";
}

function emailBadge(status: string | null) {
  if (!status) return "bg-muted text-muted-foreground ring-border";
  const map: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    pending: "bg-amber-100 text-amber-900 ring-amber-200",
    dlq: "bg-red-100 text-red-900 ring-red-200",
    failed: "bg-red-100 text-red-900 ring-red-200",
    bounced: "bg-red-100 text-red-900 ring-red-200",
    suppressed: "bg-orange-100 text-orange-900 ring-orange-200",
    complained: "bg-orange-100 text-orange-900 ring-orange-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground ring-border";
}

function InvitesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Invites"
        description="Send client invitations, manage teammates, and track every invite link in one place."
      />

      <Tabs defaultValue="client" className="space-y-4">
        <TabsList>
          <TabsTrigger value="client">Invite a client</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          <SectionCard
            title="New client workspace"
            description="Creates a signup link for the client. Once they create their account, the workspace appears under your clients automatically."
          >
            <NewClientPanel />
          </SectionCard>
        </TabsContent>

        <TabsContent value="team">
          <SectionCard
            title="Teammates"
            description="Invite colleagues to your agency. They'll be able to manage every client you have access to."
          >
            <TeamPanel />
          </SectionCard>
        </TabsContent>

        <TabsContent value="received">
          <SectionCard
            title="Received invitations"
            description="Workspaces that invited your agency to collaborate. Accept to link them to your dashboard."
          >
            <ReceivedInvitesPanel />
          </SectionCard>
        </TabsContent>

        <TabsContent value="history">
          <SectionCard
            title="Invite history"
            description="Every invite you've sent — current status, email delivery, and quick actions."
          >
            <HistoryPanel />
          </SectionCard>
        </TabsContent>
      </Tabs>
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
    <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-6">
      <div className="mb-5">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

/* ------------------------- Invite a client ------------------------- */

function NewClientPanel() {
  const { activeOrganizationId } = useAccount();
  const qc = useQueryClient();
  const createFn = useServerFn(inviteClientWorkspace);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [access, setAccess] = useState<AccessLevel>("full");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: activeOrganizationId,
          email: ownerEmail.trim(),
          accessLevel: access as "full" | "read_only",
        },
      }),
    onSuccess: (res) => {
      // No delivery pipeline yet, so hand the inviter the link rather than
      // telling them an email was sent that never leaves the server.
      if (res?.link) {
        navigator.clipboard?.writeText(res.link).catch(() => {});
        toast.success("Invite created — signup link copied to your clipboard.");
      } else {
        toast.success("Invite created.");
      }
      setName("");
      setOwnerName("");
      setOwnerEmail("");
      setAccess("full");
      qc.invalidateQueries({ queryKey: ["agency-invite-statuses"] });
      qc.invalidateQueries({ queryKey: ["agency-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ownerEmail.trim()) return;
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-5 max-w-2xl">
      <Field label="Workspace name">
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Acme Media" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Owner name">
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <Field label="Owner email">
          <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="jane@acme.com" />
        </Field>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Default access level
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {LEVELS.map((lvl) => {
            const active = access === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setAccess(lvl)}
                aria-pressed={active}
                className={`text-left rounded-md p-3 ring-1 transition-colors ${
                  active ? "ring-foreground bg-muted" : "ring-border bg-card hover:bg-muted/60"
                }`}
              >
                <div className="text-sm font-semibold">{ACCESS_LEVEL_META[lvl].label}</div>
                <p className="text-xs text-muted-foreground mt-1">{ACCESS_LEVEL_META[lvl].hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={create.isPending}
          className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {create.isPending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1.5 [&_input]:w-full [&_input]:bg-background [&_input]:ring-1 [&_input]:ring-border [&_input]:rounded-md [&_input]:text-sm [&_input]:px-3 [&_input]:py-2 [&_input]:focus:outline-none [&_input]:focus:ring-2 [&_input]:focus:ring-ring">
        {children}
      </div>
    </label>
  );
}

/* ------------------------- Team ------------------------- */

// The agency Team tab and the standard account page now share one panel:
// membership was never agency-specific, only its UI was.
function TeamPanel() {
  return <TeamMembersPanel />;
}

/* ------------------------- Received ------------------------- */

function ReceivedInvitesPanel() {
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not decline invite"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading invites…</p>;
  if (error) return <p className="text-sm text-destructive">Could not load invites.</p>;

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
                <div className="font-medium">{i.organization_name}</div>
                <div className="text-xs text-muted-foreground">{i.inviter_email}</div>
              </td>
              <td className="px-4 py-2.5 capitalize">{i.access_level.replace("_", " ")}</td>
              <td className="px-4 py-2.5">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 capitalize ${statusBadge(i.status)}`}>
                  {i.status}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                {i.status === "pending" ? (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => accept.mutate(i.token)}
                      disabled={accept.isPending}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="size-3.5" />
                      Accept
                    </button>
                    <button
                      onClick={() => decline.mutate(i.id)}
                      disabled={decline.isPending}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted disabled:opacity-50"
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

/* ------------------------- History ------------------------- */

function HistoryPanel() {
  const { activeOrganizationId } = useAccount();
  const listFn = useServerFn(listSentInvites);
  const revokeFn = useServerFn(revokeInvite);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["agency-invite-statuses", activeOrganizationId],
    queryFn: () => listFn({ data: { organizationId: activeOrganizationId } }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["agency-invite-statuses"] });
      // Revoking a member invitation removes a pending row from the team
      // table, which the shared panel caches under "org-members".
      qc.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke"),
  });

  const copyLink = (token: string, kind: string) => {
    const param = kind === "member" ? "memberInvite" : "clientInvite";
    const url = `${window.location.origin}/signup?${param}=${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Signup link copied"),
      () => toast.error("Could not copy link"),
    );
  };

  const invites = data?.invites ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          className="text-xs font-medium px-3 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="rounded-md ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Invite</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Sent</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-red-600">
                {error instanceof Error ? error.message : "Failed to load"}
              </td></tr>
            )}
            {!isLoading && invites.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                You haven't sent any invites yet.
              </td></tr>
            )}
            {invites.map((i: any) => (
              <tr key={i.id} className="border-b border-border last:border-0 align-top">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{i.email}</div>
                  {i.organization_name && (
                    <div className="text-xs text-muted-foreground">{i.organization_name}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {i.kind === "client_invite"
                    ? "Client signup"
                    : i.kind === "member"
                      ? "Teammate"
                      : "Agency link"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${statusBadge(i.status)}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${emailBadge(i.email_status)}`}>
                    {i.email_status ?? "no log"}
                  </span>
                  {i.email_error && (
                    <div className="text-[11px] text-red-600 mt-1 max-w-xs break-words">{i.email_error}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {new Date(i.created_at).toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  {(i.kind === "client_invite" || i.kind === "member") && i.status === "pending" && (
                    <button
                      onClick={() => copyLink(i.token, i.kind)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors mr-2"
                    >
                      Copy link
                    </button>
                  )}
                  {i.status === "pending" && (
                    <button
                      onClick={() => revoke.mutate(i.id)}
                      disabled={revoke.isPending}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
