import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { COMPANY } from "@/lib/legal";

export const Route = createFileRoute("/agency/white-label")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "White label — Leadlogr Agency" }] }),
  ssr: false,
  component: WhiteLabelPage,
});

function WhiteLabelPage() {
  const { ownWorkspace, clientWorkspaces } = useAccount();
  const [name, setName] = useState(ownWorkspace.name || COMPANY.legalName);
  const [domain, setDomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const totalLeads = clientWorkspaces.reduce((sum, c) => sum + c.leadsCount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Partner program"
        title="White label"
        description="Preview how client reports and the client login could show your brand. Saving and custom domains ship with billing."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5 space-y-4">
          <div>
            <label className="text-xs font-medium" htmlFor="wl-name">
              Agency name on reports
            </label>
            <input
              id="wl-name"
              className="mt-1.5 w-full rounded-md bg-background px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="wl-domain">
              Report domain
            </label>
            <input
              id="wl-domain"
              placeholder="reports.youragency.com"
              className="mt-1.5 w-full rounded-md bg-background px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Custom domains need DNS verification once white label is enabled on your plan.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="wl-logo">
              Logo URL
            </label>
            <input
              id="wl-logo"
              placeholder="https://…"
              className="mt-1.5 w-full rounded-md bg-background px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              toast.message(
                "White-label settings will save here once billing and brand hosting are connected.",
              )
            }
            className="text-sm font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save (coming with billing)
          </button>
        </div>

        <div className="rounded-xl bg-[#293542] text-white p-6 shadow-xs">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="size-8 rounded-md object-cover bg-white/10" />
            ) : (
              <div className="size-8 rounded-md bg-white/10 grid place-items-center text-xs font-bold">
                {(name || "A").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold opacity-70">
                {name || "Agency"} · Monthly report
              </div>
              <div className="text-[11px] opacity-50">
                {domain || "reports.leadlogr.com"} · preview
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/5 p-4">
              <div className="text-[11px] opacity-60">Leads (all clients)</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{totalLeads}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <div className="text-[11px] opacity-60">Clients</div>
              <div className="text-2xl font-bold tabular-nums mt-1">
                {clientWorkspaces.length}
              </div>
            </div>
          </div>
          <p className="text-xs opacity-50 mt-6">
            This is a local preview only. Clients still see Leadlogr until white label is enabled.
          </p>
        </div>
      </div>
    </>
  );
}
