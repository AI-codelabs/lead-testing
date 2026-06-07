import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey } from "@/hooks/use-live-leads";
import {
  getMetaAdsSettings,
  saveMetaAdsSettings,
  disconnectMetaAds,
  testMetaAdsConnection,
} from "@/lib/meta-ads-settings.functions";
import { listConversionUploads } from "@/lib/google-ads-settings.functions";
import { AlertCircle, Check, ExternalLink, Loader2, Plug, Unplug, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/integrations/meta-ads")({
  head: () => ({ meta: [{ title: "Meta Ads — Leadlogr" }] }),
  ssr: false,
  component: MetaAdsPage,
});

type FormState = {
  enabled: boolean;
  pixel_id: string;
  access_token: string; // empty = leave existing, value = replace
  test_event_code: string;
  default_currency: string;
  event_name_new: string;
  event_name_qualified: string;
  event_name_won: string;
  event_name_lost: string;
};

const STAGES: Array<{ key: keyof FormState; label: string; hint: string; placeholder: string }> = [
  { key: "event_name_new", label: "New lead", hint: "Fires the moment a form submit lands. Standard: 'Lead'.", placeholder: "Lead" },
  { key: "event_name_qualified", label: "Qualified", hint: "Custom event when sales marks the lead qualified.", placeholder: "QualifiedLead" },
  { key: "event_name_won", label: "Won", hint: "Sends won_value as 'value'. Standard: 'Purchase'.", placeholder: "Purchase" },
  { key: "event_name_lost", label: "Lost / Disqualified", hint: "Optional negative signal. Leave blank to skip.", placeholder: "" },
];

function MetaAdsPage() {
  const { ownWorkspace } = useAccount();
  const workspaceKey = deriveWorkspaceKey(ownWorkspace.name);
  const load = useServerFn(getMetaAdsSettings);
  const save = useServerFn(saveMetaAdsSettings);
  const disconnect = useServerFn(disconnectMetaAds);
  const test = useServerFn(testMetaAdsConnection);
  const listUploads = useServerFn(listConversionUploads);

  const [form, setForm] = useState<FormState>({
    enabled: true,
    pixel_id: "",
    access_token: "",
    test_event_code: "",
    default_currency: "EUR",
    event_name_new: "Lead",
    event_name_qualified: "QualifiedLead",
    event_name_won: "Purchase",
    event_name_lost: "",
  });
  const [connection, setConnection] = useState<{ connected: boolean; connectedAt: string | null }>({ connected: false, connectedAt: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [uploads, setUploads] = useState<Array<{ id: string; stage: string; status: string; value: number | null; currency: string | null; error: string | null; attempted_at: string }>>([]);

  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([
      load({ data: { workspaceKey } }),
      listUploads({ data: { workspaceKey, limit: 25 } }),
    ]);
    if (s.settings) {
      setForm((f) => ({
        ...f,
        enabled: s.settings!.enabled,
        pixel_id: s.settings!.pixel_id ?? "",
        access_token: "",
        test_event_code: s.settings!.test_event_code ?? "",
        default_currency: s.settings!.default_currency ?? "EUR",
        event_name_new: s.settings!.event_name_new ?? "",
        event_name_qualified: s.settings!.event_name_qualified ?? "",
        event_name_won: s.settings!.event_name_won ?? "",
        event_name_lost: s.settings!.event_name_lost ?? "",
      }));
      setConnection({ connected: s.settings.connected, connectedAt: s.settings.connected_at });
    } else {
      setConnection({ connected: false, connectedAt: null });
    }
    setUploads((u.uploads as never[]).filter((r: any) => r.network === "meta_ads") as never);
  }, [workspaceKey, load, listUploads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await refresh(); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await save({
        data: {
          workspace_key: workspaceKey,
          enabled: form.enabled,
          pixel_id: form.pixel_id,
          // empty string = leave existing token untouched
          access_token: form.access_token.trim().length > 0 ? form.access_token.trim() : undefined,
          test_event_code: form.test_event_code,
          default_currency: form.default_currency,
          event_name_new: form.event_name_new,
          event_name_qualified: form.event_name_qualified,
          event_name_won: form.event_name_won,
          event_name_lost: form.event_name_lost,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect Meta Ads? Conversion uploads will stop until you reconnect.")) return;
    await disconnect({ data: { workspaceKey } });
    await refresh();
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await test({ data: { workspaceKey } });
      setTestResult(r);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Integrations › Outbound"
        title="Meta Ads conversions"
        description="Send conversions back to Meta (Facebook & Instagram) via the Conversions API. Events are matched to ad clicks using fbclid/fbp when present, and sent server-side with hashed email & phone (when consent is given)."
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Connection */}
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-base font-semibold">Connection</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Paste your Meta Pixel ID and a long-lived System User access token from Meta Business Settings.
                </p>
              </div>
              {connection.connected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stage-green-ink bg-stage-green/20 px-2 py-1 rounded-full">
                  <Check className="size-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/40 px-2 py-1 rounded-full">
                  Not connected
                </span>
              )}
            </header>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Pixel ID" hint="Found in Events Manager → Data Sources → your pixel.">
                <input
                  value={form.pixel_id}
                  onChange={(e) => setForm((f) => ({ ...f, pixel_id: e.target.value.replace(/\D/g, "") }))}
                  placeholder="e.g. 1234567890123456"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Access token" hint={connection.connected ? "A token is saved. Paste a new one to replace it." : "System User token with ads_management on the pixel."}>
                <input
                  type="password"
                  value={form.access_token}
                  onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                  placeholder={connection.connected ? "•••••••• (saved)" : "EAAG..."}
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Test event code (optional)" hint="Set during testing to see events in Events Manager → Test Events.">
                <input
                  value={form.test_event_code}
                  onChange={(e) => setForm((f) => ({ ...f, test_event_code: e.target.value }))}
                  placeholder="TEST12345"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Default currency" hint="Used on 'Purchase' events for Won deals.">
                <input
                  value={form.default_currency}
                  onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value.toUpperCase().slice(0, 3) }))}
                  placeholder="EUR"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Sending {form.enabled ? "on" : "off"}
              </label>
              {connection.connected ? (
                <>
                  <button onClick={onTest} disabled={testing} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted/40">
                    {testing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Send test event
                  </button>
                  <button onClick={onDisconnect} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted/40">
                    <Unplug className="size-3.5" /> Disconnect
                  </button>
                </>
              ) : null}
            </div>

            {testResult ? (
              <div className={`mt-3 text-xs flex items-center gap-1.5 ${testResult.ok ? "text-stage-green-ink" : "text-stage-red-ink"}`}>
                {testResult.ok ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                {testResult.ok ? "Meta accepted the test event." : `Failed: ${testResult.error || "unknown error"}`}
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 text-xs text-stage-red-ink flex items-center gap-1.5">
                <AlertCircle className="size-3.5" /> {error}
              </div>
            ) : null}
          </section>

          {/* Event mapping */}
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="mb-4">
              <h2 className="text-base font-semibold">Events per stage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Map each pipeline stage to a Meta event name. Standard events (Lead, Purchase, CompleteRegistration, etc.) optimize better than custom names.
              </p>
            </header>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <Field key={s.key} label={s.label} hint={s.hint}>
                  <input
                    value={form[s.key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                    placeholder={s.placeholder || "— skip —"}
                    className="w-full text-sm px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={saving || loading}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : <Plug className="size-3.5" />}
                {saved ? "Saved" : connection.connected ? "Save settings" : "Connect Meta"}
              </button>
              <a
                href="https://business.facebook.com/events_manager2"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                Open Meta Events Manager <ExternalLink className="size-3" />
              </a>
            </div>
          </section>

          {/* Recent uploads */}
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="mb-3">
              <h2 className="text-base font-semibold">Recent events</h2>
              <p className="text-xs text-muted-foreground mt-0.5">The last 25 Meta CAPI events sent for this workspace.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Value</th>
                    <th className="py-2 pr-4 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.length === 0 ? (
                    <tr><td colSpan={5} className="py-3 text-muted-foreground">No events yet.</td></tr>
                  ) : uploads.map((u) => (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="py-2 pr-4">{new Date(u.attempted_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{u.stage}</td>
                      <td className={`py-2 pr-4 font-medium ${u.status === "success" ? "text-stage-green-ink" : "text-stage-red-ink"}`}>{u.status}</td>
                      <td className="py-2 pr-4">{u.value != null ? `${u.value} ${u.currency ?? ""}` : "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{u.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-lg ring-1 ring-border bg-card p-5 text-sm">
            <h3 className="font-semibold mb-2">How to get a token</h3>
            <ol className="list-decimal pl-4 space-y-1.5 text-muted-foreground">
              <li>Open <a className="text-primary hover:underline" target="_blank" rel="noopener" href="https://business.facebook.com/settings/system-users">Business Settings → System Users</a>.</li>
              <li>Create a System User and assign it to the pixel asset with <span className="font-medium">Full control</span>.</li>
              <li>Click <span className="font-medium">Generate New Token</span>. Pick the app, then select scopes <code className="text-xs">ads_management</code> and <code className="text-xs">business_management</code>.</li>
              <li>Set expiration to <span className="font-medium">Never</span>. Copy the token and paste it above.</li>
            </ol>
          </div>
          <div className="rounded-lg ring-1 ring-border bg-card p-5 text-sm">
            <h3 className="font-semibold mb-2">Matching quality</h3>
            <p className="text-muted-foreground">
              We hash email and phone (SHA-256) before sending — only when the lead has consent=accepted. <span className="font-medium">fbp</span> and <span className="font-medium">fbclid</span> are sent server-side for click attribution.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span> : null}
    </label>
  );
}
