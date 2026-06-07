import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { siGoogleads, siMeta } from "simple-icons";
import { PageHeader } from "@/components/leadlogr/page-header";
import {
  ArrowUpDown,
  Check,
  Columns3,
  Download,
  Filter,
  Globe,
  Linkedin,
  Lock,
  Monitor,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deleteLead } from "@/lib/leads.functions";

import { downloadCsv, timestamp, toCsv } from "@/lib/csv";
import { LeadDialog } from "@/components/leadlogr/lead-dialog";
import {
  LABEL_STYLES,
  LEAD_LABELS,
  SEED_LEADS,
  type Lead,
  type LeadLabel,
  type Source,
} from "@/components/leadlogr/lead-types";
import { useAccess, useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey, useLiveLeads } from "@/hooks/use-live-leads";

export const Route = createFileRoute("/app/crm")({
  head: () => ({ meta: [{ title: "CRM — Leadlogr" }] }),
  ssr: false,
  component: CrmPage,
});

type Tab = "Open" | "Qualified" | "Won" | "Lost" | "Expired" | "All";
const TABS: Tab[] = ["Open", "Qualified", "Won", "Lost", "Expired", "All"];

const symbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

function formatExpiresIn(iso: string): { text: string; tone: "red" | "amber" | "green" | "muted" } {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d ago`, tone: "muted" };
  if (days <= 7) return { text: `${days}d`, tone: "red" };
  if (days <= 30) return { text: `${days}d`, tone: "amber" };
  return { text: `${days}d`, tone: "green" };
}

const toneDot: Record<"red" | "amber" | "green" | "muted", string> = {
  red: "bg-stage-red",
  amber: "bg-stage-amber",
  green: "bg-stage-green",
  muted: "bg-muted-foreground/40",
};

function BrandSvg({ icon }: { icon: { path: string; hex: string } }) {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" style={{ fill: `#${icon.hex}` }} aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}

function ChannelIcon({ source }: { source: Source }) {
  const base = "size-6 rounded flex items-center justify-center";
  if (source === "Google")
    return (
      <span title="Google Ads" className={`${base} bg-card ring-1 ring-border`}>
        <BrandSvg icon={siGoogleads} />
      </span>
    );
  if (source === "Meta")
    return (
      <span title="Meta Ads" className={`${base} bg-card ring-1 ring-border`}>
        <BrandSvg icon={siMeta} />
      </span>
    );
  if (source === "LinkedIn")
    return (
      <span title="LinkedIn Ads" className={`${base} bg-card ring-1 ring-border text-[#0A66C2]`}>
        <Linkedin className="size-3.5" fill="currentColor" stroke="none" />
      </span>
    );
  if (source === "Microsoft")
    return (
      <span title="Microsoft Ads" className={`${base} bg-card ring-1 ring-border text-foreground`}>
        <Monitor className="size-3.5" />
      </span>
    );
  return (
    <span title="Direct" className={`${base} bg-card ring-1 ring-border text-muted-foreground`}>
      <Globe className="size-3.5" />
    </span>
  );
}

function matchesTab(lead: Lead, tab: Tab): boolean {
  if (tab === "All") return true;
  if (tab === "Qualified") return lead.qualification === "Qualified" || lead.stage === "Qualified";
  if (tab === "Won") return lead.stage === "Won";
  if (tab === "Lost") return lead.stage === "Lost" || lead.stage === "Disqualified";
  if (tab === "Expired") return new Date(lead.expiresAt).getTime() < Date.now();
  // Open: anything not yet decided & not expired
  return (
    lead.stage !== "Won" &&
    lead.stage !== "Lost" &&
    lead.stage !== "Disqualified" &&
    new Date(lead.expiresAt).getTime() >= Date.now()
  );
}

const ALL_COLUMNS = ["Expires In", "Channel", "Name", "Email", "Label", "Value", "Actions"] as const;
type Column = (typeof ALL_COLUMNS)[number];

function CrmPage() {
  const access = useAccess();
  const { ownWorkspace } = useAccount();
  const workspaceKey = useMemo(() => deriveWorkspaceKey(ownWorkspace.name), [ownWorkspace.name]);
  const liveLeads = useLiveLeads(workspaceKey);
  const [seedLeads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const deleteLeadFn = useServerFn(deleteLead);
  const leads = useMemo(() => {
    const liveIds = new Set(liveLeads.map((l) => l.id));
    const merged = [...liveLeads, ...seedLeads.filter((l) => !liveIds.has(l.id))];
    return merged.filter((l) => !deletedIds.has(l.id));
  }, [liveLeads, seedLeads, deletedIds]);
  const [tab, setTab] = useState<Tab>("Open");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<Column>>(new Set(ALL_COLUMNS));
  const [labelMenuFor, setLabelMenuFor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowsPerPage, setRowsPerPage] = useState(50);

  if (access.metricsOnly) {
    return (
      <>
        <PageHeader eyebrow="Contacts" title="CRM" description="Individual leads are hidden by the client." />
        <RestrictedNotice leadsCount={SEED_LEADS.length} />
      </>
    );
  }

  const counts = useMemo(() => {
    const out: Record<Tab, number> = { Open: 0, Qualified: 0, Won: 0, Lost: 0, Expired: 0, All: leads.length };
    for (const l of leads) {
      for (const t of TABS) if (t !== "All" && matchesTab(l, t)) out[t]++;
    }
    return out;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = leads.filter((l) => matchesTab(l, tab));
    if (q) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.company ?? "").toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      const ax = new Date(a.expiresAt).getTime();
      const bx = new Date(b.expiresAt).getTime();
      return sortAsc ? ax - bx : bx - ax;
    });
    return list;
  }, [leads, tab, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages - 1);
  const startIdx = safePage * rowsPerPage;
  const pageRows = filtered.slice(startIdx, startIdx + rowsPerPage);

  const showCol = (c: Column) => visibleCols.has(c);

  const toggleCol = (c: Column) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const toggleFav = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setStage = (id: string, stage: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage, updatedAt: new Date().toISOString() } : l)),
    );
  };

  const setLabel = (id: string, label: LeadLabel) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, label } : l)));
    setLabelMenuFor(null);
  };

  const setValue = (id: string, value: number) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, value } : l)));
  };

  const handleExport = () => {
    const rows = filtered.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      company: l.company ?? "",
      stage: l.stage,
      label: l.label,
      source: l.source,
      value: l.value,
      currency: l.currency,
      expires_at: l.expiresAt,
      updated_at: l.updatedAt,
    }));
    downloadCsv(`leadlogr-crm-${timestamp()}.csv`, toCsv(rows));
  };

  const openEdit = (lead: Lead) => {
    if (!access.canSeeDetails) return;
    setEditing(lead);
    setDialogOpen(true);
  };

  const handleSave = (lead: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = pageRows.map((l) => l.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };


  const handleDeleteSelected = async () => {
    if (!access.canSeeDetails) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;

    setDeletedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
    setSelectedIds(new Set());

    const liveIdSet = new Set(liveLeads.map((l) => l.id));
    const liveTargets = ids.filter((id) => liveIdSet.has(id));
    const results = await Promise.allSettled(
      liveTargets.map((id) => deleteLeadFn({ data: { id, workspaceKey } })),
    );
    const failed = results
      .map((r, i) => (r.status === "rejected" ? liveTargets[i] : null))
      .filter((x): x is string => x !== null);
    if (failed.length > 0) {
      console.error("[crm] delete failed for", failed);
      window.alert(`Failed to delete ${failed.length} lead${failed.length === 1 ? "" : "s"}.`);
      setDeletedIds((prev) => {
        const next = new Set(prev);
        failed.forEach((id) => next.delete(id));
        return next;
      });
    }
  };



  return (
    <>
      <PageHeader
        eyebrow="Contacts"
        title="CRM"
        description="Every lead in one searchable, filterable, sortable table."
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setPage(0);
                }}
                className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  active ? "bg-card ring-1 ring-border text-foreground" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <TabDot tab={t} />
                {t}
                <span className="text-[10px] font-mono text-muted-foreground">{counts[t]}</span>
              </button>
            );
          })}
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card ring-1 ring-border rounded-md text-sm pl-8 pr-3 py-2 w-56 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <ToolbarButton icon={<Filter className="size-3.5" />} label="Filter" />
          <button
            onClick={() => setSortAsc((v) => !v)}
            className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border flex items-center gap-1.5 hover:bg-muted transition-colors"
          >
            <ArrowUpDown className="size-3.5" />
            Expires At {sortAsc ? "↑" : "↓"}
          </button>
          <div className="relative">
            <button
              onClick={() => setColumnsOpen((v) => !v)}
              className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border flex items-center gap-1.5 hover:bg-muted transition-colors"
            >
              <Columns3 className="size-3.5" />
              Columns
            </button>
            {columnsOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setColumnsOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover text-popover-foreground rounded-md ring-1 ring-border shadow-lg p-2 w-48">
                  {ALL_COLUMNS.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCol(c)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-muted"
                    >
                      <span>{c}</span>
                      {visibleCols.has(c) && <Check className="size-3.5 text-foreground" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleExport}
            className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border flex items-center gap-1.5 hover:bg-muted transition-colors"
          >
            <Download className="size-3.5" />
            Export
          </button>
          {selectedIds.size > 0 && access.canSeeDetails && (
            <button
              onClick={handleDeleteSelected}
              className="text-sm font-medium px-3 py-2 rounded-md bg-stage-red-soft text-stage-red-ink ring-1 ring-stage-red-line flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            >
              <Trash2 className="size-3.5" />
              Delete ({selectedIds.size})
            </button>
          )}
          <button className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary flex items-center gap-1.5 hover:bg-primary/90 transition-colors">
            <Plus className="size-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card ring-1 ring-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-3 w-10"></th>
                <th className="px-3 py-3 w-8 text-muted-foreground/60">#</th>
                {showCol("Expires In") && <th className="px-3 py-3">Expires In</th>}
                {showCol("Channel") && <th className="px-3 py-3">Channel</th>}
                {showCol("Name") && <th className="px-3 py-3">Name</th>}
                {showCol("Email") && <th className="px-3 py-3">Email</th>}
                
                {showCol("Label") && <th className="px-3 py-3">Label</th>}
                {showCol("Value") && <th className="px-3 py-3">Value</th>}
                {showCol("Actions") && <th className="px-3 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((l, i) => {
                const expires = formatExpiresIn(l.expiresAt);
                const sym = symbols[l.currency] ?? "€";
                return (
                  <tr
                    key={l.id}
                    onClick={() => openEdit(l)}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${access.canSeeDetails ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="size-3.5 accent-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground/70">
                      {startIdx + i + 1}
                    </td>
                    {showCol("Expires In") && (
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${toneDot[expires.tone]}`} />
                          <span className="text-xs">{expires.text}</span>
                        </span>
                      </td>
                    )}
                    {showCol("Channel") && (
                      <td className="px-3 py-2.5">
                        <ChannelIcon source={l.source} />
                      </td>
                    )}
                    {showCol("Name") && (
                      <td className="px-3 py-2.5 font-medium">{l.name || "—"}</td>
                    )}
                    {showCol("Email") && (
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {access.canSeeDetails ? l.email : "•••"}
                      </td>
                    )}
                    {showCol("Label") && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            onClick={() => setLabelMenuFor((cur) => (cur === l.id ? null : l.id))}
                            className={`text-[10px] font-medium px-2 py-1 rounded ring-1 transition-colors ${LABEL_STYLES[l.label]}`}
                          >
                            {l.label}
                          </button>
                          {labelMenuFor === l.id && (
                            <>
                              <button
                                type="button"
                                aria-label="Close"
                                onClick={() => setLabelMenuFor(null)}
                                className="fixed inset-0 z-40 cursor-default"
                              />
                              <div className="absolute left-0 top-full mt-1 z-50 bg-popover text-popover-foreground rounded-md ring-1 ring-border shadow-lg p-1.5 w-40">
                                {LEAD_LABELS.map((lab) => (
                                  <button
                                    key={lab}
                                    onClick={() => setLabel(l.id, lab)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted"
                                  >
                                    <span>{lab}</span>
                                    {l.label === lab && <Check className="size-3 text-foreground" />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                    {showCol("Value") && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {access.canSeeDetails ? (
                          <div className="flex items-center gap-1 bg-background ring-1 ring-border rounded-md px-2 py-1 w-32">
                            <span className="text-xs text-muted-foreground">{sym}</span>
                            <input
                              type="number"
                              value={l.value || ""}
                              onChange={(e) => setValue(l.id, Number(e.target.value) || 0)}
                              placeholder="0"
                              className="flex-1 min-w-0 bg-transparent text-xs font-mono focus:outline-none"
                            />
                            <span className="text-[10px] font-mono text-muted-foreground/60">{l.currency}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">•••</span>
                        )}
                      </td>
                    )}
                    {showCol("Actions") && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setStage(l.id, "Lost")}
                            className="text-[10px] font-medium px-2 py-1 rounded ring-1 ring-stage-red-line bg-stage-red-soft text-stage-red-ink hover:opacity-80 flex items-center gap-1"
                          >
                            <X className="size-3" />
                            Lost
                          </button>
                          <button
                            onClick={() => toggleFav(l.id)}
                            className={`p-1 rounded hover:bg-muted ${favorites.has(l.id) ? "text-stage-amber-ink" : "text-muted-foreground"}`}
                            aria-label="Favorite"
                          >
                            <Star className={`size-3.5 ${favorites.has(l.id) ? "fill-current" : ""}`} />
                          </button>
                          <button
                            onClick={() => setStage(l.id, "Won")}
                            className="text-[10px] font-medium px-2 py-1 rounded ring-1 ring-stage-green-line bg-stage-green-soft text-stage-green-ink hover:opacity-80 flex items-center gap-1"
                          >
                            <Check className="size-3" />
                            Won
                          </button>
                          <button
                            onClick={() => handleDelete(l)}
                            className="p-1 rounded hover:bg-stage-red-soft text-muted-foreground hover:text-stage-red-ink transition-colors"
                            aria-label="Delete lead"
                            title="Delete lead"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    No leads match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <div>
            {filtered.length === 0
              ? "0 leads"
              : `${startIdx + 1}-${Math.min(startIdx + rowsPerPage, filtered.length)} of ${filtered.length} leads`}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5">
              Rows:
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
                className="bg-card ring-1 ring-border rounded px-1.5 py-0.5 focus:outline-none"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <PagerBtn disabled={safePage === 0} onClick={() => setPage(0)}>«</PagerBtn>
              <PagerBtn disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</PagerBtn>
              <span className="px-2">Page {safePage + 1} of {totalPages}</span>
              <PagerBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>›</PagerBtn>
              <PagerBtn disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</PagerBtn>
            </div>
          </div>
        </div>
      </div>

      {access.canSeeDetails && (
        <LeadDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          lead={editing}
          mode="edit"
          onSave={handleSave}
          stages={[...new Set(leads.map((l) => l.stage))]}
        />
      )}
    </>
  );
}

function TabDot({ tab }: { tab: Tab }) {
  const map: Record<Tab, string> = {
    Open: "bg-stage-blue",
    Qualified: "bg-stage-amber",
    Won: "bg-stage-green",
    Lost: "bg-stage-red",
    Expired: "bg-muted-foreground/50",
    All: "bg-foreground/60",
  };
  return <span className={`size-1.5 rounded-full ${map[tab]}`} />;
}

function ToolbarButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border flex items-center gap-1.5 hover:bg-muted transition-colors">
      {icon}
      {label}
    </button>
  );
}

function PagerBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="size-7 rounded ring-1 ring-border bg-card hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
    >
      {children}
    </button>
  );
}

function RestrictedNotice({ leadsCount }: { leadsCount: number }) {
  return (
    <div className="bg-card ring-1 ring-border rounded-lg p-10 text-center">
      <Lock className="size-6 text-muted-foreground mx-auto mb-3" />
      <h3 className="font-semibold">Restricted by client</h3>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
        This client has granted read-only metrics access. Individual lead records are not visible.
      </p>
      <div className="text-3xl font-semibold tracking-tight mt-6">{leadsCount.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">total leads in workspace</div>
    </div>
  );
}
