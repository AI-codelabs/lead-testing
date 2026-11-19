import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { listConversionUploads } from "@/lib/integrations.functions";

export const Route = createFileRoute("/app/signals")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Signal log — Leadlogr" }] }),
  component: SignalsPage,
});

const networkLabel: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta",
  linkedin_ads: "LinkedIn",
};

const stageEvent: Record<string, string> = {
  new: "New lead",
  qualified: "Qualified lead",
  won: "Closed deal",
  lost: "Lost",
  disqualified: "Disqualified",
  contacted: "Contacted",
};

function statusPill(status: string) {
  if (status === "sent" || status === "succeeded") {
    return "bg-stage-green-soft text-stage-green-ink ring-stage-green-line";
  }
  if (status === "failed") {
    return "bg-stage-red-soft text-stage-red-ink ring-stage-red-line";
  }
  if (status === "skipped") {
    return "bg-muted text-muted-foreground ring-border";
  }
  return "bg-stage-amber-soft text-stage-amber-ink ring-stage-amber-line";
}

function statusLabel(status: string) {
  if (status === "sent" || status === "succeeded") return "Delivered";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function SignalsPage() {
  const { activeWorkspace } = useAccount();
  const organizationId = activeWorkspace.key;
  const listUploads = useServerFn(listConversionUploads);

  const { data, isLoading, error } = useQuery({
    queryKey: ["signal-log", organizationId],
    enabled: !!organizationId,
    refetchInterval: 15_000,
    queryFn: () => listUploads({ data: { organizationId, limit: 100 } }),
  });

  const uploads = data?.uploads ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Conversions"
        title="Signal log"
        description="Every conversion sent to an ad platform from this workspace."
      />

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Lead</th>
              <th className="px-5 py-3">Platform</th>
              <th className="px-5 py-3">Event</th>
              <th className="px-5 py-3 text-right">Value</th>
              <th className="px-5 py-3">Matched on</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  Loading signals…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-destructive">
                  {error instanceof Error ? error.message : "Could not load signals"}
                </td>
              </tr>
            )}
            {!isLoading && !error && uploads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  No signals yet. Move a lead to Qualified or Won to send the first conversion.
                </td>
              </tr>
            )}
            {uploads.map((u) => {
              const when = u.attempted_at || u.succeeded_at;
              const value =
                u.value != null && u.value !== ""
                  ? `${Number(u.value).toLocaleString("en-GB")} ${u.currency ?? ""}`.trim()
                  : "—";
              return (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground tabular-nums">
                    {when
                      ? new Date(when).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5 font-medium">{u.lead_name ?? "Lead"}</td>
                  <td className="px-5 py-3.5">{networkLabel[u.network] ?? u.network}</td>
                  <td className="px-5 py-3.5">{stageEvent[u.stage] ?? u.stage}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{value}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.click_id_type ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPill(u.status)}`}
                      title={u.error ?? undefined}
                    >
                      {statusLabel(u.status)}
                    </span>
                    {u.error ? (
                      <div className="text-[11px] text-destructive mt-1 max-w-[28ch] truncate">
                        {u.error}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
