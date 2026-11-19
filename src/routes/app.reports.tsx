import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import {
  getCampaignRevenue,
  type DashboardRange,
} from "@/lib/dashboard-metrics.functions";

export const Route = createFileRoute("/app/reports")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Reports — Leadlogr" }] }),
  component: ReportsPage,
});

const ranges: { value: DashboardRange; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function ReportsPage() {
  const { activeWorkspace } = useAccount();
  const organizationId = activeWorkspace.key;
  const [range, setRange] = useState<DashboardRange>(30);
  const fetchCampaigns = useServerFn(getCampaignRevenue);

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaign-revenue", organizationId, range],
    enabled: !!organizationId,
    queryFn: () => fetchCampaigns({ data: { organizationId, range } }),
  });

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Reporting"
        title="Revenue by campaign"
        description="Won deal value attributed to the campaign captured with each lead. Ad spend per campaign is not available yet, so ROAS stays blank until spend sync covers campaigns."
        actions={
          <select
            className="bg-card ring-1 ring-border rounded-md px-3 py-2 text-sm font-medium"
            value={range}
            onChange={(e) => setRange(Number(e.target.value) as DashboardRange)}
          >
            {ranges.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        }
      />

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Campaign</th>
              <th className="px-5 py-3 text-right">Spend</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">Qualified</th>
              <th className="px-5 py-3 text-right">Cost / qualified</th>
              <th className="px-5 py-3 text-right">Won</th>
              <th className="px-5 py-3 text-right">Revenue</th>
              <th className="px-5 py-3 text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  Loading campaigns…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-destructive">
                  {error instanceof Error ? error.message : "Could not load report"}
                </td>
              </tr>
            )}
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  No campaign data in this window yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.campaign} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-5 py-3.5 font-medium">{r.campaign}</td>
                <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">—</td>
                <td className="px-5 py-3.5 text-right tabular-nums">{r.leads}</td>
                <td className="px-5 py-3.5 text-right tabular-nums">{r.qualified}</td>
                <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">—</td>
                <td className="px-5 py-3.5 text-right tabular-nums">{r.won}</td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold">
                  {money.format(r.revenue)}
                </td>
                <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
