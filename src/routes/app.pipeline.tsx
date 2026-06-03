import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/app/pipeline")({
  head: () => ({ meta: [{ title: "Lead Pipeline — Leadlogr" }] }),
  component: PipelinePage,
});

type Lead = {
  name: string;
  company: string;
  source: "Google" | "Meta" | "Direct";
  value?: string;
  badge?: string;
};

const columns: { title: string; dot: string; count: number; cards: Lead[] }[] = [
  {
    title: "New",
    dot: "bg-muted-foreground/60",
    count: 12,
    cards: [
      { name: "Marcus Thorne", company: "Thorne Capital", source: "Google" },
      { name: "Elena Rodríguez", company: "Helio Studio", source: "Meta" },
      { name: "Liam O'Connor", company: "Apex Solutions", source: "Direct" },
    ],
  },
  {
    title: "Contacted",
    dot: "bg-warning",
    count: 7,
    cards: [
      { name: "Priya Shah", company: "Northwind Co.", source: "Google" },
      { name: "Tom Becker", company: "Falcon Group", source: "Meta" },
    ],
  },
  {
    title: "Qualified",
    dot: "bg-brand-accent",
    count: 8,
    cards: [
      { name: "Ava Lin", company: "Bright Holdings", source: "Google", value: "$8.4k", badge: "High intent" },
      { name: "Noah Patel", company: "Vertex Labs", source: "Meta", value: "$3.1k" },
    ],
  },
  {
    title: "Closed-Won",
    dot: "bg-success",
    count: 24,
    cards: [
      { name: "Project Zenith", company: "Synced · Google CAPI", source: "Google", value: "$12.5k" },
      { name: "Falcon Group", company: "Synced · Meta CAPI", source: "Meta", value: "$6.2k" },
    ],
  },
];

function PipelinePage() {
  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Lead Pipeline"
        description="Move leads through stages. Closed-Won leads are synced back to ad platforms automatically."
        actions={
          <button className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary shadow-sm flex items-center gap-1.5">
            <Plus className="size-3.5" />
            New lead
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.title} className="bg-muted/40 ring-1 ring-border rounded-lg p-3">
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${col.dot}`} />
                <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  {col.title}
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map((c) => (
                <div key={c.name} className="bg-card ring-1 ring-border rounded-md p-3 hover:ring-border-strong transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{c.name}</span>
                    {c.value && (
                      <span className="text-[10px] font-mono text-foreground shrink-0">{c.value}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{c.company}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ring-border text-muted-foreground">
                      {c.source}
                    </span>
                    {c.badge && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-accent/10 text-brand-accent">
                        {c.badge}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
