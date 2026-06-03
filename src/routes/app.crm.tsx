import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Download, Lock, Search } from "lucide-react";
import { downloadCsv, timestamp, toCsv } from "@/lib/csv";
import { LeadDialog } from "@/components/leadlogr/lead-dialog";
import { SEED_LEADS, type Lead } from "@/components/leadlogr/lead-types";
import { useAccess } from "@/lib/account-context";

export const Route = createFileRoute("/app/crm")({
  head: () => ({ meta: [{ title: "CRM — Leadlogr" }] }),
  ssr: false,
  component: CrmPage,
});

const stageColor: Record<string, string> = {
  New: "text-stage-blue-ink bg-stage-blue-soft ring-stage-blue-line",
  Contacted: "text-stage-green-ink bg-stage-green-soft ring-stage-green-line",
  Qualified: "text-stage-amber-ink bg-stage-amber-soft ring-stage-amber-line",
  Won: "text-stage-orange-ink bg-stage-orange-soft ring-stage-orange-line",
  Lost: "text-stage-red-ink bg-stage-red-soft ring-stage-red-line",
  Disqualified: "text-stage-purple-ink bg-stage-purple-soft ring-stage-purple-line",
};

function formatValue(value: number, currency: string) {
  if (!value || value <= 0) return "—";
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : "€";
  return `${sym}${value.toLocaleString()}`;
}

function CrmPage() {
  const access = useAccess();
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  if (access.metricsOnly) {
    return (
      <>
        <PageHeader eyebrow="Contacts" title="CRM" description="Individual leads are hidden by the client." />
        <RestrictedNotice leadsCount={SEED_LEADS.length} />
      </>
    );
  }

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.company ?? "").toLowerCase().includes(q)
    );
  });

  const handleExport = () => {
    const rows = filtered.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      company: l.company ?? "",
      stage: l.stage,
      source: l.source,
      value: l.value > 0 ? `${l.currency} ${l.value}` : "—",
      priority: l.priority,
      qualification: l.qualification,
      updated_at: l.updatedAt,
    }));
    downloadCsv(`leadlogr-crm-${timestamp()}.csv`, toCsv(rows));
  };

  const openEdit = (lead: Lead) => {
    setEditing(lead);
    setDialogOpen(true);
  };

  const handleSave = (lead: Lead) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? lead : l)),
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Contacts"
        title="CRM"
        description="Every lead, contact, and account in one searchable table."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-card ring-1 ring-border rounded-md text-sm pl-8 pr-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleExport}
              className="text-sm font-medium px-3 py-2 rounded-md bg-card text-foreground ring-1 ring-border shadow-sm flex items-center gap-1.5 hover:bg-muted transition-colors"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          </div>
        }
      />

      <div className="bg-card ring-1 ring-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3 text-right">Value</th>
              <th className="px-5 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => openEdit(c)}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <td className="px-5 py-3.5">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.company || "—"}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${stageColor[c.stage]}`}>
                    {c.stage}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.source}</td>
                <td className="px-5 py-3.5 text-right font-mono">{formatValue(c.value, c.currency)}</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground text-sm">
                  No leads match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lead={editing}
        mode="edit"
        onSave={handleSave}
        stages={[...new Set(leads.map((l) => l.stage))]}
      />
    </>
  );
}
