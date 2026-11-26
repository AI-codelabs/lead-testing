/**
 * Minimal Google Tag Manager API v2 client for installing the Leadlogr tracker.
 * Server-only.
 *
 * Same OAuth client as Google Ads (GOOGLE_ADS_OAUTH_CLIENT_ID/SECRET), but a
 * separate consent and a separate stored grant: a workspace that only connects
 * Google Ads is never asked for publish rights on its website's tags.
 *
 * The install never touches the customer's own workspaces. It creates a fresh
 * one, puts only the Leadlogr tag and trigger in it, versions and publishes
 * that. Publishing from "Default Workspace" instead would ship whatever
 * half-finished changes the customer had sitting there.
 */

import { getAccessToken, type GoogleAdsCreds } from "./google-ads.server";
import {
  buildGtmTagPayload,
  buildGtmTriggerPayload,
  LEADLOGR_GTM_TAG_NAME,
  LEADLOGR_GTM_TRIGGER_NAME,
  LEADLOGR_GTM_WORKSPACE_PREFIX,
  tagIsCurrent,
  type GtmParameter,
  type TrackerSnippetInput,
} from "./gtm-tag";

const BASE = "https://tagmanager.googleapis.com/tagmanager/v2";

/** Requested only by the Tag Manager connect flow, never by Google Ads. */
export const TAG_MANAGER_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "openid",
  "email",
] as const;

export function tagManagerScopes(): string {
  return TAG_MANAGER_SCOPES.join(" ");
}

export const GTM_CALLBACK_PATH = "/api/public/oauth/google-tag-manager/callback";

export type GtmAccount = { accountId: string; name: string; path: string };
export type GtmContainer = {
  accountId: string;
  containerId: string;
  name: string;
  publicId: string;
  path: string;
  usageContext: string[];
  tagManagerUrl: string | null;
};

type Workspace = { path: string; workspaceId: string; name: string };
type Tag = {
  path: string;
  tagId: string;
  name: string;
  type?: string;
  parameter?: GtmParameter[];
  firingTriggerId?: string[];
  paused?: boolean;
  fingerprint?: string;
};
type Trigger = { path: string; triggerId: string; name: string; type?: string };
type ContainerVersion = {
  path: string;
  containerVersionId: string;
  tagManagerUrl?: string;
};

export class GtmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** One sentence a customer can act on, rather than Google's raw JSON. */
export function humanGtmError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401) return "Google rejected the stored authorization. Reconnect Tag Manager.";
  if (status === 403 && lower.includes("insufficient")) {
    return "The connected Google account cannot publish this container. In Tag Manager › Admin › User Management, give it Publish permission, then try again.";
  }
  if (status === 403 && (lower.includes("not been used") || lower.includes("disabled"))) {
    return "The Tag Manager API is not enabled for Leadlogr's Google Cloud project yet.";
  }
  if (status === 403) return "Google refused access to this container for the connected account.";
  if (status === 404) return "That Tag Manager account or container no longer exists.";
  if (status === 429)
    return "Google Tag Manager is rate-limiting requests. Wait a minute and try again.";
  if (lower.includes("workspace") && lower.includes("limit")) {
    return "This container already has the maximum number of workspaces. Delete an unused workspace in Tag Manager, then try again.";
  }
  return `Google Tag Manager returned ${status}: ${body.slice(0, 200)}`;
}

type Fetcher = typeof fetch;

export class TagManagerClient {
  private token: string | null = null;

  constructor(
    private readonly creds: GoogleAdsCreds,
    private readonly fetcher: Fetcher = fetch,
    private readonly tokenFor: (c: GoogleAdsCreds) => Promise<string> = getAccessToken,
  ) {}

  private async call<T>(method: string, pathOrUrl: string, body?: unknown): Promise<T> {
    if (!this.token) this.token = await this.tokenFor(this.creds);
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${BASE}/${pathOrUrl.replace(/^\//, "")}`;
    for (let attempt = 0; ; attempt++) {
      const resp = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      // GTM's per-user quota is small; one short back-off covers a normal install.
      if (resp.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const text = await resp.text();
      if (!resp.ok) throw new GtmApiError(humanGtmError(resp.status, text), resp.status);
      return (text ? JSON.parse(text) : {}) as T;
    }
  }

  private async listAll<T>(path: string, key: string): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
      const page = await this.call<Record<string, unknown>>("GET", `${path}${qs}`);
      out.push(...((page[key] as T[] | undefined) ?? []));
      pageToken = page.nextPageToken as string | undefined;
    } while (pageToken);
    return out;
  }

  async listAccounts(): Promise<GtmAccount[]> {
    const rows = await this.listAll<GtmAccount>("accounts", "account");
    return rows.map((a) => ({ accountId: a.accountId, name: a.name, path: a.path }));
  }

  /** Web containers only: the tracker is a browser script and means nothing in an app or server container. */
  async listWebContainers(accountId: string): Promise<GtmContainer[]> {
    const rows = await this.listAll<GtmContainer>(
      `accounts/${digits(accountId)}/containers`,
      "container",
    );
    return rows
      .filter((c) => (c.usageContext ?? []).includes("web"))
      .map((c) => ({
        accountId: c.accountId,
        containerId: c.containerId,
        name: c.name,
        publicId: c.publicId,
        path: c.path,
        usageContext: c.usageContext ?? [],
        tagManagerUrl: c.tagManagerUrl ?? null,
      }));
  }

  async getContainer(accountId: string, containerId: string): Promise<GtmContainer> {
    const c = await this.call<GtmContainer>(
      "GET",
      `accounts/${digits(accountId)}/containers/${digits(containerId)}`,
    );
    return { ...c, usageContext: c.usageContext ?? [], tagManagerUrl: c.tagManagerUrl ?? null };
  }

  listWorkspaces(containerPath: string) {
    return this.listAll<Workspace>(`${containerPath}/workspaces`, "workspace");
  }

  createWorkspace(containerPath: string, name: string) {
    return this.call<Workspace>("POST", `${containerPath}/workspaces`, {
      name,
      description:
        "Created by Leadlogr to install its tracker. Removed automatically once published.",
    });
  }

  deleteWorkspace(workspacePath: string) {
    return this.call<unknown>("DELETE", workspacePath);
  }

  listTags(workspacePath: string) {
    return this.listAll<Tag>(`${workspacePath}/tags`, "tag");
  }

  listTriggers(workspacePath: string) {
    return this.listAll<Trigger>(`${workspacePath}/triggers`, "trigger");
  }

  createTrigger(workspacePath: string) {
    return this.call<Trigger>("POST", `${workspacePath}/triggers`, buildGtmTriggerPayload());
  }

  createTag(workspacePath: string, payload: unknown) {
    return this.call<Tag>("POST", `${workspacePath}/tags`, payload);
  }

  updateTag(tagPath: string, payload: unknown) {
    return this.call<Tag>("PUT", tagPath, payload);
  }

  createVersion(workspacePath: string, name: string, notes: string) {
    return this.call<{
      containerVersion?: ContainerVersion;
      compilerError?: boolean;
      syncStatus?: { mergeConflict?: boolean; syncError?: boolean };
    }>("POST", `${workspacePath}:create_version`, { name, notes });
  }

  publishVersion(versionPath: string) {
    return this.call<{ containerVersion?: ContainerVersion; compilerError?: boolean }>(
      "POST",
      `${versionPath}:publish`,
    );
  }
}

function digits(id: string): string {
  const d = String(id).replace(/\D/g, "");
  if (!d) throw new Error("Invalid Tag Manager id");
  return d;
}

export type InstallResult = {
  status: "published" | "unchanged";
  container: { accountId: string; containerId: string; publicId: string; name: string };
  containerUrl: string | null;
  tagAction: "created" | "updated" | "unchanged";
  triggerAction: "created" | "reused";
  versionId: string | null;
  versionUrl: string | null;
};

/**
 * Creates (or updates) the Leadlogr Custom HTML tag and its All Pages trigger
 * in a fresh workspace, versions it and publishes it.
 *
 * Idempotent by name: a second run finds "Leadlogr tracker" and updates it in
 * place, and when it already matches exactly, the workspace is discarded and
 * nothing is published.
 */
export async function installAndPublishTracker(
  client: TagManagerClient,
  opts: { accountId: string; containerId: string; snippet: TrackerSnippetInput; now?: Date },
): Promise<InstallResult> {
  const container = await client.getContainer(opts.accountId, opts.containerId);
  if (!container.usageContext.includes("web")) {
    throw new Error("Pick a web container. The tracker runs in the browser.");
  }

  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 16).replace("T", " ");
  const workspace = await client.createWorkspace(
    container.path,
    `${LEADLOGR_GTM_WORKSPACE_PREFIX} ${stamp} UTC`,
  );

  let consumed = false;
  try {
    const triggers = await client.listTriggers(workspace.path);
    let trigger = triggers.find(
      (t) => t.name === LEADLOGR_GTM_TRIGGER_NAME && t.type === "pageview",
    );
    const triggerAction: InstallResult["triggerAction"] = trigger ? "reused" : "created";
    if (!trigger) trigger = await client.createTrigger(workspace.path);

    const desired = buildGtmTagPayload(opts.snippet, trigger.triggerId);
    const existing = (await client.listTags(workspace.path)).find(
      (t) => t.name === LEADLOGR_GTM_TAG_NAME,
    );

    const base = {
      container: {
        accountId: container.accountId,
        containerId: container.containerId,
        publicId: container.publicId,
        name: container.name,
      },
      containerUrl: container.tagManagerUrl,
      triggerAction,
    };

    if (triggerAction === "reused" && tagIsCurrent(existing ?? null, desired)) {
      return {
        ...base,
        status: "unchanged",
        tagAction: "unchanged",
        versionId: null,
        versionUrl: null,
      };
    }

    let tagAction: InstallResult["tagAction"];
    if (existing) {
      await client.updateTag(existing.path, desired);
      tagAction = "updated";
    } else {
      await client.createTag(workspace.path, desired);
      tagAction = "created";
    }

    const created = await client.createVersion(
      workspace.path,
      `Leadlogr tracker ${stamp} UTC`,
      `Leadlogr ${tagAction} the "${LEADLOGR_GTM_TAG_NAME}" Custom HTML tag (trigger: ${LEADLOGR_GTM_TRIGGER_NAME}).`,
    );
    if (created.compilerError) throw new Error("Tag Manager could not compile the new version.");
    if (created.syncStatus?.mergeConflict || created.syncStatus?.syncError) {
      throw new Error("The container changed while installing. Try again.");
    }
    if (!created.containerVersion) throw new Error("Tag Manager did not return the new version.");
    // create_version deletes the workspace it was made from.
    consumed = true;

    const published = await client.publishVersion(created.containerVersion.path);
    if (published.compilerError) throw new Error("Tag Manager could not publish the new version.");
    const version = published.containerVersion ?? created.containerVersion;

    return {
      ...base,
      status: "published",
      tagAction,
      versionId: version.containerVersionId,
      versionUrl: version.tagManagerUrl ?? null,
    };
  } finally {
    if (!consumed) {
      // Leave no Leadlogr workspace behind: free containers only get three.
      await client.deleteWorkspace(workspace.path).catch(() => undefined);
    }
  }
}
