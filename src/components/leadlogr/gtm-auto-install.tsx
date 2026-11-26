import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ExternalLink, Loader2, Tags, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectTagManager,
  getTagManagerStatus,
  installTagManagerTracker,
  listTagManagerAccounts,
  listTagManagerContainers,
  startTagManagerOAuth,
  type InstallTagManagerResult,
  type TagManagerAccountOption,
  type TagManagerContainerOption,
  type TagManagerStatus,
} from "@/lib/tag-manager.functions";
import { LEADLOGR_GTM_TAG_NAME, LEADLOGR_GTM_TRIGGER_NAME } from "@/lib/gtm-tag";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  missing_scopes:
    "Every Tag Manager permission on Google's screen is needed to install and publish the tag. Connect again and leave them all ticked.",
  no_refresh_token:
    "Google did not return a long-lived authorization. Remove Leadlogr at myaccount.google.com/permissions, then connect again.",
  invalid_state: "That sign-in link was already used. Start again.",
  state_expired: "The sign-in took too long. Start again.",
  server_not_configured: "Google sign-in is not configured on this server.",
};
const oauthError = (code: string | null | undefined) =>
  (code &&
    (OAUTH_ERRORS[code] ??
      (code.startsWith("token_exchange_failed")
        ? "Google rejected the sign-in. Try again."
        : code))) ||
  "Connection failed";

const selectCls =
  "mt-1.5 w-full text-sm px-3 py-2 rounded-md bg-card ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";

/**
 * Connect Google Tag Manager, pick a web container, and have Leadlogr create
 * and publish the tracker tag there. The HTML shown under "What will be
 * created" is exactly what gets published.
 */
export function GtmAutoInstall({
  organizationId,
  origin,
  endpoint,
  debug,
  allowDynamicForms,
  previewHtml,
  ready,
}: {
  organizationId: string;
  origin: string;
  /** Only set when the admin overrode the ingest endpoint. */
  endpoint: string;
  debug: boolean;
  allowDynamicForms: boolean;
  previewHtml: string;
  ready: boolean;
}) {
  const fetchStatus = useServerFn(getTagManagerStatus);
  const startOAuth = useServerFn(startTagManagerOAuth);
  const fetchAccounts = useServerFn(listTagManagerAccounts);
  const fetchContainers = useServerFn(listTagManagerContainers);
  const install = useServerFn(installTagManagerTracker);
  const disconnect = useServerFn(disconnectTagManager);

  const [status, setStatus] = useState<TagManagerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<TagManagerAccountOption[]>([]);
  const [containers, setContainers] = useState<TagManagerContainerOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<InstallTagManagerResult | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const s = await fetchStatus({ data: { organizationId } });
      setStatus(s);
      if (s.accountId) setAccountId((a) => a || s.accountId!);
      if (s.containerId) setContainerId((c) => c || s.containerId!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Tag Manager status");
    }
  }, [organizationId, fetchStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Popup result.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.source !== "leadlogr-google-tag-manager-oauth") return;
      if (d.payload?.ok) {
        setError(null);
        toast.success("Google Tag Manager connected");
        void refresh();
      } else {
        setError(oauthError(d.payload?.error));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refresh]);

  // Full-window redirect return (popup was blocked).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("gtm_connected")) return;
    if (params.get("gtm_connected") === "1") void refresh();
    else setError(oauthError(params.get("error")));
    params.delete("gtm_connected");
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [refresh]);

  const connected = !!status?.connected;
  const canManage = !!status?.canManage;

  useEffect(() => {
    if (!connected || !canManage) {
      setAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    fetchAccounts({ data: { organizationId } })
      .then((r) => {
        setAccounts(r.accounts);
        if (r.error)
          setError(r.error === "not_connected" ? "Connect Google Tag Manager first." : r.error);
        if (r.accounts.length === 1) setAccountId((a) => a || r.accounts[0].accountId);
      })
      .finally(() => setLoadingAccounts(false));
  }, [connected, canManage, organizationId, fetchAccounts]);

  useEffect(() => {
    if (!connected || !accountId) {
      setContainers([]);
      return;
    }
    setLoadingContainers(true);
    fetchContainers({ data: { organizationId, accountId } })
      .then((r) => {
        setContainers(r.containers);
        if (r.error) setError(r.error);
        if (r.containers.length === 1) setContainerId((c) => c || r.containers[0].containerId);
      })
      .finally(() => setLoadingContainers(false));
  }, [connected, accountId, organizationId, fetchContainers]);

  const onConnect = async () => {
    setError(null);
    const w = 520,
      h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    // Opened before the await so the browser ties it to the click.
    const popup = window.open(
      "about:blank",
      "leadlogr-google-tag-manager",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    try {
      const { url } = await startOAuth({
        data: { organizationId, redirectOrigin: window.location.origin },
      });
      if (popup && !popup.closed) popup.location.href = url;
      else window.location.href = url;
    } catch (e) {
      popup?.close();
      setError(e instanceof Error ? e.message : "Could not start the Google connection");
    }
  };

  const onDisconnect = async () => {
    if (
      !confirm(
        "Disconnect Google Tag Manager? Leadlogr will no longer be able to change your container. The tag already published stays on your site.",
      )
    )
      return;
    try {
      const r = await disconnect({ data: { organizationId } });
      toast.success(r.note ?? "Tag Manager disconnected and access revoked at Google.");
      setAccounts([]);
      setContainers([]);
      setResult(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    }
  };

  const onInstall = async () => {
    const container = containers.find((c) => c.containerId === containerId);
    if (!container) return;
    if (
      !confirm(
        `Publish the "${LEADLOGR_GTM_TAG_NAME}" tag to ${container.name} (${container.publicId})? It goes live on your website immediately.`,
      )
    )
      return;
    setInstalling(true);
    setError(null);
    setResult(null);
    try {
      const r = await install({
        data: {
          organizationId,
          accountId,
          containerId,
          origin,
          endpoint: endpoint || undefined,
          debug,
          allowDynamicForms,
        },
      });
      setResult(r);
      if (r.ok) {
        toast.success(
          r.status === "published"
            ? `Published to ${r.containerPublicId}`
            : `Already up to date in ${r.containerPublicId}`,
        );
        void refresh();
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  };

  const selectedContainer = containers.find((c) => c.containerId === containerId);
  const httpsOrigin = origin.startsWith("https://");

  return (
    <div className="rounded-lg ring-1 ring-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-md bg-muted ring-1 ring-border grid place-items-center shrink-0">
          <Tags className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              Install automatically with Google Tag Manager
            </div>
            {connected ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-stage-green-ink bg-stage-green-soft ring-1 ring-stage-green-line px-2 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-stage-green-ink" />
                Connected{status?.connectedEmail ? ` as ${status.connectedEmail}` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Connect Tag Manager and Leadlogr adds the tag below to the container you pick and
            publishes it. This is a separate permission from Google Ads and can be revoked at any
            time.
          </p>

          {error && (
            <div className="mt-3 rounded-md ring-1 ring-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {status && !canManage ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Only workspace owners and admins can connect Tag Manager.
            </p>
          ) : !connected ? (
            <button
              onClick={onConnect}
              disabled={!status}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Connect Google Tag Manager
            </button>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tag Manager account
                  </span>
                  <select
                    className={selectCls}
                    value={accountId}
                    disabled={loadingAccounts}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      setContainerId("");
                      setResult(null);
                    }}
                  >
                    <option value="">{loadingAccounts ? "Loading…" : "Choose an account"}</option>
                    {accounts.map((a) => (
                      <option key={a.accountId} value={a.accountId}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Web container
                  </span>
                  <select
                    className={selectCls}
                    value={containerId}
                    disabled={!accountId || loadingContainers}
                    onChange={(e) => {
                      setContainerId(e.target.value);
                      setResult(null);
                    }}
                  >
                    <option value="">
                      {loadingContainers
                        ? "Loading…"
                        : accountId && containers.length === 0
                          ? "No web containers"
                          : "Choose a container"}
                    </option>
                    {containers.map((c) => (
                      <option key={c.containerId} value={c.containerId}>
                        {c.name} ({c.publicId})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedContainer && (
                <div className="rounded-md ring-1 ring-border bg-muted/30 p-3 text-xs space-y-2">
                  <div className="font-semibold text-foreground">What will be created</div>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>
                      A new workspace in <strong>{selectedContainer.name}</strong> (
                      {selectedContainer.publicId}), so your own unpublished changes are not
                      included.
                    </li>
                    <li>
                      Trigger <strong>{LEADLOGR_GTM_TRIGGER_NAME}</strong>: Page View on every page
                      (reused if it exists).
                    </li>
                    <li>
                      Custom HTML tag <strong>{LEADLOGR_GTM_TAG_NAME}</strong> with the snippet
                      below (updated in place if it exists).
                    </li>
                    <li>A new container version, published immediately.</li>
                  </ul>
                  <details>
                    <summary className="cursor-pointer font-medium text-foreground">
                      Tag HTML
                    </summary>
                    <pre className="mt-2 text-[11px] leading-relaxed bg-card ring-1 ring-border rounded p-3 overflow-x-auto font-mono">
                      {previewHtml}
                    </pre>
                  </details>
                </div>
              )}

              {!httpsOrigin && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Publishing needs Leadlogr on https. Open this page on your live Leadlogr domain.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onInstall}
                  disabled={!ready || !selectedContainer || installing || !httpsOrigin}
                  className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {installing && <Loader2 className="size-4 animate-spin" />}
                  Install and publish
                </button>
                <button
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted"
                >
                  <Unplug className="size-3.5" /> Disconnect
                </button>
              </div>

              {result?.ok && (
                <div className="rounded-md ring-1 ring-stage-green-line bg-stage-green-soft p-3 text-xs text-stage-green-ink space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="size-4" />
                    {result.status === "published"
                      ? `Published${result.versionId ? ` as version ${result.versionId}` : ""} to ${result.containerName} (${result.containerPublicId})`
                      : `Already installed and up to date in ${result.containerName} (${result.containerPublicId}). Nothing was published.`}
                  </div>
                  {result.status === "published" && (
                    <div>
                      Tag {result.tagAction}, trigger {result.triggerAction}. Submit a test form on
                      your site to see the first event below.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {result.versionUrl && (
                      <a
                        href={result.versionUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 underline"
                      >
                        View version <ExternalLink className="size-3" />
                      </a>
                    )}
                    {result.containerUrl && (
                      <a
                        href={result.containerUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 underline"
                      >
                        Open container <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!result && status?.lastPublishedAt && (
                <p className="text-xs text-muted-foreground">
                  Last published to {status.containerName} ({status.containerPublicId}) on{" "}
                  {new Date(status.lastPublishedAt).toLocaleString()}
                  {status.lastVersionId ? `, version ${status.lastVersionId}` : ""}.{" "}
                  {status.containerUrl && (
                    <a
                      href={status.containerUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline"
                    >
                      Open container
                    </a>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
