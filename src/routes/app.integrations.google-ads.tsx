import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey } from "@/hooks/use-live-leads";
import { getGoogleAdsSettings, saveGoogleAdsSettings, listConversionUploads } from "@/lib/google-ads-settings.functions";
import { Check, AlertCircle, ExternalLink, Loader2 } from "lucide-react";

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

function GoogleAdsPage() {
  const { ownWorkspace } = useAccount();
  const workspaceKey = deriveWorkspaceKey(ownWorkspace.name);
  const load = useServerFn(getGoogleAdsSettings);
  const save = useServerFn(saveGoogleAdsSettings);
  const listUploads = useServerFn(listConversionUploads);

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploads, setUploads] = useState<Array<{ id: string; stage: string; status: string; value: number | null; currency: string | null; click_id_type: string | null; error: string | null; attempted_at: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, u] = await Promise.all([
          load({ data: { workspaceKey } }),
          listUploads({ data: { workspaceKey, limit: 25 } }),
        ]);
        if (cancelled) return;
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
        }
        setUploads(u.uploads as never);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceKey, load, listUploads]);

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
          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Account</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Where conversions are uploaded.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Sending {form.enabled ? "on" : "off"}
              </label>
            </header>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Customer ID" hint="Digits only — no dashes. e.g. 1234567890">
                <input
                  value={form.customer_id}
                  onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value.replace(/\D/g, "") }))}
                  placeholder="1234567890"
                  className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>
              <Field label="Login customer ID (MCC)" hint="Optional. Required only if you access this account through a manager.">
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

          <section className="rounded-lg ring-1 ring-border bg-card p-5">
            <header className="mb-4">
              <h2 className="text-base font-semibold">Conversion actions per stage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Paste the numeric ID of each conversion action created in Google Ads. Leave blank to skip a stage.</p>
            </header>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <Field key={s.key} label={s.label} hint={s.hint}>
                  <input
                    value={form[s.key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value.replace(/\D/g, "") }))}
                    placeholder="e.g. 987654321"
                    className="w-full text-sm font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
                  />
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
                Open Google Ads → Conversions <ExternalLink className="size-3" />
              </a>
            </div>
          </section>

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
              <li>Tracker captures <code>gclid</code> / <code>wbraid</code> / <code>gbraid</code> on every Google Ads visit.</li>
              <li>When a lead reaches a configured stage, we POST to Google's <code>uploadClickConversions</code> endpoint.</li>
              <li>For Won, the deal value + currency are included. For Qualified/Lost we send the conversion only.</li>
              <li>If consent was granted, hashed email & phone are sent as Enhanced Conversions for Leads.</li>
              <li>Each (lead, stage) is uploaded at most once — re-running a stage change is safe.</li>
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
