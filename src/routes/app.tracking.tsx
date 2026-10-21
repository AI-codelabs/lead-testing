import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { ConsentNotice } from "@/components/leadlogr/consent-notice";
import { getIngestKey } from "@/lib/organization.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useLiveLeads } from "@/hooks/use-live-leads";
import { Check, Copy, ExternalLink, ShieldCheck, Sparkles, Zap, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tracking")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Tracking Setup — Leadlogr" }] }),
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    integration: typeof search.integration === "string" ? search.integration : "gtm",
  }),
  component: TrackingPage,
});



// These are derived at runtime from the app's own origin so the tracker
// always points at this Leadlogr deployment (preview or published).


type Flags = {
  allowDynamicForms: boolean;
  debug: boolean;
};

const INTEGRATION_NAMES: Record<string, string> = {
  gtm: "Google Tag Manager",
  website: "Website snippet",
  api: "REST API",
  zapier: "Zapier",
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

// Real workspace keys created by handle_new_user() follow ws_<slug>_<8hex>.
// Anything that doesn't match (e.g. the placeholder "ws_acmemedia" used
// before profile hydration) must NOT be shown in the install snippet.
// The tracker authenticates with the workspace's ingest key: a rotatable
// credential, deliberately separate from the organization id so the id is
// never exposed in a public snippet.
const INGEST_KEY_RE = /^[a-f0-9]{32,}$/;

function TrackingPage() {
  const search = Route.useSearch();
  const { activeWorkspace, authReady, isAuthenticated } = useAccount();
  const fetchIngestKey = useServerFn(getIngestKey);

  // The workspace being viewed, not the signed-in account's own.
  //
  // This used to read activeOrganizationId, which is hardcoded to the agency's
  // own workspace and never follows the client being viewed. An agency setting
  // up a client was therefore handed its OWN ingest key: every lead from that
  // client's website landed in the agency's workspace instead, and the client
  // workspace stayed empty while "Verify your install" cheerfully reported an
  // event — it was reading the agency's leads too.
  const organizationId = activeWorkspace.key;

  const { data: ingestData } = useQuery({
    queryKey: ["ingest-key", organizationId],
    queryFn: () => fetchIngestKey({ data: { organizationId } }),
    enabled: isAuthenticated && !!organizationId,
  });

  const ingestKey = ingestData?.ingestKey ?? "";
  const workspaceReady = isAuthenticated && INGEST_KEY_RE.test(ingestKey);
  // "wordpress" was the old id for what is really just a script tag, which
  // works on Framer, Webflow, Squarespace or anything else you can edit. A
  // snippet pasted before the rename still stamps the old value, so it is
  // accepted and folded into the new one rather than falling back to GTM.
  const requested = search.integration === "wordpress" ? "website" : search.integration;
  const integrationId = ["gtm", "website", "api", "zapier"].includes(requested) ? requested : "gtm";
  const integrationName = INTEGRATION_NAMES[integrationId] ?? "Google Tag Manager";
  // GTM and the website snippet load a script in the browser; REST and Zapier
  // send the lead server to server and never load one.
  const isScriptInstall = integrationId === "gtm" || integrationId === "website";

  // Backend (ingest + tracker script) is always served from Lovable, even when
  // the dashboard frontend is hosted elsewhere (e.g. Vercel on leadlogr.com).
  // The tracker script and the ingest endpoint are served by THIS app, so the
  // snippet must point at wherever it is running. Previously hardcoded to the
  // old Lovable host, which still answers but writes to the retired backend —
  // live leads would have gone to the wrong database.
  const [origin, setOrigin] = useState<string>(import.meta.env.VITE_SITE_URL ?? "");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const BACKEND_ORIGIN = origin || import.meta.env.VITE_SITE_URL || "";
  const defaultEndpoint = `${BACKEND_ORIGIN}/api/public/leads/collect`;
  const trackerSrc = `${BACKEND_ORIGIN}/api/public/tracker/v1`;

  const [endpoint, setEndpoint] = useState<string>("");
  const effectiveEndpoint = endpoint || defaultEndpoint;
  const [flags, setFlags] = useState<Flags>({
    allowDynamicForms: true,
    debug: true,
  });

  // Live ingestion status
  const liveLeads = useLiveLeads(organizationId);
  const integrationLeads = useMemo(
    () =>
      liveLeads.filter((lead) => {
        const stamped = lead.integrationId || "gtm";
        return (stamped === "wordpress" ? "website" : stamped) === integrationId;
      }),
    [liveLeads, integrationId],
  );
  const hasEvents = integrationLeads.length > 0;


  const flagsJson = JSON.stringify(
    {
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
    ingestKey: ${JSON.stringify(ingestKey)},
    endpoint:    ${JSON.stringify(effectiveEndpoint)},
    integrationId: ${JSON.stringify(integrationId)},
    debug:       ${flags.debug},
    featureFlags: ${flagsJson}
  };
  var s = document.createElement('script');
  s.async = true;
  s.src = ${JSON.stringify(trackerSrc)};
  document.head.appendChild(s);
})();
</script>`;

  const directHtmlSnippet = `<!-- Leadlogr Tracker — Paste before </body> on every page -->
<script
  id="leadlogr-tracker"
  src="${trackerSrc}"
  data-ingest-key="${ingestKey}"
  data-endpoint="${effectiveEndpoint}"
  data-integration-id="${integrationId}"
  data-debug="${flags.debug}"
  data-feature-flags='${flagsJson}'
  async
></script>`;


  const restSnippet = `curl -X POST ${JSON.stringify(effectiveEndpoint)} \\
  -H 'Content-Type: application/json' \\
  -d '{
    "ingest_key": ${JSON.stringify(ingestKey)},
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+31612345678",
    "company": "Example BV",
    "message": "Please get in touch",
    "source": "Google",
    "gclid": "<click id, when you have one>"
  }'`;

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
        title={`${integrationName} setup`}
        description={
          isScriptInstall
            ? "One snippet. Auto-detects forms, captures UTMs and click IDs, respects consent. Paste it once — no code changes per form."
            : "One endpoint. Send a lead as JSON from anything that can make an HTTP request — no snippet on the site at all."
        }
      />

      {/* Highlights */}
      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {[
          { icon: Zap, title: "Zero per-form work", body: "Listens in the capture phase. Every <form> on every page is tracked automatically." },
          { icon: ShieldCheck, title: "Consent-aware", body: "Reads Consent Mode v2 and the major CMPs. Every enquiry is recorded; consent decides what reaches your ad platforms." },
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
            <h2 className="text-lg font-semibold">{isScriptInstall ? "Your install snippet" : "Your endpoint"}</h2>
            {workspaceReady ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-stage-green-ink bg-stage-green-soft ring-1 ring-stage-green-line px-2 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-stage-green-ink" /> Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 ring-1 ring-border px-2 py-0.5 rounded-full">
                <Loader2 className="size-3 animate-spin" /> {authReady && !isAuthenticated ? "Sign in to view" : "Loading workspace…"}
              </span>
            )}
          </div>

          {isScriptInstall && (
            <div className="mb-4">
              <ConsentNotice />
            </div>
          )}

          {!workspaceReady && (
            <div className="mb-4 rounded-md ring-1 ring-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
              {authReady && !isAuthenticated
                ? "Sign in to your Leadlogr workspace to generate a tracking snippet. The snippet must include your real workspace key — placeholders are rejected by the ingest endpoint."
                : "Your workspace is still loading. The snippet below will activate as soon as your workspace key is hydrated from the server."}
            </div>
          )}

          {/*
            Only the method that belongs to the integration you arrived from.
            This page is shared by all four incoming integrations, and it used
            to render every method with Google Tag Manager preselected — so
            "Zapier setup" opened on a GTM tag, which reads as the wrong page
            rather than as a choice.
          */}
          {isScriptInstall ? (
            <div className="space-y-4">
              <CodeBlock code={integrationId === "gtm" ? gtmSnippet : directHtmlSnippet} />
              <p className="text-sm text-muted-foreground">
                {integrationId === "gtm" ? (
                  <>
                    Paste into GTM › Tags › New › Custom HTML, and trigger it on All Pages.
                  </>
                ) : (
                  <>
                    Paste once wherever your site lets you add HTML to every page — a theme
                    footer, a custom-code block, a site-wide embed. In WordPress that is the
                    theme before{" "}
                    <code className="text-xs bg-muted px-1 rounded">&lt;/body&gt;</code>; in
                    Framer, Webflow or Squarespace it is the site settings' custom code panel.
                    It finds the forms itself, so there is nothing to set up per form.
                  </>
                )}
              </p>

              <details className="rounded-lg ring-1 ring-border bg-muted/20 p-4">
                <summary className="text-sm font-medium cursor-pointer">
                  My framework intercepts form submits
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    The detector handles standard <code className="text-xs bg-muted px-1 rounded">&lt;form&gt;</code>{" "}
                    submissions on its own. Call it yourself only when something swallows the
                    submit event — React Hook Form, a custom fetcher, a headless widget.
                  </p>
                  <CodeBlock code={spaSnippet} />
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {integrationId === "zapier" ? (
                  <>
                    No snippet and no Leadlogr Zapier app. Add a{" "}
                    <span className="font-medium text-foreground">Webhooks by Zapier → POST</span>{" "}
                    step to any Zap and point it here. Set the payload type to JSON.
                  </>
                ) : (
                  <>
                    Post leads straight from your own backend or form handler. One endpoint, one
                    key, JSON in.
                  </>
                )}
              </p>
              <CodeBlock code={restSnippet} />
              <div className="rounded-lg ring-1 ring-border bg-muted/30 p-4 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What it accepts
                </div>
                <p className="text-sm text-muted-foreground">
                  <code className="text-xs bg-muted px-1 rounded">ingest_key</code> is required and
                  identifies the workspace. Everything else is optional:{" "}
                  <code className="text-xs bg-muted px-1 rounded">name</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">email</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">phone</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">company</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">message</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">source</code>, the{" "}
                  <code className="text-xs bg-muted px-1 rounded">utm_*</code> parameters, and the
                  click identifiers{" "}
                  <code className="text-xs bg-muted px-1 rounded">gclid</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">fbclid</code>,{" "}
                  <code className="text-xs bg-muted px-1 rounded">msclkid</code> and{" "}
                  <code className="text-xs bg-muted px-1 rounded">li_fat_id</code>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Anything else you send is kept verbatim against the lead, so your own fields
                  survive without being declared here first. Send a click identifier wherever you
                  have one — it is what lets the outcome be reported back to the ad platform.
                </p>
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            Installing a different way?{" "}
            <Link to="/app/integrations" className="font-medium text-primary hover:underline">
              Pick another source
            </Link>{" "}
            — the workspace key is the same whichever you use.
          </p>

          {/* Verify */}
          <div className="mt-8 rounded-lg ring-1 ring-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-md bg-muted ring-1 ring-border grid place-items-center">
                <AlertCircle className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Verify your install</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isScriptInstall
                    ? "Once the snippet is live, submit a test form on your site. We'll show the event here within seconds."
                    : "Send one request with the example above. We'll show the lead here within seconds."}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  {hasEvents ? (
                    <span className="inline-flex items-center gap-1.5 text-stage-green-ink bg-stage-green-soft ring-1 ring-stage-green-line px-2 py-1 rounded">
                      <span className="size-1.5 rounded-full bg-stage-green-ink" />
                      {integrationLeads.length} event{integrationLeads.length === 1 ? "" : "s"} received — newest from {integrationLeads[0]?.email || integrationLeads[0]?.name || "anonymous"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground bg-muted/40 ring-1 ring-border px-2 py-1 rounded">
                      <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" /> Waiting for first event…
                    </span>
                  )}
                  <button
                    disabled={!workspaceReady}
                    onClick={async () => {
                      try {
                        const res = await fetch(effectiveEndpoint, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ingest_key: ingestKey,
                            integration_id: integrationId,
                            name: "Test Lead",
                            email: "test@example.com",
                            phone: "+1 555 0100",
                            company: "Test Co.",
                            message: "Sent from Leadlogr tracking page",
                            source: "Direct",
                            landing_page_url: window.location.href,
                            page_path: "/app/tracking",
                            consent: "Accepted",
                          }),
                        });
                        const body = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          toast.error(
                            body?.error === "unknown_workspace"
                              ? `Unknown ingest key (${ingestKey.slice(0, 12)}…). Re-copy the snippet from this page.`
                              : `Test event failed (${res.status})`,
                          );
                          return;
                        }
                        toast.success("Test event received. It will appear in your CRM in a few seconds.");
                      } catch (err) {
                        toast.error("Could not reach the ingest endpoint. Check the URL and try again.");
                      }
                    }}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
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
                {ingestKey}
              </code>
              <CopyButton text={ingestKey} />
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
              placeholder={defaultEndpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="mt-1.5 w-full text-xs font-mono px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Override only if you proxy through your own domain (recommended for first-party cookies).
            </p>
          </div>

          {isScriptInstall && (
                    <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Feature flags
              </div>
              <div className="space-y-2">
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
          )}
        </aside>
      </div>
    </>
  );
}
