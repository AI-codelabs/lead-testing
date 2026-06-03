import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { ACCESS_LEVEL_META, useAccount } from "@/lib/account-context";

export const Route = createFileRoute("/agency/")({
  head: () => ({ meta: [{ title: "Clients — Leadlogr Agency" }] }),
  component: AgencyOverview,
});

const symbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

function AgencyOverview() {
  const { clientWorkspaces, enterClient } = useAccount();
  const navigate = useNavigate();

  const totalMrr = clientWorkspaces.reduce((sum, c) => sum + c.monthlyReferralFee, 0);
  const totalLeads = clientWorkspaces.reduce((sum, c) => sum + c.leadsCount, 0);
  const avgConv =
    clientWorkspaces.length === 0
      ? 0
      : clientWorkspaces.reduce((sum, c) => sum + c.conversionRate, 0) / clientWorkspaces.length;

  const open = (id: string) => {
    enterClient(id);
    navigate({ to: "/app/dashboard" });
  };

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Clients overview"
        description="All client workspaces under your management, with monthly referral fees and key metrics."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Clients" value={clientWorkspaces.length.toString()} />
        <SummaryCard label="Monthly referral total" value={`€${totalMrr.toLocaleString()}`} />
        <SummaryCard label="Avg. conversion" value={`${(avgConv * 100).toFixed(1)}%`} hint={`${totalLeads} total leads`} />
      </div>

      <div className="bg-card ring-1 ring-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Access level</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">Conv. rate</th>
              <th className="px-5 py-3 text-right">Referral fee / mo</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {clientWorkspaces.map((c) => {
              const access = c.agencyAccess;
              const sym = symbols[c.currency] ?? "€";
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.ownerName} · {c.ownerEmail}</div>
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
                  <td className="px-5 py-3.5 text-right font-mono">{sym}{c.monthlyReferralFee.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right">
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
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                  No clients yet. Create one from the "New client" page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card ring-1 ring-border rounded-lg p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tracking-tight mt-3">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
