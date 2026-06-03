import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Plus } from "lucide-react";
import { LeadDialog } from "@/components/leadlogr/lead-dialog";
import {
  SEED_LEADS,
  STAGES,
  STAGE_META,
  type Lead,
  type Stage,
} from "@/components/leadlogr/lead-types";

export const Route = createFileRoute("/app/pipeline")({
  head: () => ({ meta: [{ title: "Lead Pipeline — Leadlogr" }] }),
  component: PipelinePage,
});

function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<Stage, Lead[]> = { New: [], Contacted: [], Qualified: [], "Closed-Won": [] };
    for (const l of leads) map[l.stage].push(l);
    return map;
  }, [leads]);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over;
    if (!over) return;
    const targetStage = String(over.id) as Stage;
    if (!STAGES.includes(targetStage)) return;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === e.active.id && l.stage !== targetStage
          ? { ...l, stage: targetStage, updatedAt: new Date().toISOString() }
          : l,
      ),
    );
  };

  const openCreate = () => {
    setEditing(null);
    setMode("create");
    setDialogOpen(true);
  };
  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setMode("edit");
    setDialogOpen(true);
  };

  const handleSave = (lead: Lead) => {
    setLeads((prev) => {
      const exists = prev.some((l) => l.id === lead.id);
      return exists ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev];
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Lead Pipeline"
        description="Drag leads between stages. Closed-Won leads are synced back to ad platforms automatically."
        actions={
          <button
            onClick={openCreate}
            className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary shadow-sm flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Add lead
          </button>
        }
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              leads={grouped[stage]}
              onCardClick={openEdit}
            />
          ))}
        </div>
        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={editing}
        mode={mode}
        onSave={handleSave}
      />
    </>
  );
}

function Column({
  stage,
  leads,
  onCardClick,
}: {
  stage: Stage;
  leads: Lead[];
  onCardClick: (l: Lead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={`bg-muted/40 ring-1 rounded-lg p-3 transition-colors min-h-[200px] ${
        isOver ? "ring-brand-accent bg-brand-accent/5" : "ring-border"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${STAGE_META[stage].dot}`} />
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            {stage}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{leads.length}</span>
      </div>
      <div className="space-y-2">
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} onClick={() => onCardClick(l)} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={isDragging ? "opacity-30" : ""}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

function LeadCard({ lead, dragging }: { lead: Lead; dragging?: boolean }) {
  return (
    <div
      className={`bg-card ring-1 ring-border rounded-md p-3 cursor-pointer hover:ring-foreground/20 transition-all ${
        dragging ? "shadow-lg rotate-1 ring-foreground/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold truncate">{lead.name || "Untitled"}</span>
        {lead.value > 0 && (
          <span className="text-[10px] font-mono text-foreground shrink-0">
            €{lead.value.toLocaleString()}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {lead.company || lead.email || "—"}
      </p>
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ring-border text-muted-foreground">
          {lead.source}
        </span>
        {lead.priority === "High" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning">
            High priority
          </span>
        )}
        {lead.qualification === "Customer" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">
            Customer
          </span>
        )}
        {lead.qualification === "Qualified" && lead.priority !== "High" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-accent/10 text-brand-accent">
            Qualified
          </span>
        )}
      </div>
    </div>
  );
}
