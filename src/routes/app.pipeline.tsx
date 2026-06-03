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
import { Download, Lock, Plus, X } from "lucide-react";
import { LeadDialog } from "@/components/leadlogr/lead-dialog";
import {
  CUSTOM_STAGE_DOT,
  CUSTOM_STAGE_INK,
  CUSTOM_STAGE_LINE,
  CUSTOM_STAGE_SOFT,
  DEFAULT_STAGES,
  SEED_LEADS,
  type Lead,
  type StageDef,
} from "@/components/leadlogr/lead-types";

import { downloadCsv, timestamp, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/app/pipeline")({
  head: () => ({ meta: [{ title: "Lead Pipeline — Leadlogr" }] }),
  ssr: false,
  component: PipelinePage,
});

function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [stages, setStages] = useState<StageDef[]>(DEFAULT_STAGES);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const stageNames = useMemo(() => stages.map((s) => s.name), [stages]);

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of stages) map[s.name] = [];
    for (const l of leads) {
      if (map[l.stage]) map[l.stage].push(l);
      else (map[stages[0].name] ??= []).push({ ...l, stage: stages[0].name });
    }
    return map;
  }, [leads, stages]);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over;
    if (!over) return;
    const targetStage = String(over.id);
    if (!stageNames.includes(targetStage)) return;
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

  const handleAddStage = () => {
    const name = newStageName.trim();
    if (!name) return;
    if (stages.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setNewStageName("");
      return;
    }
    const id = name.toLowerCase().replace(/\s+/g, "-");
    setStages((prev) => {
      // insert custom stages before the locked "Lost" terminal stage if present
      const lostIdx = prev.findIndex((s) => s.locked && s.name === "Lost");
      const next: StageDef = {
        id,
        name,
        locked: false,
        dot: CUSTOM_STAGE_DOT,
        soft: CUSTOM_STAGE_SOFT,
        ink: CUSTOM_STAGE_INK,
        line: CUSTOM_STAGE_LINE,
      };
      if (lostIdx === -1) return [...prev, next];
      return [...prev.slice(0, lostIdx), next, ...prev.slice(lostIdx)];
    });
    setNewStageName("");
    setAddingStage(false);
  };

  const handleRemoveStage = (stage: StageDef) => {
    if (stage.locked) return;
    const fallback = stages.find((s) => s.name !== stage.name)?.name ?? "New";
    setStages((prev) => prev.filter((s) => s.id !== stage.id));
    setLeads((prev) =>
      prev.map((l) => (l.stage === stage.name ? { ...l, stage: fallback } : l)),
    );
  };

  const handleExport = () => {
    const rows = leads.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      company: l.company ?? "",
      description: l.description,
      stage: l.stage,
      lead_status: l.qualification,
      priority: l.priority,
      qualification: l.qualification,
      source: l.source,
      campaign_name: l.campaignName,
      utm_source: l.utmSource,
      utm_medium: l.utmMedium,
      utm_campaign: l.utmCampaign,
      gclid: l.gclid,
      fbclid: l.fbclid,
      linkedin_tracking_id: l.liTrackingId,
      msclkid: l.msclkid,
      fbp: l.fbp,
      ga_client_id: l.gaClientId,
      ga_session_id: l.gaSessionId,
      website_url: l.websiteUrl,
      landing_page_url: l.landingPageUrl,
      page_path: l.pagePath,
      referrer_url: l.referrerUrl,
      consent: l.consent,
      tags: l.tags,
      notes: l.notes,
      lead_value: l.value,
      currency: l.currency,
      created_at: l.createdAt,
      updated_at: l.updatedAt,
    }));
    downloadCsv(`leadlogr-pipeline-${timestamp()}.csv`, toCsv(rows));
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Lead Pipeline"
        description="Drag leads between stages. Qualified, Lost, and Disqualified are system stages used to send conversion signals back to Google Ads and Meta Ads."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border shadow-sm flex items-center gap-1.5 hover:bg-muted transition-colors"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
            <button
              onClick={openCreate}
              className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary shadow-sm flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-3.5" />
              Add lead
            </button>
          </div>
        }
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              leads={grouped[stage.name] ?? []}
              onCardClick={openEdit}
              onRemove={() => handleRemoveStage(stage)}
            />
          ))}

          <div className="bg-muted/20 ring-1 ring-dashed ring-border rounded-lg p-3 min-h-[200px] flex flex-col">
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                Custom stage
              </span>
            </div>
            {addingStage ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddStage();
                    if (e.key === "Escape") { setAddingStage(false); setNewStageName(""); }
                  }}
                  placeholder="Stage name…"
                  className="w-full bg-card ring-1 ring-border rounded-md text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleAddStage}
                    className="flex-1 text-xs font-medium px-2 py-1.5 rounded-md bg-primary text-primary-foreground"
                  >
                    Add stage
                  </button>
                  <button
                    onClick={() => { setAddingStage(false); setNewStageName(""); }}
                    className="text-xs font-medium px-2 py-1.5 rounded-md ring-1 ring-border text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingStage(true)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-md transition-colors min-h-[100px]"
              >
                <Plus className="size-3.5" />
                Add custom stage
              </button>
            )}
          </div>
        </div>
        <DragOverlay>
          {activeLead ? (
            <LeadCard
              lead={activeLead}
              stage={stages.find((s) => s.name === activeLead.stage) ?? stages[0]}
              dragging
            />
          ) : null}
        </DragOverlay>

      </DndContext>

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={editing}
        mode={mode}
        onSave={handleSave}
        stages={stageNames}
      />
    </>
  );
}

function Column({
  stage,
  leads,
  onCardClick,
  onRemove,
}: {
  stage: StageDef;
  leads: Lead[];
  onCardClick: (l: Lead) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.name });
  return (
    <div
      ref={setNodeRef}
      className={`${stage.soft} ring-1 ${stage.line} rounded-lg p-3 transition-all min-h-[200px] ${
        isOver ? "ring-2 ring-foreground/30 scale-[1.005]" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between px-2 py-2 mb-3 rounded-md bg-card/60 ring-1 ${stage.line} gap-2`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-2 rounded-full shrink-0 ${stage.dot}`} />
          <span
            className={`text-[10px] font-semibold tracking-widest uppercase truncate ${stage.ink}`}
          >
            {stage.name}
          </span>
          {stage.locked && (
            <span title="System stage — used for ad platform conversion sync">
              <Lock className={`size-3 shrink-0 ${stage.ink} opacity-60`} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/60 ${stage.ink}`}
          >
            {leads.length}
          </span>
          {!stage.locked && (
            <button
              onClick={onRemove}
              title="Remove stage"
              className="text-muted-foreground/60 hover:text-destructive transition-colors"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
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
