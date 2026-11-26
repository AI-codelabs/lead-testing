import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import {
  selectableAccounts,
  groupByManager,
  accountLabel,
  humanError,
  shouldLoadAccounts,
} from "@/lib/google-ads-accounts";
import {
  getGoogleAdsSettings,
  saveGoogleAdsSettings,
  listConversionUploads,
  disconnectGoogleAds,
  listGoogleAdsCustomers,
  listGoogleAdsConversionActions,
  ensureGoogleAdsConversionActions,
  startGoogleAdsOAuth,
  getGoogleAdsReadiness,
  testGoogleAdsConnection,
} from "@/lib/integrations.functions";
import { Check, AlertCircle, ExternalLink, Loader2, Plug, Unplug, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/integrations/google-ads")({
  staticData: { width: "narrow" },
  head: () => ({ meta: [{ title: "Google Ads — Leadlogr" }] }),
  ssr: false,
  component: GoogleAdsPage,
});

type FormState = {
  enabled: boolean;
  customer_id: string;
  login_customer_id: string;
  default_currency: string;
  account_timezone: string;
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

type Customer = {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
  level: number;
  loginCustomerId: string;
  via: string;
};
type Action = { id: string; name: string; category: string; status: string };

function GoogleAdsPage() {
  const { activeWorkspace } = useAccount();
  const organizationId = activeWorkspace.key;
  const load = useServerFn(getGoogleAdsSettings);
  const save = useServerFn(saveGoogleAdsSettings);
  const listUploads = useServerFn(listConversionUploads);
  const disconnect = useServerFn(disconnectGoogleAds);
  const listCustomers = useServerFn(listGoogleAdsCustomers);
  const listActions = useServerFn(listGoogleAdsConversionActions);
  const ensureActions = useServerFn(ensureGoogleAdsConversionActions);
  const startOAuth = useServerFn(startGoogleAdsOAuth);
  const readinessFn = useServerFn(getGoogleAdsReadiness);
  const testFn = useServerFn(testGoogleAdsConnection);
  const [creatingActions, setCreatingActions] = useState(false);
  const [readiness, setReadiness] = useState<{
    connected: boolean; accountSelected: boolean; stagesMapped: number; stagesTotal: number;
    ready: boolean; enabled: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    enabled: true,
    customer_id: "",
    login_customer_id: "",
    default_currency: "EUR",
    account_timezone: "",
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
  /** Actions on the account that exist but cannot receive uploaded conversions. */
  const [unusableActions, setUnusableActions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploads, setUploads] = useState<Array<{ id: string; stage: string; status: string; value: number | null; currency: string | null; click_id_type: string | null; error: string | null; attempted_at: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  /**
   * Reading the hierarchy costs one API operation per manager account, and
   * Google counts those against Leadlogr's Cloud project rather than against
   * the workspace spending them — Explorer allows 2,880 a day across every
   * customer we have. A configured workspace re-reading the whole list on each
   * visit would spend that allowance on an answer nobody asked for, so the
   * walk runs while an account is still being chosen, and on request after.
   */
  const [accountsRequested, setAccountsRequested] = useState(false);

  const refresh = useCallback(async () => {
    const [s, u] = await Promise.all([
      load({ data: { organizationId } }),
      listUploads({ data: { organizationId, limit: 25 } }),
    ]);
    if (s.settings) {
      setForm({
        enabled: s.settings.enabled,
        customer_id: s.settings.customer_id ?? "",
        login_customer_id: s.settings.login_customer_id ?? "",
        default_currency: s.settings.default_currency ?? "EUR",
        account_timezone: s.settings.account_timezone ?? "",
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
    try {
      setReadiness(await readinessFn({ data: { organizationId } }));
    } catch {
      setReadiness(null);
    }
  }, [organizationId, load, listUploads, readinessFn]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testFn({ data: { organizationId } }));
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "The test could not run." });
    } finally {
      setTesting(false);
    }
  };

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
        setError(humanError(p?.error) || "Connection failed");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refresh]);

  // Handle full-redirect OAuth return (?ga_connected=1|0&error=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("ga_connected")) return;
    const ok = params.get("ga_connected") === "1";
    if (ok) {
      setError(null);
      void refresh();
    } else {
      setError(humanError(params.get("error")) || "Connection failed");
    }
    // Clean the URL.
    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);
  }, [refresh]);

  const loadAccounts = shouldLoadAccounts({
    connected: connection.connected,
    settingsLoaded: !loading,
    hasSavedAccount: !!form.customer_id,
    requested: accountsRequested,
  });

  useEffect(() => {
    if (!connection.connected) { setCustomers([]); return; }
    if (!loadAccounts) return;
    setLoadingCustomers(true);
    listCustomers({ data: { organizationId } })
      .then((r) => {
        setCustomers(r.customers as Customer[]);
        setCustomersError(r.error ? humanError(r.error) : null);
        if (r.error) setError(humanError(r.error));
        // Backfill timezone for an already-saved account so the next Save
        // persists it without forcing the user to re-pick.
        setForm((f) => {
          if (!f.customer_id || f.account_timezone) return f;
          const c = (r.customers as Customer[]).find((x) => x.id === f.customer_id);
          return c?.timeZone ? { ...f, account_timezone: c.timeZone } : f;
        });
      })
      .finally(() => setLoadingCustomers(false));
  }, [connection.connected, loadAccounts, organizationId, listCustomers]);

  const selectableCustomers = useMemo(() => selectableAccounts(customers), [customers]);
  const customerGroups = useMemo(() => groupByManager(selectableCustomers), [selectableCustomers]);

  // Auto-load conversion actions when a customer is picked.
  useEffect(() => {
    if (!connection.connected || !form.customer_id) { setActions([]); return; }
    setLoadingActions(true);
    listActions({ data: { organizationId, customerId: form.customer_id, loginCustomerId: form.login_customer_id || undefined } })
      .then((r) => {
        setActions(r.actions as Action[]);
        setUnusableActions(r.unusableCount ?? 0);
        if (r.error) setError(humanError(r.error));
      })
      .finally(() => setLoadingActions(false));
  }, [connection.connected, organizationId, form.customer_id, form.login_customer_id, listActions]);

  /**
   * Starts the Google consent round-trip.
   *
   * Asks the server for the URL rather than building one here. The page used to
   * open /api/public/oauth/google-ads/start?workspace_key=… directly — a route
   * that was removed with the Supabase backend precisely because it took the
   * workspace from the query string, so anyone could bind their own Google
   * account to someone else's workspace. Nothing replaced the call, so the
   * button has been opening a 404 ever since.
   */
  const onConnect = async () => {
    setError(null);
    try { sessionStorage.setItem("leadlogr.googleads.returnTo", window.location.pathname); } catch { /* ignore */ }

    // Opened before the await: a popup opened after one is no longer tied to
    // the click that asked for it, and browsers block it.
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open("about:blank", "leadlogr-google-ads", `width=${w},height=${h},left=${left},top=${top}`);

    try {
      const { url } = await startOAuth({
        data: { organizationId, redirectOrigin: window.location.origin },
      });
      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        // Popup blocked — fall back to a top-window redirect.
        try { window.top!.location.href = url; } catch { window.location.href = url; }
      }
    } catch (e) {
      popup?.close();
      setError(e instanceof Error ? e.message : "Could not start the Google connection");
    }
  };

  const onDisconnect = async () => {
    if (!confirm("Disconnect Google Ads? Conversion uploads will stop until you reconnect.")) return;
    const r = await disconnect({ data: { organizationId } });
    // Set when the same Google account still backs another Leadlogr connection,
    // so the grant was kept at Google.
    if (r?.note) toast.message(r.note);
    await refresh();
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ data: { organizationId, ...form } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const onCreateLeadlogrActions = async () => {
    if (!form.customer_id) return;
    setCreatingActions(true);
    setError(null);
    try {
      const r = await ensureActions({
        data: {
          organizationId,
          customerId: form.customer_id,
          loginCustomerId: form.login_customer_id || undefined,
        },
      });
      if (r.error) {
        setError(humanError(r.error) || r.error);
        toast.error(humanError(r.error) || r.error);
        return;
      }
      setActions(r.actions as Action[]);
      setUnusableActions(0);
      setForm((f) => ({
        ...f,
        conversion_action_new: r.mapping.new || f.conversion_action_new,
        conversion_action_qualified: r.mapping.qualified || f.conversion_action_qualified,
        conversion_action_won: r.mapping.won || f.conversion_action_won,
        conversion_action_lost: r.mapping.lost || f.conversion_action_lost,
      }));
      if (r.created.length > 0) {
        toast.success(
          `Created ${r.created.length} conversion action${r.created.length === 1 ? "" : "s"} in Google Ads. Review the mapping and save.`,
        );
      } else {
        toast.message("Leadlogr conversion actions were already on this account. Mapping filled in — save to keep it.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create conversion actions";
      setError(msg);
      toast.error(msg);
    } finally {
      setCreatingActions(false);
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

            {/* Every unfinished step used to produce the same outcome - nothing -
                with no way to tell which one was missing. Each row is something
                the customer can act on; our own Google onboarding is not one of
                them and is not shown. */}
            {readiness && !readiness.ready && (
              <ol className="mb-4 space-y-2 text-sm">
                <ReadyStep done={readiness.connected} label="Connect your Google account" />
                <ReadyStep
                  done={readiness.accountSelected}
                  label="Pick the Google Ads account conversions go to"
                />
                <ReadyStep
                  done={readiness.stagesMapped > 0}
                  label={
                    readiness.stagesMapped > 0
                      ? `Conversion actions chosen (${readiness.stagesMapped} of ${readiness.stagesTotal} stages)`
                      : "Choose a conversion action for at least one stage"
                  }
                />
              </ol>
            )}

            {readiness?.ready && !readiness.enabled && (
              <p className="mb-4 text-sm text-muted-foreground">
                Everything is set up. Switch <span className="font-medium text-foreground">Sending on</span> below
                to start reporting conversions.
              </p>
            )}

            {testResult && (
              <p
                className={`mb-4 text-sm ${testResult.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
              >
                {testResult.message}
              </p>
            )}

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
                <button
                  onClick={runTest}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md ring-1 ring-border hover:bg-muted/40 disabled:opacity-50"
                >
                  {testing ? "Testing…" : "Send a test conversion"}
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

            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Connecting gives Leadlogr access only to report conversions and show account spend for
              this workspace. We do not manage campaigns or sell Google data. Full detail:{" "}
              <a
                href="/privacy#google"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Privacy Policy — Google data
              </a>
              .
            </p>

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
              <Field
                label="Customer account"
                hint={
                  loadingCustomers
                    ? "Reading your account hierarchy…"
                    : !loadAccounts
                      ? "Saved. Load the list to pick a different account."
                      : customersError
                        ? customersError
                        : selectableCustomers.length === 0
                          ? "No client accounts found on this login."
                          : `${selectableCustomers.length} client account${selectableCustomers.length === 1 ? "" : "s"}. Managers are shown as groups — conversions go to a client account.`
                }
              >
                <select
                  value={form.customer_id}
                  disabled={!!customersError && selectableCustomers.length === 0}
                  onChange={(e) => {
                    const id = e.target.value;
                    const c = customers.find((c) => c.id === id);
                    setForm((f) => ({
                      ...f,
                      customer_id: id,
                      // Resolved from the hierarchy, not typed. Getting this
                      // wrong is how an upload fails with PERMISSION_DENIED,
                      // and nobody outside the Ads API knows what belongs here.
                      login_customer_id: c?.loginCustomerId ?? "",
                      default_currency: c?.currencyCode || f.default_currency,
                      // Account IANA zone — used on every conversionDateTime so
                      // Ads UI day buckets match the account (e.g. Pacific).
                      account_timezone: c?.timeZone || f.account_timezone,
                    }));
                  }}
                  className="w-full text-sm px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                >
                  <option value="">— Pick an account —</option>
                  {form.customer_id && !customers.some((c) => c.id === form.customer_id) && (
                    <option value={form.customer_id}>{form.customer_id}</option>
                  )}
                  {customerGroups.map(([via, group]) => {
                    const options = group.map((c) => (
                      <option key={c.id} value={c.id}>
                        {accountLabel(c)}
                      </option>
                    ));
                    return via ? (
                      <optgroup key={via} label={via}>
                        {options}
                      </optgroup>
                    ) : (
                      options
                    );
                  })}
                </select>
                {!loadAccounts && (
                  <button
                    type="button"
                    onClick={() => setAccountsRequested(true)}
                    className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
                  >
                    Load accounts
                  </button>
                )}
              </Field>
              <Field
                label="Default currency"
                hint={
                  form.account_timezone
                    ? `Used for Won deal values when no per-lead currency is set. Conversion times use ${form.account_timezone}.`
                    : "Used for Won deal values when no per-lead currency is set. Pick an account so we store its timezone for uploads."
                }
              >
                <input
                  value={form.default_currency}
                  onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value.toUpperCase().slice(0, 3) }))}
                  placeholder="EUR"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>

              {/* Escape hatch, folded away. Resolving both IDs from the
                  hierarchy is the supported path; raw IDs only help someone who
                  already knows the Ads API, and asking for them as the main
                  route is what left a partner stuck. */}
              <details className="sm:col-span-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Account not in the list? Enter the IDs yourself
                </summary>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Customer ID" hint="The client account conversions go to. Digits only.">
                    <input
                      value={form.customer_id}
                      onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value.replace(/\D/g, "") }))}
                      placeholder="1234567890"
                      className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </Field>
                  <Field
                    label="Manager ID"
                    hint="Only when the account sits inside an MCC: the MCC your Google login is on, not the account itself. Picking from the list above fills this in."
                  >
                    <input
                      value={form.login_customer_id}
                      onChange={(e) => setForm((f) => ({ ...f, login_customer_id: e.target.value.replace(/\D/g, "") }))}
                      placeholder="leave empty if unsure"
                      className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </Field>
                </div>
              </details>
            </div>
          </section>

          {/* Conversion actions */}
          <section className={`rounded-lg ring-1 ring-border bg-card p-5 ${connection.connected && form.customer_id ? "" : "opacity-60 pointer-events-none"}`}>
            <header className="mb-4">
              <h2 className="text-base font-semibold">Conversion actions per stage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loadingActions
                  ? "Loading conversion actions…"
                  : actions.length > 0
                    ? `Pick which conversion action to fire at each stage. ${actions.length} available on this account.`
                    : unusableActions > 0
                      ? `This account has ${unusableActions} conversion action${unusableActions === 1 ? "" : "s"}, but none can receive uploads from Leadlogr. Create the Leadlogr set below — no need to leave the app.`
                      : "No uploadable conversion actions yet. Create the Leadlogr set in one click — we add them in Google Ads for you and map the stages."}
              </p>
            </header>

            <div className="mb-4 rounded-md ring-1 ring-border bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">
                Creates four <strong className="text-foreground">Import → clicks</strong> actions in
                this Google Ads account (New, Qualified, Won, Lost), reuses them if they already
                exist, and fills the dropdowns. You still confirm with Save.
              </p>
              <button
                type="button"
                onClick={onCreateLeadlogrActions}
                disabled={creatingActions || loadingActions || !form.customer_id}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted/40 disabled:opacity-50 shrink-0"
              >
                {creatingActions ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {creatingActions ? "Creating…" : "Create Leadlogr conversions"}
              </button>
            </div>

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
              <li>Click <strong>Create Leadlogr conversions</strong> (or pick existing actions) for New / Qualified / Won / Lost, then Save.</li>
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

/** One prerequisite, done or not. */
function ReadyStep({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          done
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-muted text-muted-foreground ring-1 ring-border"
        }`}
      >
        {done ? "\u2713" : ""}
      </span>
      <span className={done ? "text-muted-foreground" : "font-medium"}>{label}</span>
      <span className="sr-only">{done ? " — done" : " — still to do"}</span>
    </li>
  );
}
