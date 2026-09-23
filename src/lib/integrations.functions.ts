import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

/**
 * Ad platform configuration.
 *
 * Replaces google-ads-settings.functions.ts, meta-ads-settings.functions.ts and
 * integration-status.functions.ts. Google and Meta shared almost all of their
 * shape, so they are one table keyed by (organization, network) and one set of
 * functions rather than two near-identical copies.
 *
 * Credentials are never read or written here — they live in
 * public.ad_platform_credentials, which app_user has no grant on at all.
 */

export type AdNetwork = "google_ads" | "meta_ads";

export type AdPlatformSettings = {
  network: AdNetwork;
  enabled: boolean;
  accountId: string;
  secondaryId: string | null;
  testEventCode: string | null;
  defaultCurrency: string;
  actionNew: string | null;
  actionQualified: string | null;
  actionWon: string | null;
  actionLost: string | null;
  connectedEmail: string | null;
  connectedAt: string | null;
  /** Whether a usable credential exists. The credential itself never leaves the server. */
  connected: boolean;
};

type SettingsRow = {
  network: AdNetwork;
  enabled: boolean;
  account_id: string | null;
  secondary_id: string | null;
  test_event_code: string | null;
  default_currency: string;
  action_new: string | null;
  action_qualified: string | null;
  action_won: string | null;
  action_lost: string | null;
  connected_email: string | null;
  connected_at: string | null;
  connected: boolean;
};

const toSettings = (r: SettingsRow): AdPlatformSettings => ({
  network: r.network,
  enabled: r.enabled,
  accountId: r.account_id ?? "",
  secondaryId: r.secondary_id,
  testEventCode: r.test_event_code,
  defaultCurrency: r.default_currency,
  actionNew: r.action_new,
  actionQualified: r.action_qualified,
  actionWon: r.action_won,
  actionLost: r.action_lost,
  connectedEmail: r.connected_email,
  connectedAt: r.connected_at,
  connected: r.connected,
});

// EXISTS rather than selecting the token: the boolean is all the client needs,
// and app_user cannot read the credentials table anyway.
const SETTINGS_SELECT = `
  s.network, s.enabled, s.account_id, s.secondary_id, s.test_event_code,
  s.default_currency, s.action_new, s.action_qualified, s.action_won, s.action_lost,
  s.connected_email, s.connected_at,
  EXISTS (
    SELECT 1 FROM public.ad_platform_credentials c
     WHERE c.organization_id = s.organization_id
       AND c.network = s.network
       AND c.refresh_token IS NOT NULL
  ) AS connected
`;

export const listAdPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<AdPlatformSettings[]> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);
    const rows = await context.db.sql<SettingsRow>(
      `SELECT ${SETTINGS_SELECT}
         FROM public.ad_platform_settings s
        WHERE s.organization_id = $1
     ORDER BY s.network`,
      [organizationId],
    );
    return rows.map(toSettings);
  });

export const saveAdPlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      network: AdNetwork;
      enabled?: boolean;
      accountId?: string;
      secondaryId?: string | null;
      testEventCode?: string | null;
      defaultCurrency?: string;
      actionNew?: string | null;
      actionQualified?: string | null;
      actionWon?: string | null;
      actionLost?: string | null;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      if (data.network !== "google_ads" && data.network !== "meta_ads") {
        throw new Error("Unknown network");
      }
      // Google customer ids are 6-12 digits; Meta pixel ids are numeric too.
      if (data.accountId && !/^\d{6,20}$/.test(data.accountId.replace(/\D/g, ""))) {
        throw new Error("Account id must be 6–20 digits");
      }
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    // The write policy requires owner or admin, so a plain member's update
    // affects no rows and this reports it rather than failing silently.
    const rows = await context.db.sql<{ organization_id: string }>(
      `INSERT INTO public.ad_platform_settings AS s
         (organization_id, network, enabled, account_id, secondary_id, test_event_code,
          default_currency, action_new, action_qualified, action_won, action_lost)
       VALUES ($1, $2::ad_network, COALESCE($3, false), $4, $5, $6,
               COALESCE($7, 'EUR'), $8, $9, $10, $11)
       ON CONFLICT (organization_id, network) DO UPDATE SET
         enabled          = COALESCE($3,  s.enabled),
         account_id       = COALESCE($4,  s.account_id),
         secondary_id     = COALESCE($5,  s.secondary_id),
         test_event_code  = COALESCE($6,  s.test_event_code),
         default_currency = COALESCE($7,  s.default_currency),
         action_new       = COALESCE($8,  s.action_new),
         action_qualified = COALESCE($9,  s.action_qualified),
         action_won       = COALESCE($10, s.action_won),
         action_lost      = COALESCE($11, s.action_lost)
       RETURNING organization_id`,
      [
        organizationId,
        data.network,
        data.enabled ?? null,
        data.accountId ?? null,
        data.secondaryId ?? null,
        data.testEventCode ?? null,
        data.defaultCurrency ?? null,
        data.actionNew ?? null,
        data.actionQualified ?? null,
        data.actionWon ?? null,
        data.actionLost ?? null,
      ],
    );

    if (rows.length === 0) {
      throw new Error("Only owners and admins can change integrations");
    }
    return { ok: true };
  });

export type IntegrationStatuses = {
  incomingConnectedIds: string[];
  googleAdsConnected: boolean;
  metaAdsConnected: boolean;
};

/**
 * Which integrations this organization has actually used or connected.
 *
 * The Supabase version fetched every lead's raw_payload to derive the incoming
 * list. This asks Postgres for the distinct set instead.
 */
export const getIntegrationStatuses = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<IntegrationStatuses> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    const [incoming, connected] = await Promise.all([
      context.db.sql<{ integration_id: string }>(
        `SELECT DISTINCT COALESCE(NULLIF(raw_payload->>'integration_id', ''), 'gtm') AS integration_id
           FROM public.leads
          WHERE organization_id = $1`,
        [organizationId],
      ),
      context.db.sql<{ network: AdNetwork; connected: boolean }>(
        `SELECT s.network,
                EXISTS (
                  SELECT 1 FROM public.ad_platform_credentials c
                   WHERE c.organization_id = s.organization_id
                     AND c.network = s.network
                     AND c.refresh_token IS NOT NULL
                ) AS connected
           FROM public.ad_platform_settings s
          WHERE s.organization_id = $1`,
        [organizationId],
      ),
    ]);

    const KNOWN = ["gtm", "wordpress", "api", "zapier"];
    const isConnected = (n: AdNetwork) => connected.some((r) => r.network === n && r.connected);

    return {
      incomingConnectedIds: incoming
        .map((r) => r.integration_id)
        .filter((id) => KNOWN.includes(id)),
      googleAdsConnected: isConnected("google_ads"),
      metaAdsConnected: isConnected("meta_ads"),
    };
  });

/**
 * Begins the Google Ads OAuth flow and returns the consent URL.
 *
 * Replaces the old unauthenticated GET /api/public/oauth/google-ads/start,
 * which accepted a workspace key from the query string — anyone could have
 * bound their own Google account to another tenant's workspace. Membership is
 * now proven before the state row is written, and the state row is the only
 * thing that tells the callback which organization to attach the token to.
 */
export const startGoogleAdsOAuth = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; redirectOrigin: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (!data?.redirectOrigin) throw new Error("redirectOrigin is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    const isAdmin = await context.db.one<{ ok: boolean }>(
      `SELECT app.has_role($1, ARRAY['owner','admin']) AS ok`,
      [organizationId],
    );
    if (!isAdmin?.ok) throw new Error("Only owners and admins can connect integrations");

    const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("Google Ads OAuth is not configured on this server");

    const state =
      crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    const { withOwner } = await import("@/db");
    await withOwner((db) =>
      db.sql(
        `INSERT INTO public.oauth_states (state, organization_id, network)
         VALUES ($1, $2, 'google_ads')`,
        [state, organizationId],
      ),
    );

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", `${data.redirectOrigin}/api/public/oauth/google-ads/callback`);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", "https://www.googleapis.com/auth/adwords openid email profile");
    auth.searchParams.set("access_type", "offline");
    // Forces a refresh token to be issued, and shows the account picker.
    auth.searchParams.set("prompt", "consent select_account");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("state", state);

    return { url: auth.toString() };
  });

// --- network-specific wrappers ---------------------------------------------
// The UI pages are per-network, so these present the unified table in the shape
// each page expects. All of them are authenticated and membership-checked;
// the previous versions were neither.

async function oneNetwork(
  db: { one: <T>(t: string, p?: unknown[]) => Promise<T | null> },
  organizationId: string,
  network: AdNetwork,
): Promise<AdPlatformSettings | null> {
  const row = await db.one<SettingsRow>(
    `SELECT ${SETTINGS_SELECT}
       FROM public.ad_platform_settings s
      WHERE s.organization_id = $1 AND s.network = $2::ad_network`,
    [organizationId, network],
  );
  return row ? toSettings(row) : null;
}

/**
 * The per-network pages read snake_case fields named after the old two-table
 * layout. These views keep that contract so the UI did not have to change with
 * the schema; the unified shape is what the rest of the app uses.
 */
export type GoogleAdsSettingsView = {
  enabled: boolean;
  customer_id: string;
  login_customer_id: string | null;
  default_currency: string;
  conversion_action_new: string | null;
  conversion_action_qualified: string | null;
  conversion_action_won: string | null;
  conversion_action_lost: string | null;
  oauth_email: string | null;
  connected_at: string | null;
  connected: boolean;
};

export type MetaAdsSettingsView = {
  enabled: boolean;
  pixel_id: string;
  test_event_code: string | null;
  default_currency: string;
  event_name_new: string | null;
  event_name_qualified: string | null;
  event_name_won: string | null;
  event_name_lost: string | null;
  connected_at: string | null;
  connected: boolean;
};

const toGoogleView = (s: AdPlatformSettings): GoogleAdsSettingsView => ({
  enabled: s.enabled,
  customer_id: s.accountId,
  login_customer_id: s.secondaryId,
  default_currency: s.defaultCurrency,
  conversion_action_new: s.actionNew,
  conversion_action_qualified: s.actionQualified,
  conversion_action_won: s.actionWon,
  conversion_action_lost: s.actionLost,
  oauth_email: s.connectedEmail,
  connected_at: s.connectedAt,
  connected: s.connected,
});

const toMetaView = (s: AdPlatformSettings): MetaAdsSettingsView => ({
  enabled: s.enabled,
  pixel_id: s.accountId,
  test_event_code: s.testEventCode,
  default_currency: s.defaultCurrency,
  event_name_new: s.actionNew,
  event_name_qualified: s.actionQualified,
  event_name_won: s.actionWon,
  event_name_lost: s.actionLost,
  connected_at: s.connectedAt,
  connected: s.connected,
});

export const getGoogleAdsSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const row = await oneNetwork(context.db, orgId, "google_ads");
    return { settings: row ? toGoogleView(row) : null };
  });

export const getMetaAdsSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const row = await oneNetwork(context.db, orgId, "meta_ads");
    return { settings: row ? toMetaView(row) : null };
  });

/** Accepts the per-network form shape the settings pages submit. */
export const saveGoogleAdsSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      enabled?: boolean;
      customer_id?: string;
      login_customer_id?: string | null;
      default_currency?: string;
      conversion_action_new?: string | null;
      conversion_action_qualified?: string | null;
      conversion_action_won?: string | null;
      conversion_action_lost?: string | null;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      if (data.customer_id && !/^\d{6,20}$/.test(data.customer_id.replace(/\D/g, ""))) {
        throw new Error("Customer id must be 6–20 digits");
      }
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    return writeSettings(context.db, orgId, "google_ads", {
      enabled: data.enabled,
      accountId: data.customer_id,
      secondaryId: data.login_customer_id,
      defaultCurrency: data.default_currency,
      actionNew: data.conversion_action_new,
      actionQualified: data.conversion_action_qualified,
      actionWon: data.conversion_action_won,
      actionLost: data.conversion_action_lost,
    });
  });

export const saveMetaAdsSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      enabled?: boolean;
      pixel_id?: string;
      access_token?: string;
      test_event_code?: string | null;
      default_currency?: string;
      event_name_new?: string | null;
      event_name_qualified?: string | null;
      event_name_won?: string | null;
      event_name_lost?: string | null;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);

    const result = await writeSettings(context.db, orgId, "meta_ads", {
      enabled: data.enabled,
      accountId: data.pixel_id,
      testEventCode: data.test_event_code,
      defaultCurrency: data.default_currency,
      actionNew: data.event_name_new,
      actionQualified: data.event_name_qualified,
      actionWon: data.event_name_won,
      actionLost: data.event_name_lost,
    });

    // Meta uses a pasted system-user token rather than OAuth. An empty string
    // means "leave the stored token alone".
    if (data.access_token && data.access_token.trim()) {
      const { withOwner } = await import("@/db");
      await withOwner((db) =>
        db.sql(
          `INSERT INTO public.ad_platform_credentials (organization_id, network, access_token)
           VALUES ($1, 'meta_ads', $2)
           ON CONFLICT (organization_id, network)
           DO UPDATE SET access_token = EXCLUDED.access_token`,
          [orgId, data.access_token!.trim()],
        ),
      );
    }

    return result;
  });

/** Shared upsert used by both per-network save functions. */
async function writeSettings(
  db: { sql: <T>(t: string, p?: unknown[]) => Promise<T[]> },
  organizationId: string,
  network: AdNetwork,
  v: {
    enabled?: boolean;
    accountId?: string | null;
    secondaryId?: string | null;
    testEventCode?: string | null;
    defaultCurrency?: string | null;
    actionNew?: string | null;
    actionQualified?: string | null;
    actionWon?: string | null;
    actionLost?: string | null;
  },
): Promise<{ ok: boolean }> {
  const rows = await db.sql<{ organization_id: string }>(
    `INSERT INTO public.ad_platform_settings AS s
       (organization_id, network, enabled, account_id, secondary_id, test_event_code,
        default_currency, action_new, action_qualified, action_won, action_lost)
     VALUES ($1, $2::ad_network, COALESCE($3, false), $4, $5, $6,
             COALESCE($7, 'EUR'), $8, $9, $10, $11)
     ON CONFLICT (organization_id, network) DO UPDATE SET
       enabled          = COALESCE($3,  s.enabled),
       account_id       = COALESCE($4,  s.account_id),
       secondary_id     = COALESCE($5,  s.secondary_id),
       test_event_code  = COALESCE($6,  s.test_event_code),
       default_currency = COALESCE($7,  s.default_currency),
       action_new       = COALESCE($8,  s.action_new),
       action_qualified = COALESCE($9,  s.action_qualified),
       action_won       = COALESCE($10, s.action_won),
       action_lost      = COALESCE($11, s.action_lost)
     RETURNING organization_id`,
    [
      organizationId, network,
      v.enabled ?? null, v.accountId ?? null, v.secondaryId ?? null, v.testEventCode ?? null,
      v.defaultCurrency ?? null, v.actionNew ?? null, v.actionQualified ?? null,
      v.actionWon ?? null, v.actionLost ?? null,
    ],
  );

  if (rows.length === 0) throw new Error("Only owners and admins can change integrations");
  return { ok: true };
}

/** Forgets the stored credential. The settings row survives so config is kept. */
async function disconnect(organizationId: string, network: AdNetwork) {
  const { withOwner } = await import("@/db");
  await withOwner(async (db) => {
    await db.sql(
      `DELETE FROM public.ad_platform_credentials
        WHERE organization_id = $1 AND network = $2::ad_network`,
      [organizationId, network],
    );
    await db.sql(
      `UPDATE public.ad_platform_settings
          SET enabled = false, connected_email = NULL, connected_at = NULL
        WHERE organization_id = $1 AND network = $2::ad_network`,
      [organizationId, network],
    );
  });
  return { ok: true };
}

export const disconnectGoogleAds = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const allowed = await context.db.one<{ ok: boolean }>(
      `SELECT app.has_role($1, ARRAY['owner','admin']) AS ok`, [orgId]);
    if (!allowed?.ok) throw new Error("Only owners and admins can disconnect integrations");
    return disconnect(orgId, "google_ads");
  });

export const disconnectMetaAds = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const allowed = await context.db.one<{ ok: boolean }>(
      `SELECT app.has_role($1, ARRAY['owner','admin']) AS ok`, [orgId]);
    if (!allowed?.ok) throw new Error("Only owners and admins can disconnect integrations");
    return disconnect(orgId, "meta_ads");
  });

/** Reads a credential on the owner connection, after membership is proven. */
async function credentialFor(organizationId: string, network: AdNetwork) {
  const { withOwner } = await import("@/db");
  return withOwner((db) =>
    db.one<{ refresh_token: string | null; access_token: string | null }>(
      `SELECT refresh_token, access_token FROM public.ad_platform_credentials
        WHERE organization_id = $1 AND network = $2::ad_network`,
      [organizationId, network],
    ),
  );
}

export type GoogleAdsCustomer = {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
};

export const listGoogleAdsCustomers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ customers: GoogleAdsCustomer[]; error: string | null }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const { buildGoogleAdsCreds, listAccessibleCustomers, getCustomerInfo } =
      await import("./google-ads.server");

    const cred = await credentialFor(orgId, "google_ads");
    const creds = buildGoogleAdsCreds(cred?.refresh_token);
    if (!creds) return { customers: [], error: "not_connected" };

    try {
      const ids = await listAccessibleCustomers(creds);
      const infos = await Promise.all(ids.map((id) => getCustomerInfo(creds, id).catch(() => null)));
      return {
        customers: infos.map(
          (c, i) =>
            c ?? {
              id: ids[i],
              descriptiveName: "(no access details)",
              currencyCode: "",
              timeZone: "",
              manager: false,
            },
        ),
        error: null,
      };
    } catch (e) {
      return { customers: [], error: e instanceof Error ? e.message : "list_failed" };
    }
  });

export const listGoogleAdsConversionActions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; customerId: string; loginCustomerId?: string }) => {
    if (!data?.organizationId || !data?.customerId) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const { buildGoogleAdsCreds, listConversionActions } = await import("./google-ads.server");

    const cred = await credentialFor(orgId, "google_ads");
    const creds = buildGoogleAdsCreds(cred?.refresh_token);
    if (!creds) return { actions: [], error: "not_connected" as string | null };

    try {
      const actions = await listConversionActions(creds, data.customerId, data.loginCustomerId);
      return { actions, error: null as string | null };
    } catch (e) {
      return { actions: [], error: e instanceof Error ? e.message : "list_failed" };
    }
  });

export const testMetaAdsConnection = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const settings = await oneNetwork(context.db, orgId, "meta_ads");
    const cred = await credentialFor(orgId, "meta_ads");
    if (!settings?.accountId || !cred?.access_token) {
      return { ok: false, error: "not_connected" };
    }
    const { verifyMetaCapi } = await import("./meta-capi.server");
    return verifyMetaCapi({
      pixelId: settings.accountId,
      accessToken: cred.access_token,
      testEventCode: settings.testEventCode,
    });
  });

export type ConversionUploadRow = {
  id: string;
  lead_id: string;
  network: AdNetwork;
  stage: string;
  status: string;
  value: string | null;
  currency: string | null;
  click_id_type: string | null;
  error: string | null;
  attempted_at: string | null;
  succeeded_at: string | null;
};

export const listConversionUploads = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; limit?: number }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return { organizationId: data.organizationId, limit: Math.min(data.limit ?? 50, 200) };
  })
  .handler(async ({ data, context }): Promise<{ uploads: ConversionUploadRow[] }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const uploads = await context.db.sql<ConversionUploadRow>(
      `SELECT id, lead_id, network, stage::text AS stage, status::text AS status,
              value, currency, click_id_type, error, attempted_at, succeeded_at
         FROM public.conversion_uploads
        WHERE organization_id = $1
     ORDER BY COALESCE(attempted_at, created_at) DESC
        LIMIT $2`,
      [orgId, data.limit],
    );
    return { uploads };
  });
