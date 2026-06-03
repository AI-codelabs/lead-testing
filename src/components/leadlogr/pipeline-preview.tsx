const columns = [
  {
    title: "New",
    count: 12,
    dot: "bg-muted-foreground/60",
    cards: [
      { name: "Marcus Thorne", meta: "Enterprise SaaS · Google", value: "—" },
      { name: "Elena Rodríguez", meta: "Agency retainer · Meta", value: "—" },
      { name: "Apex Solutions", meta: "Form · Direct", value: "—" },
    ],
  },
  {
    title: "Qualified",
    count: 8,
    dot: "bg-brand-accent",
    cards: [
      { name: "Northwind Co.", meta: "Discovery booked · Google", value: "$8.4k" },
      { name: "Helio Studio", meta: "Demo done · Meta", value: "$3.1k" },
    ],
  },
  {
    title: "Closed-Won",
    count: 24,
    dot: "bg-success",
    cards: [
      { name: "Project Zenith", meta: "Synced to Google CAPI", value: "$12.5k" },
      { name: "Falcon Group", meta: "Synced to Meta CAPI", value: "$6.2k" },
    ],
  },
];

export function PipelinePreview() {
  return (
    <div className="bg-muted p-2 rounded-2xl ring-1 ring-black/5">
      <div className="bg-card rounded-xl ring-1 ring-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-border" />
            <div className="size-2.5 rounded-full bg-border" />
            <div className="size-2.5 rounded-full bg-border" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Dashboard / Live Pipeline
          </span>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-brand-accent animate-pulse" />
            <span className="text-[10px] font-medium text-muted-foreground">Synced</span>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 p-4">
          {columns.map((col) => (
            <div key={col.title} className="rounded-lg bg-muted/50 p-3 ring-1 ring-border/60">
              <div className="flex items-center justify-between mb-3">
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
                  <div key={c.name} className="rounded-md bg-card ring-1 ring-border p-3">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">{c.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{c.value}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
