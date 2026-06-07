import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useAccount } from "@/lib/account-context";
import { getIntegrationStatuses } from "@/lib/integration-status.functions";
import {
  getDashboardMetrics,
  type DashboardMetrics,
  type DashboardRange,
} from "@/lib/dashboard-metrics.functions";

type Trend = "up" | "down" | "flat";

const rangeLabel: Record<DashboardRange, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

type StageKey = "total" | "open" | "expired" | "qualified" | "won";
type Stage = {
  key: StageKey;
  label: string;
  value: number;
  delta: number;
  swatch: string;
};

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Leadlogr" }] }),
  component: DashboardPage,
});

const nf = new Intl.NumberFormat("en-US");
const cf = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function fmtDelta(pct: number): string {
  if (pct === 0) return "No change";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
function trendOf(pct: number): Trend {
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

function buildStages(m: DashboardMetrics): Stage[] {
  return [
    { key: "total", label: "Total", value: m.totals.total, delta: m.deltas.total, swatch: "bg-foreground" },
    { key: "open", label: "Open", value: m.totals.open, delta: m.deltas.open, swatch: "bg-stage-blue" },
    { key: "expired", label: "Expired", value: m.totals.expired, delta: m.deltas.expired, swatch: "bg-stage-red" },
    { key: "qualified", label: "Qualified", value: m.totals.qualified, delta: m.deltas.qualified, swatch: "bg-stage-amber" },
    { key: "won", label: "Won", value: m.totals.won, delta: m.deltas.won, swatch: "bg-stage-green" },
  ];
}

function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>(30);
  const { activeWorkspace } = useAccount();
  const workspaceKey = activeWorkspace.key;

  const fetchStatuses = useServerFn(getIntegrationStatuses);
  const fetchMetrics = useServerFn(getDashboardMetrics);

  const { data: statuses } = useQuery({
    queryKey: ["integration-statuses", workspaceKey],
    queryFn: () => fetchStatuses({ data: { workspaceKey } }),
    staleTime: 30_000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["dashboard-metrics", workspaceKey, range],
    queryFn: () => fetchMetrics({ data: { workspaceKey, range } }),
    staleTime: 15_000,
  });

  const hasLeads = (metrics?.totals.total ?? 0) > 0;
  const adsConnected = !!statuses?.googleAdsConnected;
  const hasSpend = !!metrics?.hasSpend;

  const stages: Stage[] = metrics
    ? buildStages(metrics)
    : [
        { key: "total", label: "Total", value: 0, delta: 0, swatch: "bg-foreground" },
        { key: "open", label: "Open", value: 0, delta: 0, swatch: "bg-stage-blue" },
        { key: "expired", label: "Expired", value: 0, delta: 0, swatch: "bg-stage-red" },
        { key: "qualified", label: "Qualified", value: 0, delta: 0, swatch: "bg-stage-amber" },
        { key: "won", label: "Won", value: 0, delta: 0, swatch: "bg-stage-green" },
      ];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Real-time view of leads, conversions, and what's flowing back to your ad platforms."
        actions={
          <div className="flex items-center gap-1 rounded-md ring-1 ring-border bg-card p-1">
            {([7, 30, 90] as DashboardRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {rangeLabel[r]}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        <FunnelCard stages={stages} hasData={hasLeads} />
        <PerformanceCard
          wonValue={metrics?.wonValue ?? 0}
          wonDelta={metrics?.deltas.wonValue ?? 0}
          spend={metrics?.spend ?? 0}
          hasSpend={hasSpend}
          hasLeads={hasLeads}
          adsConnected={adsConnected}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card ring-1 ring-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold">Conversion volume</h3>
              <p className="text-xs text-muted-foreground">
                Qualified and won leads over the selected period.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-foreground" /> Won
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-brand-accent" /> Qualified
              </span>
            </div>
          </div>
          {hasLeads && metrics ? (
            <Chart data={metrics.chart} range={range} />
          ) : (
            <EmptyState
              className="h-48"
              message="Start a campaign to see conversions flow in"
            />
          )}
        </div>

        <div className="bg-card ring-1 ring-border rounded-lg p-6">
          <h3 className="font-semibold mb-1">Top sources</h3>
          <p className="text-xs text-muted-foreground mb-4">By leads received.</p>
          {metrics && metrics.sources.length > 0 ? (
            <div className="space-y-3">
              {metrics.sources.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.leads} leads · {s.conv} conv
                    </div>
                  </div>
                  <div className="text-sm font-mono text-foreground">
                    {s.wonValue > 0 ? cf.format(s.wonValue) : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="h-32"
              message="Connect an integration to rank your top sources"
            />
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 text-center ${className}`}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TrendChip({ delta, compact = false }: { delta: number; compact?: boolean }) {
  const trend = trendOf(delta);
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const cls =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${cls} ${compact ? "text-[10px]" : "text-[11px]"} font-medium tabular-nums`}
    >
      <Icon className="size-3" strokeWidth={2.25} />
      {fmtDelta(delta)}
    </span>
  );
}

function FunnelCard({ stages, hasData }: { stages: Stage[]; hasData: boolean }) {
  const totalStage = stages.find((s) => s.key === "total")!;
  const total = totalStage.value;
  const funnelStages = stages.filter((s) => s.key !== "total");
  const dash = "—";

  return (
    <section className="lg:col-span-3 bg-card ring-1 ring-border rounded-lg p-5 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Lead Overview
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <h2 className="text-4xl font-semibold tracking-tight tabular-nums">
              {hasData ? nf.format(total) : dash}
            </h2>
            <span className="text-sm text-muted-foreground">
              {hasData
                ? "total leads"
                : "Connect an integration to start collecting leads"}
            </span>
            {hasData && <TrendChip delta={totalStage.delta} />}
          </div>
        </div>
      </header>

      <div className="space-y-2">
        <div className="flex h-2.5 rounded-full overflow-hidden ring-1 ring-border bg-muted">
          {hasData &&
            funnelStages.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div
                  key={s.key}
                  className={s.swatch}
                  style={{ width: `${pct}%` }}
                  title={`${s.label}: ${s.value}`}
                />
              );
            })}
        </div>
        <div className="text-[10px] text-muted-foreground flex justify-between font-mono">
          <span>0</span>
          <span>{hasData ? nf.format(total) : dash}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-md overflow-hidden ring-1 ring-border">
        {funnelStages.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.key} className="bg-card p-3 flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span className={`size-2 rounded-sm ${s.swatch}`} />
                <span className="truncate">{s.label}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {hasData ? nf.format(s.value) : dash}
                </span>
                {hasData && (
                  <span className="text-[10px] text-muted-foreground font-mono">{pct}%</span>
                )}
              </div>
              {hasData ? (
                <TrendChip delta={s.delta} compact />
              ) : (
                <span className="text-[10px] text-muted-foreground">Awaiting leads</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PerformanceCard({
  wonValue,
  wonDelta,
  spend,
  hasSpend,
  hasLeads,
  adsConnected,
}: {
  wonValue: number;
  wonDelta: number;
  spend: number;
  hasSpend: boolean;
  hasLeads: boolean;
  adsConnected: boolean;
}) {
  const hasRoi = hasSpend && spend > 0;
  const roi = hasRoi ? wonValue / spend : 0;
  const netProfit = wonValue - spend;
  const spendPct = hasRoi && wonValue > 0 ? Math.min(100, (spend / wonValue) * 100) : 0;
  const dash = "—";

  const emptyMessage = !adsConnected
    ? "Connect Google Ads and start a campaign to track ROI"
    : !hasLeads
      ? "Awaiting leads to compute return"
      : "Spend data will appear once your campaigns run";

  return (
    <section className="lg:col-span-2 bg-card ring-1 ring-border rounded-lg p-5 flex flex-col gap-5">
      <header className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Performance
        </div>
        {hasRoi && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-[10px] font-semibold">
            <ArrowUpRight className="size-3" strokeWidth={2.5} />
            {fmtDelta(wonDelta)}
          </span>
        )}
      </header>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Return on investment
        </div>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">
            {hasRoi ? roi.toFixed(2) : dash}
          </span>
          {hasRoi && <span className="text-2xl font-light text-muted-foreground">×</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">
          {hasRoi ? (
            <>
              Net profit{" "}
              <span className="text-foreground font-medium tabular-nums">
                {cf.format(netProfit)}
              </span>
            </>
          ) : (
            emptyMessage
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted ring-1 ring-border">
          {hasRoi && (
            <>
              <div className="bg-destructive/80" style={{ width: `${spendPct}%` }} />
              <div className="bg-success" style={{ width: `${100 - spendPct}%` }} />
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-2 rounded-sm bg-destructive/80" /> Spend
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {hasSpend ? cf.format(spend) : dash}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {hasSpend ? "Ad platform spend" : "Connect ads to track spend"}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-2 rounded-sm bg-success" /> Won Value
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">
              {hasLeads && wonValue > 0 ? cf.format(wonValue) : dash}
            </div>
            {hasLeads && wonValue > 0 ? (
              <TrendChip delta={wonDelta} compact />
            ) : (
              <span className="text-[10px] text-muted-foreground">Awaiting won deals</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Chart({
  data,
  range,
}: {
  data: { won: number; conv: number }[];
  range: DashboardRange;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.won, d.conv)));
  const label = range === 7 ? "D" : "W";
  const step = range === 90 ? 3 : range === 30 ? 2 : 1;
  return (
    <div className="flex items-end gap-1.5 h-48">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 h-full">
            <div
              className="flex-1 bg-foreground rounded-sm"
              style={{ height: `${(d.won / max) * 100}%` }}
            />
            <div
              className="flex-1 bg-brand-accent/80 rounded-sm"
              style={{ height: `${(d.conv / max) * 100}%` }}
            />
          </div>
          {i % step === 0 && (
            <span className="text-[9px] font-mono text-muted-foreground">
              {label}
              {i + 1}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
