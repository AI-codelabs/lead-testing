import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey } from "@/hooks/use-live-leads";
import {
  getGoogleAdsSettings,
  saveGoogleAdsSettings,
  listConversionUploads,
  disconnectGoogleAds,
  listGoogleAdsCustomers,
  listGoogleAdsConversionActions,
} from "@/lib/google-ads-settings.functions";
import { Check, AlertCircle, ExternalLink, Loader2, Plug, Unplug, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/integrations/google-ads")({
  head: () => ({ meta: [{ title: "Google Ads — Leadlogr" }] }),
  ssr: false,
  component: GoogleAdsPage,
});

type FormState = {
  enabled: boolean;
  customer_id: string;
  login_customer_id: string;
  default_currency: string;
  conversion_action_new: string;
  conversion_action_qualified: string;
  conversion_action_won: string;
  conversion_action_lost: string;
};

const STAGES: Array<{ key: keyof FormState; label: string; hint: string }> = [
  { key: "conversion_action_new", label: "New lead (Stage 1)", hint: "Fired the moment a Google-sourced form submit lands." },
  { key: "conversion_action_qualified", label: "Qualified", hint: "Fired when sales marks the lead as qualified." },
  { key: "conversion_action_won", label: "Won", hint: "Fired on Won. Sends won_value as conversionValue." },
  { key: "conversion_action_lost", label: "Lost / Disqualified", hint: "Fired on Lost. Useful as a negative signal for Smart Bidding." },
];

type Customer = { id: string; descriptiveName: string; currencyCode: string; timeZone: string; manager: boolean };
type Action = { id: string; name: string; category: string; status: string };

function GoogleAdsPage() {
  const { ownWorkspace } = useAccount();
  const workspaceKey = deriveWorkspaceKey(ownWorkspace.name);
  const load = useServerFn(getGoogleAdsSettings);
  const save = useServerFn(saveGoogleAdsSettings);
  const listUploads = useServerFn(listConversionUploads);
  const disconnect = useServerFn(disconnectGoogleAds);
  const listCustomers = useServerFn(listGoogleAdsCustomers);
  const listActions = useServerFn(listGoogleAdsConversionActions);

  const [form, setForm] = useState<FormState>({
    enabled: true,
    customer_id: "",
    login_customer_id: "",
    default_currency: "EUR",
    conversion_action_new: "",
    conversion_action_qualified: "",
    conversion_action_won: "",
    conversion_action_lost: "",
  });
  const [connection, setConnection] = useState<{ connected: boolean; email: string | null; connectedAt: string | null }>({
    connected: false,
    email: null,
    connectedAt: null,
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploads, setUploads] = useState<Array<{ id: string; stage: string; status: string; value: number | null; currency: string | null; click_id_type: string | null; error: string | null; attempted_at: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([
      load({ data: { workspaceKey } }),
      listUploads({ data: { workspaceKey, limit: 25 } }),
    ]);
    if (s.settings) {
      setForm({
        enabled: s.settings.enabled,
        customer_id: s.settings.customer_id ?? "",
        login_customer_id: s.settings.login_customer_id ?? "",
        default_currency: s.settings.default_currency ?? "EUR",
        conversion_action_new: s.settings.conversion_action_new ?? "",
        conversion_action_qualified: s.settings.conversion_action_qualified ?? "",
        conversion_action_won: s.settings.conversion_action_won ?? "",
        conversion_action_lost: s.settings.conversion_action_lost ?? "",
      });
      setConnection({ connected: s.settings.connected, email: s.settings.oauth_email, connectedAt: s.settings.connected_at });
    } else {
      setConnection({ connected: false, email: null, connectedAt: null });
    }
    setUploads(u.uploads as never);
  }, [workspaceKey, load, listUploads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await refresh(); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  // Listen for the popup's success/failure message.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== "leadlogr-google-ads-oauth") return;
      const p = d.payload;
      if (p?.ok) {
        setError(null);
        void refresh();
      } else {
        setError(p?.error || "Connection failed");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refresh]);

  // Auto-load customers when connected.
  useEffect(() => {
    if (!connection.connected) { setCustomers([]); return; }
    setLoadingCustomers(true);
    listCustomers({ data: { workspaceKey } })
      .then((r) => { setCustomers(r.customers as Customer[]); if (r.error) setError(r.error); })
      .finally(() => setLoadingCustomers(false));
  }, [connection.connected, workspaceKey, listCustomers]);

  // Auto-load conversion actions when a customer is picked.
  useEffect(() => {
    if (!connection.connected || !form.customer_id) { setActions([]); return; }
    setLoadingActions(true);
    listActions({ data: { workspaceKey, customerId: form.customer_id, loginCustomerId: form.login_customer_id || undefined } })
      .then((r) => { setActions(r.actions as Action[]); if (r.error) setError(r.error); })
      .finally(() => setLoadingActions(false));
  }, [connection.connected, workspaceKey, form.customer_id, form.login_customer_id, listActions]);

  const onConnect = () => {
    setError(null);
    // Remember where to return after the OAuth round-trip in case the popup
    // is blocked (preview iframe) and we fall back to a top-level redirect.
    try { sessionStorage.setItem("leadlogr.googleads.returnTo", window.location.pathname); } catch { /* ignore */ }
    const url = `/api/public/oauth/google-ads/start?workspace_key=${encodeURIComponent(workspaceKey)}`;
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, "leadlogr-google-ads", `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      // Popup blocked (common inside sandboxed preview iframes) — full-redirect the top window.
      try { window.top!.location.href = url; } catch { window.location.href = url; }
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect Google Ads? Conversion uploads will stop until you reconnect.")) return;
    await disconnect({ data: { workspaceKey } });
    await refresh();
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ data: { workspace_key: workspaceKey, ...form } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Integrations › Outbound"
        title="Google Ads conversions"
        description="Send conversions back to Google Ads when leads progress through the pipeline. Only leads with a gclid/wbraid/gbraid (i.e. came from a Google Ads click) are sent."
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Connection */}
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h2 className="text-base font-semibold">Connection</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sign in once with the Google account that has access to your Ads accounts. Leadlogr stores a refresh token per workspace.
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

            {connection.connected ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="text-muted-foreground">
                  Connected as <span className="font-medium text-foreground">{connection.email || "—"}</span>
                  {connection.connectedAt ? <> · {new Date(connection.connectedAt).toLocaleDateString()}</> : null}
                </div>
                <button
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted/40"
                >
                  <Unplug className="size-3.5" /> Disconnect
                </button>
                <button
                  onClick={onConnect}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted/40"
                >
                  <RefreshCw className="size-3.5" /> Re-authenticate
                </button>
              </div>
            ) : (
              <button
                onClick={onConnect}
                className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                <Plug className="size-4" /> Connect Google Ads
              </button>
            )}

            {error ? (
              <div className="mt-3 text-xs text-stage-red-ink flex items-center gap-1.5">
                <AlertCircle className="size-3.5" /> {error}
              </div>
            ) : null}
          </section>

          {/* Account selection */}
          <section className={`rounded-lg ring-1 ring-border bg-card p-5 ${connection.connected ? "" : "opacity-60 pointer-events-none"}`}>
            <header className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Account</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Which Google Ads account conversions go to.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Sending {form.enabled ? "on" : "off"}
              </label>
            </header>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Customer account" hint={loadingCustomers ? "Loading accounts you can access…" : `${customers.length} account${customers.length === 1 ? "" : "s"} available.`}>
                <select
                  value={form.customer_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const c = customers.find((c) => c.id === id);
                    setForm((f) => ({
                      ...f,
                      customer_id: id,
                      default_currency: c?.currencyCode || f.default_currency,
                    }));
                  }}
                  className="w-full text-sm px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Pick an account —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.descriptiveName || "(unnamed)"} · {c.id}{c.manager ? " · manager" : ""}{c.currencyCode ? ` · ${c.currencyCode}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Login customer ID (MCC)" hint="Optional. Use the manager ID when this account is accessed through an MCC.">
                <input
                  value={form.login_customer_id}
                  onChange={(e) => setForm((f) => ({ ...f, login_customer_id: e.target.value.replace(/\D/g, "") }))}
                  placeholder="optional"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Default currency" hint="Used for Won deal values when no per-lead currency is set.">
                <input
                  value={form.default_currency}
                  onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value.toUpperCase().slice(0, 3) }))}
                  placeholder="EUR"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
            </div>
          </section>

          {/* Conversion actions */}
          <section className={`rounded-lg ring-1 ring-border bg-card p-5 ${connection.connected && form.customer_id ? "" : "opacity-60 pointer-events-none"}`}>
            <header className="mb-4">
              <h2 className="text-base font-semibold">Conversion actions per stage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loadingActions ? "Loading conversion actions…" : `Pick which conversion action to fire at each stage. ${actions.length} available on this account.`}
              </p>
            </header>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <Field key={s.key} label={s.label} hint={s.hint}>
                  <select
                    value={form[s.key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Skip this stage —</option>
                    {actions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.category}{a.status !== "ENABLED" ? ` · ${a.status}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={onSave}
                disabled={saving || loading || !form.customer_id}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
                {saved ? "Saved" : "Save settings"}
              </button>
              <a
                href="https://ads.google.com/aw/conversions"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                Manage in Google Ads <ExternalLink className="size-3" />
              </a>
            </div>
          </section>

          {/* Uploads log */}
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="mb-3">
              <h2 className="text-base font-semibold">Recent uploads</h2>
              <p className="text-xs text-muted-foreground mt-0.5">The last 25 conversion uploads to Google Ads.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium">Click ID</th>
                    <th className="py-2 pr-4 font-medium">Value</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No uploads yet.</td></tr>
                  ) : uploads.map((u) => (
                    <tr key={u.id} className="border-t border-border/60">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(u.attempted_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{u.stage}</td>
                      <td className="py-2 pr-4 font-mono">{u.click_id_type ?? "—"}</td>
                      <td className="py-2 pr-4">{u.value != null ? `${u.value} ${u.currency ?? ""}` : "—"}</td>
                      <td className="py-2 pr-4">
                        {u.status === "success" ? (
                          <span className="inline-flex items-center gap-1 text-stage-green-ink"><Check className="size-3" /> sent</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-stage-red-ink"><AlertCircle className="size-3" /> {u.error ?? u.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-4 text-sm">
          <div className="rounded-lg ring-1 ring-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-2">How it works</h3>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
              <li>Click <strong>Connect Google Ads</strong> and sign in with the Google account that manages your Ads accounts.</li>
              <li>Pick the Ads account that should receive conversions.</li>
              <li>Pick a conversion action per pipeline stage (New / Qualified / Won / Lost).</li>
              <li>As leads move through stages, Leadlogr uploads to Google's <code>uploadClickConversions</code> with the matching gclid/wbraid/gbraid.</li>
              <li>If consent was granted, hashed email & phone are sent as Enhanced Conversions for Leads.</li>
            </ol>
          </div>
          <div className="rounded-lg ring-1 ring-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Why only Google?</h3>
            <p className="text-xs text-muted-foreground">
              We only forward leads to the network they came from. A lead with <code>fbclid</code> goes to Meta;
              a lead with <code>gclid</code> goes to Google. Direct/organic leads stay internal.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold mb-1">{label}</div>
      {children}
      <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
    </label>
  );
}
