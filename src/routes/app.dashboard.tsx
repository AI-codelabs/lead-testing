import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey } from "@/hooks/use-live-leads";
import { getIntegrationStatuses } from "@/lib/integration-status.functions";

type Range = 7 | 30 | 90;
type Trend = "up" | "down" | "flat";

const rangeLabel: Record<Range, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

type Stage = {
  key: "total" | "open" | "expired" | "qualified" | "won";
  label: string;
  value: number;
  delta: string;
  trend: Trend;
  swatch: string; // bg class
};

const overviewData: Record<Range, Stage[]> = {
  7: [
    { key: "total", label: "Total", value: 284, delta: "+14%", trend: "up", swatch: "bg-foreground" },
    { key: "open", label: "Open", value: 72, delta: "New", trend: "up", swatch: "bg-stage-blue" },
    { key: "expired", label: "Expired", value: 0, delta: "No change", trend: "flat", swatch: "bg-stage-red" },
    { key: "qualified", label: "Qualified", value: 164, delta: "+22%", trend: "up", swatch: "bg-stage-amber" },
    { key: "won", label: "Won", value: 58, delta: "+112%", trend: "up", swatch: "bg-stage-green" },
  ],
  30: [
    { key: "total", label: "Total", value: 1026, delta: "+20%", trend: "up", swatch: "bg-foreground" },
    { key: "open", label: "Open", value: 257, delta: "New", trend: "up", swatch: "bg-stage-blue" },
    { key: "expired", label: "Expired", value: 0, delta: "No change", trend: "flat", swatch: "bg-stage-red" },
    { key: "qualified", label: "Qualified", value: 601, delta: "+46%", trend: "up", swatch: "bg-stage-amber" },
    { key: "won", label: "Won", value: 234, delta: "+378%", trend: "up", swatch: "bg-stage-green" },
  ],
  90: [
    { key: "total", label: "Total", value: 3184, delta: "+28%", trend: "up", swatch: "bg-foreground" },
    { key: "open", label: "Open", value: 612, delta: "New", trend: "up", swatch: "bg-stage-blue" },
    { key: "expired", label: "Expired", value: 0, delta: "No change", trend: "flat", swatch: "bg-stage-red" },
    { key: "qualified", label: "Qualified", value: 1842, delta: "+58%", trend: "up", swatch: "bg-stage-amber" },
    { key: "won", label: "Won", value: 726, delta: "+412%", trend: "up", swatch: "bg-stage-green" },
  ],
};

type Performance = {
  wonValue: number;
  spend: number;
  roi: number;
  wonDelta: string;
  spendDelta: string;
  roiDelta: string;
};

const performanceData: Record<Range, Performance> = {
  7: { wonValue: 812420.55, spend: 48210.4, roi: 16.85, wonDelta: "+184%", spendDelta: "+12%", roiDelta: "+148%" },
  30: { wonValue: 2933450.99, spend: 182040.99, roi: 16.11, wonDelta: "+199%", spendDelta: "+18%", roiDelta: "+152%" },
  90: { wonValue: 8142920.1, spend: 524310.22, roi: 15.53, wonDelta: "+212%", spendDelta: "+24%", roiDelta: "+161%" },
};

const sourcesData: Record<Range, { name: string; leads: number; conv: number; roas: string }[]> = {
  7: [
    { name: "Google Ads", leads: 42, conv: 16, roas: "5.8×" },
    { name: "Meta Ads", leads: 34, conv: 12, roas: "4.0×" },
    { name: "Organic", leads: 14, conv: 6, roas: "—" },
    { name: "Referral", leads: 8, conv: 3, roas: "—" },
  ],
  30: [
    { name: "Google Ads", leads: 184, conv: 72, roas: "6.4×" },
    { name: "Meta Ads", leads: 142, conv: 51, roas: "4.2×" },
    { name: "Organic", leads: 64, conv: 28, roas: "—" },
    { name: "Referral", leads: 38, conv: 13, roas: "—" },
  ],
  90: [
    { name: "Google Ads", leads: 562, conv: 218, roas: "6.1×" },
    { name: "Meta Ads", leads: 428, conv: 156, roas: "4.3×" },
    { name: "Organic", leads: 192, conv: 84, roas: "—" },
    { name: "Referral", leads: 102, conv: 38, roas: "—" },
  ],
};

const chartData: Record<Range, [number, number][]> = {
  7: [[8, 5], [14, 9], [22, 14], [18, 12], [26, 17], [30, 19], [28, 18]],
  30: [
    [12, 8], [18, 11], [22, 14], [19, 12], [26, 17], [30, 19], [28, 18],
    [34, 21], [38, 24], [33, 20], [42, 26], [48, 31],
  ],
  90: [
    [10, 7], [14, 10], [18, 13], [16, 11], [22, 16], [26, 18], [24, 17],
    [30, 20], [34, 23], [30, 19], [38, 25], [44, 30],
    [42, 28], [48, 32], [52, 36], [46, 31], [56, 38], [60, 42],
    [58, 40], [64, 44], [68, 48], [62, 43], [72, 50], [78, 55],
  ],
};

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Leadlogr" }] }),
  component: DashboardPage,
});

const nf = new Intl.NumberFormat("en-US");
const cf = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function DashboardPage() {
  const [range, setRange] = useState<Range>(30);
  const stages = overviewData[range];
  const perf = performanceData[range];
  const sources = sourcesData[range];

  const { ownWorkspace } = useAccount();
  const workspaceKey = useMemo(() => deriveWorkspaceKey(ownWorkspace.name), [ownWorkspace.name]);
  const fetchStatuses = useServerFn(getIntegrationStatuses);
  const { data: statuses } = useQuery({
    queryKey: ["integration-statuses", workspaceKey],
    queryFn: () => fetchStatuses({ data: { workspaceKey } }),
    staleTime: 30_000,
  });
  const hasLeads = (statuses?.incomingConnectedIds.length ?? 0) > 0;
  const hasAds = !!statuses?.googleAdsConnected;
  const hasPerf = hasLeads && hasAds;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Real-time view of leads, conversions, and what's flowing back to your ad platforms."
        actions={
          <div className="flex items-center gap-1 rounded-md ring-1 ring-border bg-card p-1">
            {([7, 30, 90] as Range[]).map((r) => (
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
        <PerformanceCard perf={perf} hasData={hasPerf} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card ring-1 ring-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold">Conversion volume</h3>
              <p className="text-xs text-muted-foreground">Closed-won conversions synced to ad platforms.</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-foreground" /> Google
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-brand-accent" /> Meta
              </span>
            </div>
          </div>
          {hasPerf ? (
            <ChartMock range={range} />
          ) : (
            <EmptyState
              className="h-48"
              message={hasLeads ? "Connect an ad platform to track conversions" : "Start a campaign to see conversions flow in"}
            />
          )}
        </div>

        <div className="bg-card ring-1 ring-border rounded-lg p-6">
          <h3 className="font-semibold mb-1">Top sources</h3>
          <p className="text-xs text-muted-foreground mb-4">By qualified leads.</p>
          {hasLeads ? (
            <div className="space-y-3">
              {sources.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.leads} leads · {s.conv} conv
                    </div>
                  </div>
                  <div className="text-sm font-mono text-foreground">{s.roas}</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState className="h-32" message="Connect an integration to rank your top sources" />
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 text-center ${className}`}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TrendChip({ delta, trend, compact = false }: { delta: string; trend: Trend; compact?: boolean }) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const cls =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls} ${compact ? "text-[10px]" : "text-[11px]"} font-medium tabular-nums`}>
      <Icon className="size-3" strokeWidth={2.25} />
      {delta}
    </span>
  );
}

function FunnelCard({ stages }: { stages: Stage[] }) {
  const total = stages.find((s) => s.key === "total")!.value;
  const funnelStages = stages.filter((s) => s.key !== "total");
  const totalStage = stages.find((s) => s.key === "total")!;

  return (
    <section className="lg:col-span-3 bg-card ring-1 ring-border rounded-lg p-5 flex flex-col gap-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Lead Overview
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <h2 className="text-4xl font-semibold tracking-tight tabular-nums">{nf.format(total)}</h2>
            <span className="text-sm text-muted-foreground">total leads</span>
            <TrendChip delta={totalStage.delta} trend={totalStage.trend} />
          </div>
        </div>
      </header>

      {/* Stacked funnel bar */}
      <div className="space-y-2">
        <div className="flex h-2.5 rounded-full overflow-hidden ring-1 ring-border bg-muted">
          {funnelStages.map((s) => {
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
          <span>{nf.format(total)}</span>
        </div>
      </div>

      {/* Stage tiles */}
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
                <span className="text-xl font-semibold tabular-nums tracking-tight">{nf.format(s.value)}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{pct}%</span>
              </div>
              <TrendChip delta={s.delta} trend={s.trend} compact />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PerformanceCard({ perf }: { perf: Performance }) {
  const netProfit = perf.wonValue - perf.spend;
  const spendPct = (perf.spend / perf.wonValue) * 100;

  return (
    <section className="lg:col-span-2 bg-card ring-1 ring-border rounded-lg p-5 flex flex-col gap-5">
      <header className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Performance
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-[10px] font-semibold">
          <ArrowUpRight className="size-3" strokeWidth={2.5} />
          {perf.roiDelta}
        </span>
      </header>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Return on investment</div>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">{perf.roi.toFixed(2)}</span>
          <span className="text-2xl font-light text-muted-foreground">×</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1.5">
          Net profit{" "}
          <span className="text-foreground font-medium tabular-nums">{cf.format(netProfit)}</span>
        </div>
      </div>

      {/* Spend vs Won proportional bar */}
      <div className="space-y-2">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted ring-1 ring-border">
          <div className="bg-destructive/80" style={{ width: `${spendPct}%` }} />
          <div className="bg-success" style={{ width: `${100 - spendPct}%` }} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-2 rounded-sm bg-destructive/80" /> Spend
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">{cf.format(perf.spend)}</div>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive tabular-nums">
              <ArrowUpRight className="size-3" strokeWidth={2.25} />
              {perf.spendDelta}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="size-2 rounded-sm bg-success" /> Won Value
            </div>
            <div className="text-base font-semibold tabular-nums mt-0.5">{cf.format(perf.wonValue)}</div>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success tabular-nums">
              <ArrowUpRight className="size-3" strokeWidth={2.25} />
              {perf.wonDelta}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChartMock({ range }: { range: Range }) {
  const data = chartData[range];
  const max = 80;
  const label = range === 7 ? "D" : "W";
  const step = range === 90 ? 2 : 1;
  return (
    <div className="flex items-end gap-1.5 h-48">
      {data.map(([g, m], i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-0.5 h-full">
            <div className="flex-1 bg-foreground rounded-sm" style={{ height: `${(g / max) * 100}%` }} />
            <div className="flex-1 bg-brand-accent/80 rounded-sm" style={{ height: `${(m / max) * 100}%` }} />
          </div>
          {i % step === 0 && (
            <span className="text-[9px] font-mono text-muted-foreground">{label}{i + 1}</span>
          )}
        </div>
      ))}
    </div>
  );
}
