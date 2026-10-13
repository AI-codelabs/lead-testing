import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import {
  connectCrm,
  disconnectCrm,
  listCrmConnections,
  listCrmEvents,
  saveCrmStageMap,
} from "@/lib/crm-sync.functions";
import {
  CRM_PROVIDER_NAMES,
  MAPPABLE_STAGES,
  isCrmProvider,
  type CrmProvider,
} from "@/lib/crm-sync.server";

export const Route = createFileRoute("/app/integrations/crm/$provider")({
  staticData: { width: "narrow" },
  component: CrmSetupPage,
});

/**
 * Where to find the webhook setting in each tool.
 *
 * Worth carrying in the product rather than in a help article: this is the one
 * step the customer does outside Leadlogr, and it is the step they get stuck
 * on. Each tool calls it something different.
 */
const WHERE: Record<CrmProvider, { path: string; sends: string }> = {
  pipedrive: {
    path: "Settings › Tools and apps › Webhooks › Create new webhook, on the deal.updated event",
    sends: "Pipedrive sends the stage as a numeric stage id, so map the numbers.",
  },
  zoho: {
    path: "Setup › Automation › Actions › Webhooks, called from a workflow rule on Deals",
    sends: "Include the Stage and Email fields in the webhook's parameter list.",
  },
  odoo: {
    path: "Settings › Technical › Automation › Automated Actions, with a webhook action on crm.lead",
    sends: "Send the record as JSON; stage_id and email_from are what we read.",
  },
  monday: {
    path: "Board › Integrations › Webhooks › When a column changes, send a webhook",
    sends: "Monday verifies the URL first — that handshake is handled automatically.",
  },
  clickup: {
    path: "Space or List settings › Integrations › Webhooks, on taskStatusUpdated",
    sends: "Map your ClickUp status names, e.g. 'closed' to won.",
  },
  teamleader: {
    path: "Marketplace › Webhooks, subscribing to deal.phaseChanged",
    sends: "Map your Teamleader phase names, e.g. 'Won' to won.",
  },
};

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-3 py-2 text-xs ring-1 ring-border">
        {value}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => toast.error("Could not copy"),
          );
        }}
        className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-card ring-1 ring-border hover:bg-muted transition-colors flex items-center gap-1.5"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function CrmSetupPage() {
  const { provider: raw } = useParams({ from: "/app/integrations/crm/$provider" });
  const provider = isCrmProvider(raw) ? raw : null;
  const { activeWorkspace } = useAccount();
  const organizationId = activeWorkspace.key;

  const list = useServerFn(listCrmConnections);
  const connect = useServerFn(connectCrm);
  const saveMap = useServerFn(saveCrmStageMap);
  const remove = useServerFn(disconnectCrm);
  const events = useServerFn(listCrmEvents);
  const qc = useQueryClient();

  const { data: connections } = useQuery({
    queryKey: ["crm-connections", organizationId],
    queryFn: () => list({ data: { organizationId } }),
    enabled: !!organizationId,
  });
  const { data: recent } = useQuery({
    queryKey: ["crm-events", organizationId, provider],
    queryFn: () => events({ data: { organizationId, provider: provider ?? undefined } }),
    enabled: !!organizationId && !!provider,
    refetchInterval: 15_000,
  });

  const connection = connections?.find((c) => c.provider === provider) ?? null;

  // Rows rather than an object so a half-typed mapping does not collapse: an
  // empty "their stage" is a row being filled in, not a key to be dropped.
  const [rows, setRows] = useState<Array<{ their: string; ours: string }>>([]);
  useEffect(() => {
    if (!connection) return;
    const entries = Object.entries(connection.stageMap);
    setRows(
      entries.length
        ? entries.map(([their, ours]) => ({ their, ours }))
        : [{ their: "", ours: "won" }],
    );
  }, [connection]);

  if (!provider) {
    return (
      <div className="text-sm text-muted-foreground">
        Unknown integration.{" "}
        <Link to="/app/integrations" className="text-primary hover:underline">
          Back to integrations
        </Link>
      </div>
    );
  }

  const name = CRM_PROVIDER_NAMES[provider];
  const where = WHERE[provider];

  const doConnect = async () => {
    try {
      await connect({ data: { organizationId, provider } });
      await qc.invalidateQueries({ queryKey: ["crm-connections", organizationId] });
      toast.success(`${name} connected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect");
    }
  };

  const doSave = async () => {
    const stageMap: Record<string, string> = {};
    for (const r of rows) if (r.their.trim()) stageMap[r.their.trim()] = r.ours;
    try {
      await saveMap({ data: { organizationId, provider, stageMap } });
      await qc.invalidateQueries({ queryKey: ["crm-connections", organizationId] });
      toast.success("Stage mapping saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const doDisconnect = async () => {
    try {
      await remove({ data: { organizationId, provider } });
      await qc.invalidateQueries({ queryKey: ["crm-connections", organizationId] });
      toast.success(`${name} disconnected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Integrations › CRM"
        title={`${name} setup`}
        description={`When a deal moves in ${name}, the matching lead moves here — and the outcome is reported to your ad platforms. No app to install: ${name} posts to a URL.`}
      />

      {!connection ? (
        <div className="rounded-xl bg-card ring-1 ring-border p-6">
          <h2 className="text-base font-semibold">Connect {name}</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">
            This creates a webhook URL for this workspace. You paste it into {name}; nothing is
            installed and no permissions are granted to us.
          </p>
          <button
            onClick={doConnect}
            disabled={!organizationId}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Connect {name}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl bg-card ring-1 ring-border p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">1. Paste this into {name}</h2>
                <p className="text-sm text-muted-foreground mt-1.5">{where.path}</p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-stage-green-ink bg-stage-green-soft ring-1 ring-stage-green-line px-2 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-stage-green-ink" /> Connected
              </span>
            </div>
            <div className="mt-4">
              <CopyRow value={connection.webhookUrl} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Treat it as a password — anyone holding it can move stages in this workspace.{" "}
              {where.sends}
            </p>
          </div>

          <div className="rounded-xl bg-card ring-1 ring-border p-6">
            <h2 className="text-base font-semibold">2. Map their stages to yours</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-prose">
              Left is what {name} sends, right is what it means here. Anything unmapped is recorded
              and ignored rather than guessed at — only the stage you map to{" "}
              <span className="font-medium text-foreground">won</span> reports revenue.
            </p>
            <div className="mt-4 space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={r.their}
                    onChange={(e) =>
                      setRows((p) =>
                        p.map((x, j) => (j === i ? { ...x, their: e.target.value } : x)),
                      )
                    }
                    placeholder={`Stage name or id in ${name}`}
                    className="flex-1 min-w-0 bg-background ring-1 ring-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-muted-foreground text-sm">→</span>
                  <select
                    value={r.ours}
                    onChange={(e) =>
                      setRows((p) =>
                        p.map((x, j) => (j === i ? { ...x, ours: e.target.value } : x)),
                      )
                    }
                    className="bg-background ring-1 ring-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {MAPPABLE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                    className="shrink-0 p-2 rounded-md ring-1 ring-border hover:bg-muted transition-colors"
                    aria-label="Remove mapping"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => setRows((p) => [...p, { their: "", ours: "qualified" }])}
                className="text-sm font-medium px-3 py-2 rounded-md bg-card ring-1 ring-border hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <Plus className="size-3.5" />
                Add mapping
              </button>
              <button
                onClick={doSave}
                className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground ring-1 ring-primary hover:opacity-90 transition-opacity"
              >
                Save mapping
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-card ring-1 ring-border p-6">
            <h2 className="text-base font-semibold">3. Recent deliveries</h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Everything {name} has sent, whether or not it changed anything. A webhook that fires
              and does nothing is otherwise invisible.
            </p>
            <div className="mt-4">
              {!recent || recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing received yet. Move a deal in {name} to test it.
                </p>
              ) : (
                <div className="divide-y divide-border text-sm">
                  {recent.map((e) => (
                    <div key={e.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate">
                          {e.email ?? (
                            <span className="text-muted-foreground">no email in payload</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.externalStage ? `"${e.externalStage}"` : "no stage"}
                          {e.mappedStage ? ` → ${e.mappedStage}` : ""}
                          {e.error ? ` · ${e.error}` : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full ring-1 ${
                          e.matched
                            ? "bg-stage-green-soft text-stage-green-ink ring-stage-green-line"
                            : "bg-stage-amber-soft text-stage-amber-ink ring-stage-amber-line"
                        }`}
                      >
                        {e.matched ? "Applied" : "Ignored"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={doDisconnect}
            className="text-sm font-medium text-destructive hover:underline"
          >
            Disconnect {name}
          </button>
        </div>
      )}
    </>
  );
}
