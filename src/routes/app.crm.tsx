import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Download, Search } from "lucide-react";
import { downloadCsv, timestamp, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/app/crm")({
  head: () => ({ meta: [{ title: "CRM — Leadlogr" }] }),
  component: CrmPage,
});

const contacts = [
  { name: "Marcus Thorne", email: "marcus@thornecap.com", company: "Thorne Capital", stage: "New", source: "Google", value: "—", updated: "2m ago" },
  { name: "Elena Rodríguez", email: "elena@helio.studio", company: "Helio Studio", stage: "Qualified", source: "Meta", value: "$3.1k", updated: "1h ago" },
  { name: "Ava Lin", email: "ava@brightholdings.com", company: "Bright Holdings", stage: "Qualified", source: "Google", value: "$8.4k", updated: "3h ago" },
  { name: "Priya Shah", email: "priya@northwind.co", company: "Northwind Co.", stage: "Contacted", source: "Google", value: "—", updated: "Yesterday" },
  { name: "Tom Becker", email: "tom@falcongroup.io", company: "Falcon Group", stage: "Closed-Won", source: "Meta", value: "$6.2k", updated: "2d ago" },
  { name: "Noah Patel", email: "noah@vertexlabs.ai", company: "Vertex Labs", stage: "Qualified", source: "Meta", value: "$3.1k", updated: "3d ago" },
  { name: "Liam O'Connor", email: "liam@apex.io", company: "Apex Solutions", stage: "New", source: "Direct", value: "—", updated: "4d ago" },
];

const stageColor: Record<string, string> = {
  New: "text-muted-foreground bg-muted",
  Contacted: "text-warning bg-warning/10",
  Qualified: "text-brand-accent bg-brand-accent/10",
  "Closed-Won": "text-success bg-success/10",
};

function CrmPage() {
  const handleExport = () => {
    downloadCsv(`leadlogr-crm-${timestamp()}.csv`, toCsv(contacts));
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
            {contacts.map((c) => (
              <tr key={c.email} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.company}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${stageColor[c.stage]}`}>
                    {c.stage}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.source}</td>
                <td className="px-5 py-3.5 text-right font-mono">{c.value}</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{c.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
