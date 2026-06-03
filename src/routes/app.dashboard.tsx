import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useState } from "react";

type Range = 7 | 30 | 90;

const rangeLabel: Record<Range, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

const metricsData: Record<Range, { label: string; value: string; delta: string; positive: boolean }[]> = {
  7: [
    { label: "New leads (7d)", value: "98", delta: "+8.2%", positive: true },
    { label: "Qualified rate", value: "36.7%", delta: "+1.4%", positive: true },
    { label: "Conversions synced", value: "42", delta: "+6", positive: true },
    { label: "Match rate", value: "93.5%", delta: "−0.2%", positive: false },
  ],
  30: [
    { label: "New leads (30d)", value: "428", delta: "+12.4%", positive: true },
    { label: "Qualified rate", value: "38.2%", delta: "+3.1%", positive: true },
    { label: "Conversions synced", value: "164", delta: "+24", positive: true },
    { label: "Match rate", value: "94.1%", delta: "−0.4%", positive: false },
  ],
  90: [
    { label: "New leads (90d)", value: "1,284", delta: "+18.6%", positive: true },
    { label: "Qualified rate", value: "37.5%", delta: "+4.2%", positive: true },
    { label: "Conversions synced", value: "482", delta: "+71", positive: true },
    { label: "Match rate", value: "93.8%", delta: "+0.1%", positive: true },
  ],
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
  7: [
    [8, 5], [14, 9], [22, 14], [18, 12], [26, 17], [30, 19], [28, 18],
  ],
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

function DashboardPage() {
  const [range, setRange] = useState<Range>(30);

  const metrics = metricsData[range];
  const sources = sourcesData[range];

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="bg-card ring-1 ring-border rounded-lg p-5">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {m.label}
            </div>
            <div className="text-3xl font-semibold tracking-tight mt-3">{m.value}</div>
            <div className={`text-xs font-medium mt-1 ${m.positive ? "text-success" : "text-destructive"}`}>
              {m.delta} vs prev period
            </div>
          </div>
        ))}
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
          <ChartMock range={range} />
        </div>

        <div className="bg-card ring-1 ring-border rounded-lg p-6">
          <h3 className="font-semibold mb-1">Top sources</h3>
          <p className="text-xs text-muted-foreground mb-4">By qualified leads.</p>
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
        </div>
      </div>
    </>
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
