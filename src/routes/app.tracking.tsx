import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAccount } from "@/lib/account-context";
import { deriveWorkspaceKey, useLiveLeads } from "@/hooks/use-live-leads";
import { Check, Copy, ExternalLink, ShieldCheck, Sparkles, Zap, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/app/tracking")({
  head: () => ({ meta: [{ title: "Tracking Setup — Leadlogr" }] }),
  ssr: false,
  component: TrackingPage,
});



// These are derived at runtime from the app's own origin so the tracker
// always points at this Leadlogr deployment (preview or published).


type Flags = {
  showConsentPopup: boolean;
  allowConsentFallback: boolean;
  allowDynamicForms: boolean;
  debug: boolean;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
    >
      {copied ? <Check className="size-3.5 text-stage-green-ink" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10">
        <CopyButton text={code} />
      </div>
      <pre className="text-[12px] leading-relaxed bg-muted/40 ring-1 ring-border rounded-lg p-4 pr-20 overflow-x-auto font-mono text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FlagToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-md ring-1 ring-border bg-card hover:bg-muted/40 transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 accent-primary cursor-pointer"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
      </div>
    </label>
  );
}

function TrackingPage() {
  const { ownWorkspace } = useAccount();
  const workspaceId = useMemo(() => deriveWorkspaceKey(ownWorkspace.name), [ownWorkspace.name]);

  const [origin, setOrigin] = useState<string>("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const defaultEndpoint = origin ? `${origin}/api/public/leads/collect` : "/api/public/leads/collect";
  const trackerSrc = origin ? `${origin}/tracker.v1.js` : "/tracker.v1.js";

  const [endpoint, setEndpoint] = useState<string>("");
  const effectiveEndpoint = endpoint || defaultEndpoint;
  const [flags, setFlags] = useState<Flags>({
    showConsentPopup: true,
    allowConsentFallback: true,
    allowDynamicForms: true,
    debug: true,
  });

  // Live ingestion status
  const liveLeads = useLiveLeads(workspaceId);
  const hasEvents = liveLeads.length > 0;


  const flagsJson = JSON.stringify(
    {
      showConsentPopup: flags.showConsentPopup,
      allowConsentFallback: flags.allowConsentFallback,
      allowDynamicForms: flags.allowDynamicForms,
    },
    null,
    0,
  );

  const gtmSnippet = `<!-- Leadlogr Tracker — Paste in GTM › Tags › New › Custom HTML
     Trigger: All Pages (Page View) -->
<script>
(function () {
  if (window.__LEADLOGR_LOADED__) return;
  window.__LEADLOGR_LOADED__ = true;
  window.LEADLOGR_CONFIG = {
    workspaceId: ${JSON.stringify(workspaceId)},
    endpoint:    ${JSON.stringify(endpoint)},
    debug:       ${flags.debug},
    featureFlags: ${flagsJson}
  };
  var s = document.createElement('script');
  s.async = true;
  s.src = ${JSON.stringify(TRACKER_SRC)};
  document.head.appendChild(s);
})();
</script>`;

  const directHtmlSnippet = `<!-- Leadlogr Tracker — Paste before </body> on every page -->
<script
  id="leadlogr-tracker"
  src="${TRACKER_SRC}"
  data-workspace-id="${workspaceId}"
  data-endpoint="${endpoint}"
  data-debug="${flags.debug}"
  data-feature-flags='${flagsJson}'
  async
></script>`;

  const spaSnippet = `// Single-page apps: fire after a successful submit.
window.Leadlogr.submitForm({
  name:    "Jane Doe",
  email:   "jane@example.com",
  phone:   "+1 555 0100",
  company: "Acme Inc.",
  // any extra fields are passed through as custom_fields
});`;

  return (
    <>
      <PageHeader
        eyebrow="Integrations › Tracking"
        title="Tracking setup"
        description="One snippet. Auto-detects forms, captures UTMs and click IDs, respects consent. Paste it once — no code changes per form."
      />

      {/* Highlights */}
      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {[
          { icon: Zap, title: "Zero per-form work", body: "Listens in the capture phase. Every <form> on every page is tracked automatically." },
          { icon: ShieldCheck, title: "Consent-aware", body: "Google Consent Mode v2 + cookie fallbacks. PII is stripped when denied." },
          { icon: Sparkles, title: "Full attribution", body: "UTM, gclid, fbclid, msclkid, li_fat_id, referrer, landing page — all on every lead." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg ring-1 ring-border bg-card p-4">
            <Icon className="size-4 text-primary" />
            <div className="text-sm font-semibold mt-2">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">{body}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Snippets */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Your install snippet</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-stage-green-ink bg-stage-green-soft ring-1 ring-stage-green-line px-2 py-0.5 rounded-full">
              <span className="size-1.5 rounded-full bg-stage-green-ink" /> Ready
            </span>
          </div>

          <Tabs defaultValue="gtm">
            <TabsList>
              <TabsTrigger value="gtm">Google Tag Manager</TabsTrigger>
              <TabsTrigger value="html">Direct HTML</TabsTrigger>
              <TabsTrigger value="spa">SPA / manual</TabsTrigger>
            </TabsList>

            <TabsContent value="gtm" className="mt-4 space-y-4">
              <CodeBlock code={gtmSnippet} />
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
                <li>In GTM open your container → <b className="text-foreground">Tags → New → Custom HTML</b>.</li>
                <li>Paste the snippet above. Set the trigger to <b className="text-foreground">All Pages</b>.</li>
                <li>Hit <b className="text-foreground">Submit</b> in GTM to publish the container. Done.</li>
              </ol>
              <a
                href="https://tagmanager.google.com"
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Open Tag Manager <ExternalLink className="size-3.5" />
              </a>
            </TabsContent>

            <TabsContent value="html" className="mt-4 space-y-4">
              <CodeBlock code={directHtmlSnippet} />
              <p className="text-sm text-muted-foreground">
                For sites without GTM. Paste once into your site template right before <code className="text-xs bg-muted px-1 rounded">&lt;/body&gt;</code>.
              </p>
            </TabsContent>

            <TabsContent value="spa" className="mt-4 space-y-4">
              <CodeBlock code={spaSnippet} />
              <p className="text-sm text-muted-foreground">
                Use this only when your framework intercepts form submits (React Hook Form, custom fetchers, etc.). The auto-detector handles standard <code className="text-xs bg-muted px-1 rounded">&lt;form&gt;</code> submissions on its own.
              </p>
            </TabsContent>
          </Tabs>

          {/* Verify */}
          <div className="mt-8 rounded-lg ring-1 ring-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-md bg-muted ring-1 ring-border grid place-items-center">
                <AlertCircle className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Verify your install</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Once the snippet is live, submit a test form on your site. We'll show the event here within seconds.
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground bg-muted/40 ring-1 ring-border px-2 py-1 rounded">
                    <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" /> Waiting for first event…
                  </span>
                  <button className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors">
                    Send test event
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <aside className="space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace ID
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 text-xs font-mono px-3 py-2 rounded-md bg-muted/40 ring-1 ring-border truncate">
                {workspaceId}
              </code>
              <CopyButton text={workspaceId} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Routes incoming leads to this workspace. Auto-filled.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ingest endpoint
            </label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="mt-1.5 w-full text-xs font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Override only if you proxy through your own domain (recommended for first-party cookies).
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Feature flags
            </div>
            <div className="space-y-2">
              <FlagToggle
                label="Show consent popup"
                hint="Display Leadlogr's built-in consent banner if no CMP is detected."
                checked={flags.showConsentPopup}
                onChange={(v) => setFlags((f) => ({ ...f, showConsentPopup: v }))}
              />
              <FlagToggle
                label="Consent fallback"
                hint="Track basic events without PII when consent is denied."
                checked={flags.allowConsentFallback}
                onChange={(v) => setFlags((f) => ({ ...f, allowConsentFallback: v }))}
              />
              <FlagToggle
                label="Dynamic forms"
                hint="Watch the DOM for forms added after page load (SPAs, modals)."
                checked={flags.allowDynamicForms}
                onChange={(v) => setFlags((f) => ({ ...f, allowDynamicForms: v }))}
              />
              <FlagToggle
                label="Debug mode"
                hint="Verbose console logs. Turn off before going live."
                checked={flags.debug}
                onChange={(v) => setFlags((f) => ({ ...f, debug: v }))}
              />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
