import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Mail, Copy } from "lucide-react";
import { TableEmptyState } from "@/components/leadlogr/empty-state";
import { PageHeader } from "@/components/leadlogr/page-header";
import { ACCESS_LEVEL_META, useAccount } from "@/lib/account-context";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { inviteClientOwner } from "@/lib/agency-clients.functions";
import { COMPANY } from "@/lib/legal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/agency/")({
  staticData: { width: "full" },
  head: () => ({ meta: [{ title: "Clients — Leadlogr Agency" }] }),
  component: AgencyOverview,
});

function AgencyOverview() {
  const { clientWorkspaces, enterClient, ownWorkspace } = useAccount();
  const navigate = useNavigate();

  const totalLeads = clientWorkspaces.reduce((sum, c) => sum + c.leadsCount, 0);
  const avgConv =
    clientWorkspaces.length === 0
      ? 0
      : clientWorkspaces.reduce((sum, c) => sum + c.conversionRate, 0) / clientWorkspaces.length;
  const payingClients = clientWorkspaces.filter((c) => c.claimed).length;
  const tier = payingClients >= 15 ? 2 : payingClients >= 5 ? 1 : 0;
  const tierRate = [20, 25, 30][tier];
  const tierLabel = ["Starter", "Pro", "Elite"][tier];
  const nextTierAt = tier === 0 ? 5 : tier === 1 ? 15 : null;
  const referralSlug = useMemo(() => {
    const base = (ownWorkspace.name || COMPANY.legalName || "agency")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return base || "agency";
  }, [ownWorkspace.name]);
  const referralLink = `${COMPANY.site}/r/${referralSlug}`;
  const [wlName, setWlName] = useState(ownWorkspace.name || COMPANY.legalName);

  const open = (id: string) => {
    enterClient(id);
    navigate({ to: "/app/dashboard" });
  };

  // Inviting used to be possible only in the moment a workspace was created.
  // Dismissing that modal left no way back, which is wrong for something the
  // product describes as optional and deferrable.
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null);
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const inviteFn = useServerFn(inviteClientOwner);

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { clientOrgId: inviting!.id, email: email.trim() } }),
    onSuccess: (res) => {
      setEmail("");
      setInviting(null);
      navigator.clipboard?.writeText(res.link ?? "").catch(() => {});
      toast.success(
        res.emailSent
          ? "Invite emailed — link also copied to your clipboard."
          : "Invite created — link copied. Email could not be sent, so share it yourself.",
      );
      void qc.invalidateQueries({ queryKey: ["agency-invite-statuses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite the client"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Clients"
        description={`${clientWorkspaces.length} workspaces · ${payingClients} claimed · partner tier ${tierLabel} (${tierRate}%) once billing is live.`}
        actions={
          <Link
            to="/agency/invites"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <Mail className="size-4" />
            Invite client
          </Link>
        }
      />

      <div id="commission" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Commission this month"
          value="—"
          hint="Payouts unlock when billing goes live"
        />
        <SummaryCard label="Clients" value={clientWorkspaces.length.toString()} />
        <SummaryCard label="Total leads" value={totalLeads.toLocaleString()} />
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>
              {tierLabel} · {tierRate}%
            </span>
            <span>
              {payingClients}
              {nextTierAt ? ` / ${nextTierAt}` : ""}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{
                width: `${Math.min(100, nextTierAt ? (payingClients / nextTierAt) * 100 : 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {nextTierAt
              ? `${Math.max(0, nextTierAt - payingClients)} more claimed clients to the next tier.`
              : "Top partner tier reached."}
          </p>
          <div className="text-xs text-muted-foreground mt-1">
            Avg. conversion {`${(avgConv * 100).toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Access level</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">Conv. rate</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {clientWorkspaces.map((c) => {
              const access = c.agencyAccess;
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{c.name}</div>
                    {c.claimed ? (
                      <div className="text-xs text-muted-foreground">{c.ownerName} · {c.ownerEmail}</div>
                    ) : (
                      // The workspace is live and already collecting leads; only
                      // the client's own account is missing.
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        <span className="inline-block size-1.5 rounded-full bg-stage-amber" />
                        Awaiting client · not invited yet
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {access ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded ring-1 ring-border bg-muted/40">
                        {ACCESS_LEVEL_META[access].label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No access granted</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono">{c.leadsCount.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right font-mono">{(c.conversionRate * 100).toFixed(1)}%</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  {!c.claimed && (
                    <button
                      type="button"
                      onClick={() => { setInviting({ id: c.id, name: c.name }); setEmail(""); }}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors mr-2"
                    >
                      Invite client
                    </button>
                  )}
                    <button
                      onClick={() => open(c.id)}
                      disabled={!access}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                    >
                      Open workspace
                      <ArrowRight className="size-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {clientWorkspaces.length === 0 && (
              <TableEmptyState
                colSpan={5}
                icon={Building2}
                title="No client workspaces yet"
                description="Invite a client and their workspace appears here with live lead counts and conversion rates."
                action={
                  <Link
                    to="/agency/invites"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
                  >
                    <Mail className="size-4" />
                    Invite a client
                  </Link>
                }
              />
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
          <h2 className="text-lg font-semibold tracking-tight">Your referral link</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Clients who sign up through this link can be linked to your agency. Billing and
            commission tracking land when paid plans go live.
          </p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 ring-1 ring-border px-3 py-2">
            <code className="flex-1 text-sm truncate">{referralLink}</code>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-card ring-1 ring-border hover:bg-muted"
              onClick={() => {
                navigator.clipboard?.writeText(`https://${referralLink}`).then(
                  () => toast.success("Referral link copied"),
                  () => toast.error("Could not copy"),
                );
              }}
            >
              <Copy className="size-3.5" />
              Copy
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
          <h2 className="text-lg font-semibold tracking-tight">Payouts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly partner payouts will appear here after the first paid client invoices.
          </p>
          <div className="mt-4 text-sm text-muted-foreground rounded-lg bg-muted/40 px-3 py-6 text-center ring-1 ring-border">
            No payouts yet
          </div>
        </div>
      </div>

      <div id="white-label" className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5 mt-4">
        <h2 className="text-lg font-semibold tracking-tight">White label</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Preview how client reports could show your brand. Saving and custom domains ship with
          billing.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium" htmlFor="wl-name">
              Agency name on reports
            </label>
            <input
              id="wl-name"
              className="mt-1.5 w-full rounded-md bg-background px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
              value={wlName}
              onChange={(e) => setWlName(e.target.value)}
            />
          </div>
          <div className="rounded-xl bg-[#293542] text-white p-4">
            <div className="text-xs font-semibold opacity-70">{wlName || "Agency"} · Monthly report</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] opacity-60">Leads</div>
                <div className="text-xl font-bold tabular-nums">{totalLeads}</div>
              </div>
              <div>
                <div className="text-[11px] opacity-60">Clients</div>
                <div className="text-xl font-bold tabular-nums">{clientWorkspaces.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!inviting} onOpenChange={(open) => !open && setInviting(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite the client to {inviting?.name}</DialogTitle>
            <DialogDescription>
              They become the owner of this workspace and fill in their own details. You keep
              admin access to run it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label htmlFor="invite-client-email" className="text-xs font-medium">
              Client's email
            </label>
            <input
              id="invite-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@client.com"
              className="w-full rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setInviting(null)}
              className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => invite.mutate()}
              disabled={!email.trim().includes("@") || invite.isPending}
              className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {invite.isPending ? "Sending…" : "Send invite"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tracking-tight mt-3">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
