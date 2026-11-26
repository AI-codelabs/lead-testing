import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * Google Tag Manager: connect, pick a container, install and publish the
 * Leadlogr tracker, disconnect.
 *
 * Deliberately its own consent, not more scopes on the Google Ads one: a
 * workspace that only reports conversions to Google Ads should never be asked
 * to let Leadlogr publish to its website. The refresh token is stored in
 * ad_platform_credentials under network 'google_tag_manager' (app_user has no
 * grant there); everything else is in tag_manager_installs.
 */

export type TagManagerStatus = {
  connected: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  canManage: boolean;
  accountId: string | null;
  containerId: string | null;
  containerPublicId: string | null;
  containerName: string | null;
  containerUrl: string | null;
  lastVersionId: string | null;
  lastVersionUrl: string | null;
  lastPublishedAt: string | null;
  lastResult: string | null;
};

type InstallRow = {
  connected_email: string | null;
  connected_at: string | null;
  account_id: string | null;
  container_id: string | null;
  container_public_id: string | null;
  container_name: string | null;
  container_url: string | null;
  last_version_id: string | null;
  last_version_url: string | null;
  last_published_at: string | null;
  last_result: string | null;
};

type Ctx = { db: { one: <T>(t: string, p?: unknown[]) => Promise<T | null> } };

async function requireAdmin(context: Ctx, organizationId: string, verb: string) {
  const orgId = await requireOrganization(context.db, organizationId);
  const ok = await context.db.one<{ ok: boolean }>(
    `SELECT app.has_role($1, ARRAY['owner','admin']) AS ok`,
    [orgId],
  );
  if (!ok?.ok) throw new Error(`Only owners and admins can ${verb}`);
  return orgId;
}

async function storedRefreshToken(organizationId: string): Promise<string | null> {
  const { withOwner } = await import("@/db");
  const row = await withOwner((db) =>
    db.one<{ refresh_token: string | null }>(
      `SELECT refresh_token FROM public.ad_platform_credentials
        WHERE organization_id = $1 AND network = 'google_tag_manager'`,
      [organizationId],
    ),
  );
  return row?.refresh_token ?? null;
}

async function clientFor(organizationId: string) {
  const { buildGoogleAdsCreds } = await import("./google-ads.server");
  const { TagManagerClient } = await import("./google-tag-manager.server");
  const creds = buildGoogleAdsCreds(await storedRefreshToken(organizationId));
  return creds ? new TagManagerClient(creds) : null;
}

function reason(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes("invalid_grant")) {
    return "Google no longer accepts the stored Tag Manager authorization. Disconnect and connect again.";
  }
  return raw || "Something went wrong talking to Google Tag Manager.";
}

export const getTagManagerStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<TagManagerStatus> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const [row, connected, admin] = await Promise.all([
      context.db.one<InstallRow>(
        `SELECT connected_email, connected_at, account_id, container_id, container_public_id,
                container_name, container_url, last_version_id, last_version_url,
                last_published_at, last_result
           FROM public.tag_manager_installs WHERE organization_id = $1`,
        [orgId],
      ),
      context.db.one<{ connected: boolean }>(
        `SELECT app.ad_platform_connected($1, 'google_tag_manager') AS connected`,
        [orgId],
      ),
      context.db.one<{ ok: boolean }>(`SELECT app.has_role($1, ARRAY['owner','admin']) AS ok`, [
        orgId,
      ]),
    ]);
    return {
      connected: !!connected?.connected,
      connectedEmail: row?.connected_email ?? null,
      connectedAt: row?.connected_at ?? null,
      canManage: !!admin?.ok,
      accountId: row?.account_id ?? null,
      containerId: row?.container_id ?? null,
      containerPublicId: row?.container_public_id ?? null,
      containerName: row?.container_name ?? null,
      containerUrl: row?.container_url ?? null,
      lastVersionId: row?.last_version_id ?? null,
      lastVersionUrl: row?.last_version_url ?? null,
      lastPublishedAt: row?.last_published_at ?? null,
      lastResult: row?.last_result ?? null,
    };
  });

/**
 * Begins the Tag Manager consent and returns Google's URL. Same pattern as
 * startGoogleAdsOAuth: membership and role are proven before the single-use
 * state row is written, and that row alone tells the callback which workspace
 * the grant belongs to.
 */
export const startTagManagerOAuth = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; redirectOrigin: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (!data?.redirectOrigin) throw new Error("redirectOrigin is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const orgId = await requireAdmin(context, data.organizationId, "connect integrations");

    const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("Google OAuth is not configured on this server");

    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { withOwner } = await import("@/db");
    await withOwner((db) =>
      db.sql(
        `INSERT INTO public.oauth_states (state, organization_id, network)
         VALUES ($1, $2, 'google_tag_manager')`,
        [state, orgId],
      ),
    );

    const { tagManagerScopes, GTM_CALLBACK_PATH } = await import("./google-tag-manager.server");
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", `${data.redirectOrigin}${GTM_CALLBACK_PATH}`);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", tagManagerScopes());
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent select_account");
    // No include_granted_scopes: this token should carry the Tag Manager
    // scopes only, never the Google Ads one granted in a different flow.
    auth.searchParams.set("state", state);
    return { url: auth.toString() };
  });

export type TagManagerAccountOption = { accountId: string; name: string };
export type TagManagerContainerOption = {
  accountId: string;
  containerId: string;
  name: string;
  publicId: string;
  tagManagerUrl: string | null;
};

export const listTagManagerAccounts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ accounts: TagManagerAccountOption[]; error: string | null }> => {
      const orgId = await requireAdmin(context, data.organizationId, "manage Tag Manager");
      const client = await clientFor(orgId);
      if (!client) return { accounts: [], error: "not_connected" };
      try {
        const accounts = await client.listAccounts();
        return {
          accounts: accounts.map((a) => ({ accountId: a.accountId, name: a.name })),
          error: null,
        };
      } catch (e) {
        return { accounts: [], error: reason(e) };
      }
    },
  );

export const listTagManagerContainers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; accountId: string }) => {
    if (!data?.organizationId || !data?.accountId) throw new Error("Invalid input");
    return data;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ containers: TagManagerContainerOption[]; error: string | null }> => {
      const orgId = await requireAdmin(context, data.organizationId, "manage Tag Manager");
      const client = await clientFor(orgId);
      if (!client) return { containers: [], error: "not_connected" };
      try {
        const containers = await client.listWebContainers(data.accountId);
        return {
          containers: containers.map((c) => ({
            accountId: c.accountId,
            containerId: c.containerId,
            name: c.name,
            publicId: c.publicId,
            tagManagerUrl: c.tagManagerUrl,
          })),
          error: null,
        };
      } catch (e) {
        return { containers: [], error: reason(e) };
      }
    },
  );

export type InstallTagManagerResult =
  | {
      ok: true;
      status: "published" | "unchanged";
      tagAction: "created" | "updated" | "unchanged";
      triggerAction: "created" | "reused";
      containerName: string;
      containerPublicId: string;
      containerUrl: string | null;
      versionId: string | null;
      versionUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Creates or updates the Leadlogr tag in the chosen container and publishes it.
 *
 * The ingest key is read here, not taken from the browser, so the tag can only
 * ever carry this workspace's own key. The origin the snippet points at is the
 * Leadlogr deployment the admin is using, the same one the copy-paste snippet
 * on the tracking page shows.
 */
export const installTagManagerTracker = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      accountId: string;
      containerId: string;
      origin: string;
      endpoint?: string;
      debug: boolean;
      allowDynamicForms: boolean;
    }) => {
      if (!data?.organizationId || !data?.accountId || !data?.containerId || !data?.origin) {
        throw new Error("Invalid input");
      }
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<InstallTagManagerResult> => {
    const orgId = await requireAdmin(context, data.organizationId, "publish to Tag Manager");

    const keyRow = await context.db.one<{ ingest_key: string }>(
      `SELECT ingest_key FROM public.organization_settings WHERE organization_id = $1`,
      [orgId],
    );
    if (!keyRow?.ingest_key) return { ok: false, error: "This workspace has no ingest key yet." };

    const client = await clientFor(orgId);
    if (!client) return { ok: false, error: "Connect Google Tag Manager first." };

    let origin: string;
    try {
      origin = new URL(data.origin).origin;
    } catch {
      return { ok: false, error: "Invalid Leadlogr origin." };
    }

    const { installAndPublishTracker } = await import("./google-tag-manager.server");
    const { withOwner } = await import("@/db");
    try {
      const result = await installAndPublishTracker(client, {
        accountId: data.accountId,
        containerId: data.containerId,
        snippet: {
          ingestKey: keyRow.ingest_key,
          endpoint: data.endpoint?.trim() || `${origin}/api/public/leads/collect`,
          trackerSrc: `${origin}/api/public/tracker/v1`,
          integrationId: "gtm",
          debug: !!data.debug,
          featureFlags: { allowDynamicForms: !!data.allowDynamicForms },
        },
      });

      await withOwner((db) =>
        db.sql(
          `INSERT INTO public.tag_manager_installs AS t
             (organization_id, account_id, container_id, container_public_id, container_name,
              container_url, last_version_id, last_version_url, last_published_at, last_result)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN now() END, $10)
           ON CONFLICT (organization_id) DO UPDATE SET
             account_id = EXCLUDED.account_id,
             container_id = EXCLUDED.container_id,
             container_public_id = EXCLUDED.container_public_id,
             container_name = EXCLUDED.container_name,
             container_url = EXCLUDED.container_url,
             last_version_id = COALESCE(EXCLUDED.last_version_id, t.last_version_id),
             last_version_url = COALESCE(EXCLUDED.last_version_url, t.last_version_url),
             last_published_at = COALESCE(EXCLUDED.last_published_at, t.last_published_at),
             last_result = EXCLUDED.last_result`,
          [
            orgId,
            result.container.accountId,
            result.container.containerId,
            result.container.publicId,
            result.container.name,
            result.containerUrl,
            result.versionId,
            result.versionUrl,
            result.status === "published",
            result.status,
          ],
        ),
      );

      return {
        ok: true,
        status: result.status,
        tagAction: result.tagAction,
        triggerAction: result.triggerAction,
        containerName: result.container.name,
        containerPublicId: result.container.publicId,
        containerUrl: result.containerUrl,
        versionId: result.versionId,
        versionUrl: result.versionUrl,
      };
    } catch (e) {
      const error = reason(e);
      await withOwner((db) =>
        db.sql(
          `INSERT INTO public.tag_manager_installs AS t (organization_id, last_result)
           VALUES ($1, $2)
           ON CONFLICT (organization_id) DO UPDATE SET last_result = EXCLUDED.last_result`,
          [orgId, `error: ${error}`.slice(0, 500)],
        ),
      ).catch(() => undefined);
      return { ok: false, error };
    }
  });

/**
 * Forgets the Tag Manager grant and asks Google to revoke it.
 *
 * Google keeps one authorization per Google account per OAuth client, so
 * revoking it also ends any other Leadlogr connection made with the same
 * Google account (Google Ads here, or either integration in another
 * workspace). In that case our copy is still deleted, so Leadlogr can no
 * longer publish, but the grant is not revoked at Google, and the result
 * says so.
 *
 * The published tag is left in the container: it is the customer's site now,
 * and removing tracking without being asked would silently stop lead capture.
 */
export const disconnectTagManager = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; revokedAtGoogle: boolean; note: string | null }> => {
      const orgId = await requireAdmin(context, data.organizationId, "disconnect integrations");
      const { withOwner } = await import("@/db");
      return withOwner(async (db) => {
        const held = await db.one<{ refresh_token: string | null; connected_email: string | null }>(
          `SELECT c.refresh_token, t.connected_email
             FROM public.ad_platform_credentials c
        LEFT JOIN public.tag_manager_installs t ON t.organization_id = c.organization_id
            WHERE c.organization_id = $1 AND c.network = 'google_tag_manager'`,
          [orgId],
        );
        const { otherGoogleGrantHolders } = await import("./google-grant.server");
        const { decideGoogleRevoke } = await import("./google-grant");
        const decision = decideGoogleRevoke({
          network: "google_tag_manager",
          held: !!held?.refresh_token,
          otherHolders: held?.refresh_token
            ? await otherGoogleGrantHolders(db, orgId, "google_tag_manager", held.connected_email)
            : [],
        });

        await db.sql(
          `DELETE FROM public.ad_platform_credentials
            WHERE organization_id = $1 AND network = 'google_tag_manager'`,
          [orgId],
        );
        await db.sql(
          `UPDATE public.tag_manager_installs
              SET connected_email = NULL, connected_at = NULL
            WHERE organization_id = $1`,
          [orgId],
        );

        let revokedAtGoogle = false;
        let note = decision.note;
        if (decision.revoke && held?.refresh_token) {
          const { revokeGoogleGrant } = await import("./google-ads.server");
          revokedAtGoogle = await revokeGoogleGrant(held.refresh_token);
          if (!revokedAtGoogle) {
            console.warn("[disconnectTagManager] grant not revoked at Google", { orgId });
            note =
              "Leadlogr deleted its copy, but Google did not confirm the revocation. You can remove Leadlogr at myaccount.google.com/permissions.";
          }
        }
        return { ok: true as const, revokedAtGoogle, note };
      });
    },
  );
