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
import { inviteSignupUrl } from "@/lib/invite-links";
import {
  inviteClientWorkspace,
  inviteClientOwner,
  linkClientWorkspace,
} from "@/lib/agency-clients.functions";
import { createClientWorkspaceOrg } from "@/auth/session";
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

/** Email delivery is not wired up yet, so "not_sent" is the normal state. */
const EMAIL_STATUS_LABELS: Record<string, string> = {
  not_sent: "Not sent — share the link",
};

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

      <Tabs defaultValue="build" className="space-y-4">
        <TabsList>
          <TabsTrigger value="build">Build a workspace</TabsTrigger>
          <TabsTrigger value="client">Invite a client</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="build">
          <SectionCard
            title="Build the workspace first"
            description="Creates the workspace straight away, so you can install tracking and start collecting leads before the client has an account. Invite them whenever you're ready."
          >
            <BuildWorkspacePanel />
          </SectionCard>
        </TabsContent>

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
          // Both fields the form asks for now travel with the invite instead of
          // being collected and dropped on the floor.
          workspaceName: name.trim(),
          ownerName: ownerName.trim(),
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

/* --------------------- Build a workspace --------------------- */

/**
 * Creates a client's workspace up front, then optionally invites them into it.
 *
 * The inverse of the invite-first flow beside it: there, nothing exists until
 * the client signs up, so the agency cannot install a tracker or connect an ad
 * account while it waits. Here the workspace is real immediately — it has its
 * own ingest key and collects leads from the moment it is created — and the
 * client's account is the last step rather than the first.
 */
function BuildWorkspacePanel() {
  const { activeOrganizationId } = useAccount();
  const qc = useQueryClient();
  const linkFn = useServerFn(linkClientWorkspace);
  const inviteOwnerFn = useServerFn(inviteClientOwner);

  const [name, setName] = useState("");
  const [access, setAccess] = useState<AccessLevel>("full");
  const [built, setBuilt] = useState<{ id: string; name: string } | null>(null);
  const [email, setEmail] = useState("");

  const build = useMutation({
    mutationFn: async () => {
      // Better Auth creates organizations from the browser against the caller's
      // own session, so the two halves cannot be one server call.
      const { organizationId } = await createClientWorkspaceOrg(name.trim());
      await linkFn({
        data: {
          organizationId: activeOrganizationId,
          clientOrgId: organizationId,
          // The picker offers three levels; the database stores two. Anything
          // short of full maps to read_only — the safer of the two — rather
          // than being cast to full, which is what the form beside this one
          // still does.
          accessLevel: access === "full" ? "full" : "read_only",
        },
      });
      return { id: organizationId, name: name.trim() };
    },
    onSuccess: (res) => {
      setBuilt(res);
      setName("");
      toast.success(`${res.name} is live — you can set up tracking now.`);
      qc.invalidateQueries({ queryKey: ["agency-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the workspace"),
  });

  const invite = useMutation({
    mutationFn: () => inviteOwnerFn({ data: { clientOrgId: built!.id, email: email.trim() } }),
    onSuccess: (res) => {
      setEmail("");
      if (res?.link) {
        navigator.clipboard?.writeText(res.link).catch(() => {});
        toast.success("Invite created — link copied to your clipboard.");
      } else {
        toast.success("Invite created.");
      }
      qc.invalidateQueries({ queryKey: ["agency-invite-statuses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite the client"),
  });

  if (built) {
    return (
      <div className="space-y-5 max-w-2xl">
        <div className="rounded-md ring-1 ring-border bg-muted/40 px-4 py-3">
          <div className="text-sm font-semibold">{built.name} is ready</div>
          <p className="text-xs text-muted-foreground mt-1">
            It appears under your clients now and starts collecting leads as soon as you install
            the tracker. Inviting the client is optional and can wait.
          </p>
        </div>

        <Field label="Invite the client (optional)">
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@client.com"
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={() => invite.mutate()}
              disabled={!email.trim().includes("@") || invite.isPending}
              className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {invite.isPending ? "Creating…" : "Create invite link"}
            </button>
          </div>
        </Field>
        <p className="text-xs text-muted-foreground">
          They join as an owner of this workspace and fill in their own details. You keep access
          either way.
        </p>

        <button
          type="button"
          onClick={() => setBuilt(null)}
          className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
        >
          Build another workspace
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !build.isPending) build.mutate();
      }}
      className="space-y-5 max-w-2xl"
    >
      <Field label="Workspace name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Acme Media"
        />
      </Field>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Your access level
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

      <button
        type="submit"
        disabled={!name.trim() || build.isPending}
        className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {build.isPending ? "Creating…" : "Create workspace"}
      </button>
    </form>
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

  const copyLink = (url: string) => {
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
      <div className="rounded-md ring-1 ring-border overflow-x-auto">
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
            {/* A failed load used to render as "no invites", which is how a
                crash in listSentInvites stayed hidden: the table looked empty
                rather than broken. An absent payload is not an empty one. */}
            {!isLoading && !error && !data && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                Could not load your invites. Try Refresh.
              </td></tr>
            )}
            {!isLoading && !error && data && invites.length === 0 && (
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
                  {i.kind === "member" ? "Teammate" : "Client signup"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${statusBadge(i.status)}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${emailBadge(i.email_status)}`}>
                    {EMAIL_STATUS_LABELS[i.email_status] ?? i.email_status ?? "no log"}
                  </span>
                  {i.email_error && (
                    <div className="text-[11px] text-red-600 mt-1 max-w-xs break-words">{i.email_error}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {new Date(i.created_at).toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  {i.status === "pending" && (
                    <button
                      onClick={() =>
                        copyLink(inviteSignupUrl(i.token, i.kind === "member" ? "member" : "client"))
                      }
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
