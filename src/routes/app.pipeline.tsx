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
import { ArrowLeft, ArrowRight, Check, Download, Lock, Palette, Plus, X } from "lucide-react";
import { LeadDialog } from "@/components/leadlogr/lead-dialog";
import {
  CUSTOM_STAGE_INSERT_BEFORE,
  DEFAULT_STAGES,
  PALETTES,
  PALETTE_ORDER,
  SEED_LEADS,
  type Lead,
  type Palette as PaletteDef,
  type PaletteKey,
  type StageDef,
} from "@/components/leadlogr/lead-types";

import { downloadCsv, timestamp, toCsv } from "@/lib/csv";
import { useAccess } from "@/lib/account-context";


export const Route = createFileRoute("/app/pipeline")({
  head: () => ({ meta: [{ title: "Lead Pipeline — Leadlogr" }] }),
  ssr: false,
  component: PipelinePage,
});

function PipelinePage() {
  const access = useAccess();
  if (access.metricsOnly) {
    return (
      <>
        <PageHeader eyebrow="Sales" title="Lead Pipeline" description="Pipeline details are hidden by the client." />
        <div className="bg-card ring-1 ring-border rounded-lg p-10 text-center">
          <Lock className="size-6 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold">Restricted by client</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
            This client has granted read-only metrics access. The pipeline board isn't visible.
          </p>
        </div>
      </>
    );
  }
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [stages, setStages] = useState<StageDef[]>(DEFAULT_STAGES);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

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

  const pickNextPalette = (): PaletteKey => {
    const used = new Set(stages.map((s) => s.palette));
    return PALETTE_ORDER.find((k) => !used.has(k)) ?? "slate";
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
      const insertIdx = prev.findIndex((s) => s.name === CUSTOM_STAGE_INSERT_BEFORE);
      const next: StageDef = { id, name, locked: false, palette: pickNextPalette() };
      if (insertIdx === -1) return [...prev, next];
      return [...prev.slice(0, insertIdx), next, ...prev.slice(insertIdx)];
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

  const handleRecolor = (stageId: string, palette: PaletteKey) => {
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, palette } : s)));
    setPickerOpenFor(null);
  };

  const handleMove = (stageId: string, dir: -1 | 1) => {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === stageId);
      if (idx === -1) return prev;
      const stage = prev[idx];
      if (stage.locked) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      // Don't allow swapping with a locked stage — keeps fixed stages anchored.
      if (prev[target].locked) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
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
        description="Drag leads between stages. New, Contacted, Qualified, Won, Lost, and Disqualified are fixed system stages used to send conversion signals to Google Ads and Meta Ads. Their colors can still be changed."
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
          {stages.map((stage, idx) => {
            const prev = stages[idx - 1];
            const next = stages[idx + 1];
            return (
              <Column
                key={stage.id}
                stage={stage}
                palette={PALETTES[stage.palette]}
                leads={grouped[stage.name] ?? []}
                onCardClick={openEdit}
                onRemove={() => handleRemoveStage(stage)}
                onRecolor={(p) => handleRecolor(stage.id, p)}
                onMoveLeft={prev && !prev.locked && !stage.locked ? () => handleMove(stage.id, -1) : undefined}
                onMoveRight={next && !next.locked && !stage.locked ? () => handleMove(stage.id, 1) : undefined}
                pickerOpen={pickerOpenFor === stage.id}
                onTogglePicker={() =>
                  setPickerOpenFor((cur) => (cur === stage.id ? null : stage.id))
                }
              />
            );
          })}

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
          {activeLead ? <LeadCard lead={activeLead} dragging /> : null}
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
  palette,
  leads,
  onCardClick,
  onRemove,
  onRecolor,
  onMoveLeft,
  onMoveRight,
  pickerOpen,
  onTogglePicker,
}: {
  stage: StageDef;
  palette: PaletteDef;
  leads: Lead[];
  onCardClick: (l: Lead) => void;
  onRemove: () => void;
  onRecolor: (p: PaletteKey) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.name });
  return (
    <div
      ref={setNodeRef}
      className={`${palette.soft} ring-1 ${palette.line} rounded-lg p-3 transition-all min-h-[200px] ${
        isOver ? "ring-2 ring-foreground/30 scale-[1.005]" : ""
      }`}
    >
      <div
        className={`relative flex items-center justify-between px-2 py-2 mb-3 rounded-md bg-card/60 ring-1 ${palette.line} gap-2`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onTogglePicker}
            title="Change color"
            className={`size-3 rounded-full shrink-0 ${palette.dot} ring-1 ring-foreground/10 hover:ring-foreground/40 transition`}
          />
          <span
            className={`text-[10px] font-semibold tracking-widest uppercase truncate ${palette.ink}`}
          >
            {stage.name}
          </span>
          {stage.locked && (
            <span title="System stage — fixed position, used for ad platform conversion sync">
              <Lock className={`size-3 shrink-0 ${palette.ink} opacity-60`} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!stage.locked && (
            <>
              <button
                onClick={onMoveLeft}
                disabled={!onMoveLeft}
                title="Move left"
                className="text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground/60"
              >
                <ArrowLeft className="size-3" />
              </button>
              <button
                onClick={onMoveRight}
                disabled={!onMoveRight}
                title="Move right"
                className="text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground/60"
              >
                <ArrowRight className="size-3" />
              </button>
            </>
          )}
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/60 ${palette.ink}`}
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

        {pickerOpen && (
          <ColorPicker active={stage.palette} onPick={onRecolor} onClose={onTogglePicker} />
        )}
      </div>

      <div className="space-y-2">
        {leads.map((l) => (
          <DraggableCard key={l.id} lead={l} onClick={() => onCardClick(l)} />
        ))}
      </div>
    </div>
  );
}

function ColorPicker({
  active,
  onPick,
  onClose,
}: {
  active: PaletteKey;
  onPick: (p: PaletteKey) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* click-outside */}
      <button
        type="button"
        aria-label="Close color picker"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="absolute top-full left-0 mt-1 z-50 bg-popover text-popover-foreground rounded-md ring-1 ring-border shadow-lg p-2 w-44">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 pb-1.5 flex items-center gap-1.5">
          <Palette className="size-3" />
          Stage color
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {PALETTE_ORDER.map((key) => {
            const p = PALETTES[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick(key)}
                title={p.label}
                className={`relative size-7 rounded-md ${p.dot} ring-1 ring-foreground/10 hover:scale-110 transition`}
              >
                {isActive && (
                  <Check className="absolute inset-0 m-auto size-3.5 text-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
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
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
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
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ring-border text-muted-foreground">
            High priority
          </span>
        )}
        {lead.qualification === "Customer" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ring-border text-muted-foreground">
            Customer
          </span>
        )}
      </div>
    </div>
  );
}
