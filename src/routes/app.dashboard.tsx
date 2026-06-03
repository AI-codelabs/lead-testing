import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Leadlogr" }] }),
  component: DashboardPage,
});

const metrics = [
  { label: "New leads (30d)", value: "428", delta: "+12.4%", positive: true },
  { label: "Qualified rate", value: "38.2%", delta: "+3.1%", positive: true },
  { label: "Conversions synced", value: "164", delta: "+24", positive: true },
  { label: "Match rate", value: "94.1%", delta: "−0.4%", positive: false },
];

const sources = [
  { name: "Google Ads", leads: 184, conv: 72, roas: "6.4×" },
  { name: "Meta Ads", leads: 142, conv: 51, roas: "4.2×" },
  { name: "Organic", leads: 64, conv: 28, roas: "—" },
  { name: "Referral", leads: 38, conv: 13, roas: "—" },
];

function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Real-time view of leads, conversions, and what's flowing back to your ad platforms."
        actions={
          <button className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors flex items-center gap-1.5">
            Last 30 days
            <ArrowUpRight className="size-3.5" />
          </button>
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
          <ChartMock />
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

function ChartMock() {
  const data: [number, number][] = [
    [12, 8], [18, 11], [22, 14], [19, 12], [26, 17], [30, 19], [28, 18],
    [34, 21], [38, 24], [33, 20], [42, 26], [48, 31],
  ];
  const max = 50;
  return (
    <div className="flex items-end gap-3 h-48">
      {data.map(([g, m], i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex items-end gap-1 h-full">
            <div className="flex-1 bg-foreground rounded-sm" style={{ height: `${(g / max) * 100}%` }} />
            <div className="flex-1 bg-brand-accent/80 rounded-sm" style={{ height: `${(m / max) * 100}%` }} />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">W{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
