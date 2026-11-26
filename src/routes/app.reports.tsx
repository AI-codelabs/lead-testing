import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import {
  getCampaignRevenue,
  getSourceRevenue,
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
  const fetchSources = useServerFn(getSourceRevenue);
  const fetchCampaigns = useServerFn(getCampaignRevenue);

  const sourcesQuery = useQuery({
    queryKey: ["source-revenue", organizationId, range],
    enabled: !!organizationId,
    queryFn: () => fetchSources({ data: { organizationId, range } }),
  });

  const campaignsQuery = useQuery({
    queryKey: ["campaign-revenue", organizationId, range],
    enabled: !!organizationId,
    queryFn: () => fetchCampaigns({ data: { organizationId, range } }),
  });

  const sourceRows = sourcesQuery.data?.rows ?? [];
  const campaignRows = campaignsQuery.data?.rows ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Reporting"
        title="Reports"
        description="Leads and won revenue by channel and campaign. Google Ads, Direct and Google My Business are separate sources when the tracker can tell them apart."
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

      <section className="space-y-3 mb-8">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Revenue by source</h2>
          <p className="text-sm text-muted-foreground">
            Google (Ads clicks), Google My Business (Maps / Business Profile) and Direct sit side by
            side with the other channels.
          </p>
        </div>
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3 text-right">Leads</th>
                <th className="px-5 py-3 text-right">Qualified</th>
                <th className="px-5 py-3 text-right">Won</th>
                <th className="px-5 py-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sourcesQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    Loading sources…
                  </td>
                </tr>
              )}
              {sourcesQuery.error && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-destructive">
                    {sourcesQuery.error instanceof Error
                      ? sourcesQuery.error.message
                      : "Could not load sources"}
                  </td>
                </tr>
              )}
              {!sourcesQuery.isLoading && !sourcesQuery.error && sourceRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    No lead sources in this window yet.
                  </td>
                </tr>
              )}
              {sourceRows.map((r) => (
                <tr key={r.source} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-3.5 font-medium">{r.source}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{r.leads}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{r.qualified}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{r.won}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums font-semibold">
                    {money.format(r.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Revenue by campaign</h2>
          <p className="text-sm text-muted-foreground">
            Won deal value attributed to the campaign captured with each lead. Ad spend per campaign
            is not available yet, so ROAS stays blank until spend sync covers campaigns.
          </p>
        </div>
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-5 py-3">Source</th>
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
              {campaignsQuery.isLoading && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                    Loading campaigns…
                  </td>
                </tr>
              )}
              {campaignsQuery.error && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-destructive">
                    {campaignsQuery.error instanceof Error
                      ? campaignsQuery.error.message
                      : "Could not load report"}
                  </td>
                </tr>
              )}
              {!campaignsQuery.isLoading && !campaignsQuery.error && campaignRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                    No campaign data in this window yet.
                  </td>
                </tr>
              )}
              {campaignRows.map((r) => (
                <tr
                  key={`${r.source}:${r.campaign}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-5 py-3.5 font-medium">{r.campaign}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{r.source}</td>
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
      </section>
    </>
  );
}
