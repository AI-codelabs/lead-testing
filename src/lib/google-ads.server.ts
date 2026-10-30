/**
 * Minimal Google Ads REST API client for offline click-conversion uploads.
 * Server-only.
 *
 * Auth model (scalable, one app for all clients):
 * - App-level OAuth credentials live in env (one set, shared across workspaces):
 *     GOOGLE_ADS_OAUTH_CLIENT_ID
 *     GOOGLE_ADS_OAUTH_CLIENT_SECRET
 *     GOOGLE_ADS_DEVELOPER_TOKEN   (optional since 9 September 2026)
 * - Per-workspace refresh token is stored in `google_ads_settings.oauth_refresh_token`
 *   after the user clicks "Connect Google Ads" and completes Google's consent popup.
 * - We exchange the refresh token for a short-lived access token on every call.
 */

// Google supports roughly a year of versions and removes the rest; a retired
// one 404s with an HTML page, so every call fails and the account picker simply
// shows "0 accounts available" with nothing in the logs to explain it. v21 was
// already gone. Checked live on 6 October 2026: v22-v25 respond, v26 does not.
const API_VERSION = "v25";

export type GoogleAdsAppCreds = {
  /**
   * Optional. Google sunset developer tokens on 9 September 2026: the header is
   * accepted but ignored, and API access level now follows the Google Cloud
   * project the OAuth client belongs to. Still sent when set, because an
   * existing integration has no reason to stop.
   */
  developerToken?: string;
  clientId: string;
  clientSecret: string;
};

export type GoogleAdsCreds = GoogleAdsAppCreds & {
  refreshToken: string;
};

export type ClickConversionInput = {
  customerId: string;
  loginCustomerId?: string;
  conversionActionId: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  conversionDateTime: string;
  value?: number;
  currencyCode?: string;
  orderId?: string;
  userIdentifiers?: Array<
    | { hashedEmail: string }
    | { hashedPhoneNumber: string }
  >;
  /**
   * Runs the whole call — credentials, account, conversion action, payload —
   * and reports what would have happened without recording a conversion.
   */
  validateOnly?: boolean;
};

/**
 * What we ask Google for at consent time.
 *
 * `adwords` covers everything the product does today. The Data Manager API is
 * a separate service with a scope of its own, and since 15 June 2026 it is
 * where Google sends new conversion-upload integrations -- so we will need it,
 * but asking for it is not free: a scope the Cloud project cannot grant fails
 * the whole consent, and consent is currently the one part of this integration
 * that works. Google does not reveal which it is until someone has actually
 * signed in, so this stays opt-in until a real round-trip has proved it.
 *
 * To try it: enable the Data Manager API on the Cloud project first, then set
 * GOOGLE_DATA_MANAGER_SCOPE=1 and reconnect one workspace. Every already
 * connected workspace needs that reconnect too, because a token only carries
 * the scopes it was issued with -- which is the whole reason this is a switch
 * and not simply added to the list.
 */
export const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";

export function googleAdsScopes(env: Record<string, string | undefined> = process.env): string {
  const flag = (env.GOOGLE_DATA_MANAGER_SCOPE ?? "").toLowerCase();
  const wanted = flag === "1" || flag === "true" || flag === "yes";
  return [
    "https://www.googleapis.com/auth/adwords",
    ...(wanted ? [DATA_MANAGER_SCOPE] : []),
    "openid",
    "email",
    "profile",
  ].join(" ");
}

/** App-level creds shared by all workspaces. Stored in env, set once by Leadlogr. */
export function readGoogleAdsAppCreds(): GoogleAdsAppCreds | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  // Requiring the developer token here used to make every upload skip with
  // "not_connected" on a correctly connected account, and sent anyone setting
  // this up hunting for a token new projects are no longer issued.
  if (!clientId || !clientSecret) return null;
  return { developerToken, clientId, clientSecret };
}

/** Combine app-level creds with a workspace's refresh token. */
export function buildGoogleAdsCreds(refreshToken: string | null | undefined): GoogleAdsCreds | null {
  const app = readGoogleAdsAppCreds();
  if (!app || !refreshToken) return null;
  return { ...app, refreshToken };
}

/** @deprecated Kept for back-compat; prefer buildGoogleAdsCreds(). */
export function readGoogleAdsCreds(): GoogleAdsCreds | null {
  return buildGoogleAdsCreds(process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN ?? null);
}

export async function getAccessToken(creds: GoogleAdsCreds): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`oauth_refresh_failed: ${resp.status} ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("oauth_refresh_failed: no access_token");
  return json.access_token;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function formatConversionDateTime(date: Date, tzOffsetMinutes = 0): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  const sign = tzOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffsetMinutes);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function gaHeaders(creds: GoogleAdsCreds, accessToken: string, loginCustomerId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (creds.developerToken) headers["developer-token"] = creds.developerToken;
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/\D/g, "");
  return headers;
}

/**
 * Failures caused by the Google Cloud project Leadlogr owns, not by anything
 * the customer configured.
 *
 * Their message names the access tier the project sits in. That is our
 * onboarding state, not theirs — they cannot act on it and should not be
 * reading about it — so these are reported as one neutral sentence and the real
 * text goes to the server log instead. When the project is approved these stop
 * occurring on their own and nothing else changes.
 */
const PLATFORM_AUTHORIZATION_CODES = new Set([
  "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
  "DEVELOPER_TOKEN_NOT_APPROVED",
  "DEVELOPER_TOKEN_PROHIBITED",
  "PROJECT_NOT_APPROVED_FOR_PRODUCTION",
]);

/**
 * A refresh token stops working when it is revoked, or when the OAuth client it
 * was issued by changes. Google says only "invalid_grant", which tells the
 * reader nothing about what to do.
 */
export const RECONNECT_NEEDED =
  "Google rejected the saved authorization. Disconnect and reconnect Google Ads.";

export const PLATFORM_NOT_READY =
  "Google is not accepting conversions for this workspace yet. We are completing " +
  "verification with Google — nothing for you to do, and your settings are saved.";

/**
 * Google counts a day's API operations against the Cloud project, not against
 * the workspace making the call — so one busy agency can exhaust the allowance
 * for every other customer. Explorer access allows 2,880 operations a day
 * against production accounts, which is small enough to reach by accident.
 *
 * Nobody reading this caused it and nobody reading it can clear it, so it says
 * what will happen instead: the allowance resets, and the work is not lost.
 */
export const PLATFORM_DAILY_LIMIT =
  "Google's daily limit for Leadlogr has been reached. This clears automatically " +
  "within 24 hours and nothing you have set up is affected — conversions still " +
  "waiting are sent once it does.";

/**
 * Since 15 June 2026 Google has refused UploadClickConversions to callers
 * without prior upload history, directing new integrations to the Data Manager
 * API instead. It arrives as NotAllowlistedError, and it is the first thing we
 * expect to hit once the project clears access review -- the account picker
 * will work and the upload behind it will not.
 */
export const UPLOAD_NOT_ALLOWLISTED =
  "Google is not yet accepting uploaded conversions for this workspace. Your " +
  "settings are saved and leads keep being collected — only the send-back to " +
  "Google is waiting.";

function googleAdsError(prefix: string, status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; status?: string; details?: Array<{ errors?: Array<{ errorCode?: Record<string, string>; message?: string }> }> };
    };
    const detail = parsed.error?.details?.flatMap((d) => d.errors ?? [])?.[0];
    const authzCode = detail?.errorCode?.authorizationError;
    if (authzCode && PLATFORM_AUTHORIZATION_CODES.has(authzCode)) {
      console.warn(`[google-ads] platform-side authorization: ${authzCode} — ${detail?.message ?? ""}`);
      return PLATFORM_NOT_READY;
    }
    const quotaCode = detail?.errorCode?.quotaError;
    if (quotaCode === "RESOURCE_EXHAUSTED" || parsed.error?.status === "RESOURCE_EXHAUSTED") {
      console.warn(`[google-ads] daily operation quota exhausted — ${detail?.message ?? parsed.error?.message ?? ""}`);
      return PLATFORM_DAILY_LIMIT;
    }
    const allowlistCode = detail?.errorCode?.notAllowlistedError;
    if (allowlistCode) {
      console.warn(`[google-ads] not allowlisted: ${allowlistCode} — ${detail?.message ?? ""}`);
      return UPLOAD_NOT_ALLOWLISTED;
    }
    const authCode = detail?.errorCode?.authenticationError;
    if (authCode === "NOT_ADS_USER") {
      return `${prefix}: The connected Google account is not associated with any Google Ads account. Re-authenticate and choose a Google user that has access to the Ads account, or add this user in Google Ads under Admin > Access and security.`;
    }
    if (authCode === "OAUTH_TOKEN_INVALID" || authCode === "OAUTH_TOKEN_REVOKED") {
      return `${prefix}: Google rejected the saved authorization. Disconnect and reconnect Google Ads.`;
    }
    const message = detail?.message || parsed.error?.message;
    if (message) return `${prefix}: ${message}`;
  } catch { /* fall through to the non-JSON handling below */ }

  // Google answers with an HTML error page, not JSON, when the URL itself is
  // not a route it serves — which in practice means the API version in
  // API_VERSION has been retired. That is a yearly event, and the last time it
  // happened the only signal was a wall of markup pasted out of the UI, so say
  // it plainly instead of showing the markup.
  if (/^\s*<(!doctype|html)/i.test(body)) {
    return `${prefix}: Google returned a page instead of an API response for ${API_VERSION} (HTTP ${status}). That version has almost certainly been retired — API_VERSION in google-ads.server.ts needs raising to one Google still serves.`;
  }
  return `${prefix}: ${status} ${body.slice(0, 300)}`;
}

export async function uploadClickConversion(
  creds: GoogleAdsCreds,
  input: ClickConversionInput,
): Promise<{ ok: boolean; status: number; request: unknown; response: unknown; error?: string }> {
  const accessToken = await getAccessToken(creds);
  const customer = input.customerId.replace(/\D/g, "");
  const action = `customers/${customer}/conversionActions/${input.conversionActionId.replace(/\D/g, "")}`;

  const conversion: Record<string, unknown> = {
    conversionAction: action,
    conversionDateTime: input.conversionDateTime,
  };
  if (input.gclid) conversion.gclid = input.gclid;
  if (input.wbraid) conversion.wbraid = input.wbraid;
  if (input.gbraid) conversion.gbraid = input.gbraid;
  if (typeof input.value === "number") conversion.conversionValue = input.value;
  if (input.currencyCode) conversion.currencyCode = input.currencyCode;
  if (input.orderId) conversion.orderId = input.orderId;
  if (input.userIdentifiers && input.userIdentifiers.length) {
    conversion.userIdentifiers = input.userIdentifiers;
  }

  const body = {
    conversions: [conversion],
    partialFailure: true,
    validateOnly: input.validateOnly === true,
  };

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customer}:uploadClickConversions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: gaHeaders(creds, accessToken, input.loginCustomerId),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  if (!resp.ok) {
    return { ok: false, status: resp.status, request: body, response: parsed, error: `http_${resp.status}` };
  }
  const pfe = (parsed as { partialFailureError?: { message?: string } }).partialFailureError;
  if (pfe && pfe.message) {
    return { ok: false, status: 200, request: body, response: parsed, error: pfe.message };
  }
  return { ok: true, status: 200, request: body, response: parsed };
}

/** Lists every customer ID the connected Google account can access. */
export async function listAccessibleCustomers(creds: GoogleAdsCreds): Promise<string[]> {
  const accessToken = await getAccessToken(creds);
  const resp = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    { headers: gaHeaders(creds, accessToken) },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(googleAdsError("list_accessible_customers_failed", resp.status, text));
  }
  const json = (await resp.json()) as { resourceNames?: string[] };
  return (json.resourceNames ?? []).map((rn) => rn.replace("customers/", ""));
}

export type AdsAccount = {
  id: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
  /** A manager (MCC). Conversions cannot be uploaded to one. */
  manager: boolean;
  /** 0 when the connected Google user is named on this account directly. */
  level: number;
  /** What to send as login-customer-id. Empty when the account needs none. */
  loginCustomerId: string;
  /** Descriptive name of that manager, for grouping the picker. */
  via: string;
};

type CustomerClientRow = Omit<AdsAccount, "loginCustomerId" | "via">;

/** One manager's whole subtree, following pages. */
async function queryCustomerClients(
  creds: GoogleAdsCreds,
  accessToken: string,
  managerId: string,
): Promise<CustomerClientRow[]> {
  const manager = managerId.replace(/\D/g, "");
  const out: CustomerClientRow[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${manager}/googleAds:search`,
      {
        method: "POST",
        headers: gaHeaders(creds, accessToken, manager),
        body: JSON.stringify({
          query: `
            SELECT customer_client.id, customer_client.descriptive_name,
                   customer_client.currency_code, customer_client.time_zone,
                   customer_client.manager, customer_client.level
            FROM customer_client
            WHERE customer_client.status = 'ENABLED'
          `,
          // No page size. v25 rejects it outright -- "Setting the page size is
          // not supported. Search Responses will have fixed page size of
          // '10000' rows" -- so asking for one is an error, not a hint.
          // nextPageToken still works, which is all the loop below needs.
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(googleAdsError("list_customer_clients_failed", resp.status, text));
    }
    const json = (await resp.json()) as {
      nextPageToken?: string;
      results?: Array<{
        customerClient?: {
          id?: string;
          descriptiveName?: string;
          currencyCode?: string;
          timeZone?: string;
          manager?: boolean;
          level?: string | number;
        };
      }>;
    };
    for (const r of json.results ?? []) {
      const c = r.customerClient;
      if (!c?.id) continue;
      out.push({
        id: String(c.id),
        descriptiveName: c.descriptiveName ?? "",
        currencyCode: c.currencyCode ?? "",
        timeZone: c.timeZone ?? "",
        manager: !!c.manager,
        level: Number(c.level ?? 0),
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return out;
}

/**
 * Every account the connected user can actually operate, not only the ones
 * they are named on.
 *
 * customers:listAccessibleCustomers returns accounts with DIRECT access only.
 * For an agency that is their MCCs plus the odd individually shared account --
 * never the clients underneath. A partner connected successfully, opened the
 * picker, and found seven entries, none of them the client he had just
 * connected: it sits two levels down inside their MCC, so it could never have
 * been there, and picking the MCC instead would upload conversions to the
 * manager rather than the client.
 *
 * customer_client, queried on a manager, returns that manager's whole subtree
 * at every level with names attached. So one call per accessible root replaces
 * one call per account AND reaches the accounts people actually want.
 */
export async function listAdsAccounts(
  creds: GoogleAdsCreds,
): Promise<{ accounts: AdsAccount[]; errors: string[] }> {
  const roots = await listAccessibleCustomers(creds);
  const accessToken = await getAccessToken(creds);
  const errors: string[] = [];
  const found = new Map<string, AdsAccount>();

  await Promise.all(
    roots.map(async (root) => {
      try {
        const rows = await queryCustomerClients(creds, accessToken, root);
        const self = rows.find((r) => r.level === 0);
        const viaName = self?.descriptiveName || root;
        for (const r of rows) {
          const candidate: AdsAccount = {
            ...r,
            loginCustomerId: r.id === root ? "" : root,
            via: r.id === root ? "" : viaName,
          };
          // Reaching an account directly beats reaching it through a manager,
          // and a shorter path beats a longer one: both mean fewer ways for the
          // upload to be refused later.
          const existing = found.get(r.id);
          if (!existing || candidate.level < existing.level) found.set(r.id, candidate);
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `customer_client_failed:${root}`);
      }
    }),
  );

  // Every root failing is a failure, not an empty account list. The picker used
  // to say "0 accounts available" for both, which told the customer nothing.
  if (found.size === 0 && errors.length > 0) throw new Error(errors[0]);

  const accounts = [...found.values()];
  accounts.sort(
    (a, b) =>
      a.via.localeCompare(b.via) ||
      Number(a.manager) - Number(b.manager) ||
      (a.descriptiveName || a.id).localeCompare(b.descriptiveName || b.id),
  );
  return { accounts, errors };
}

export type DailySpendRow = { day: string; costMicros: number; currency: string };

/**
 * Daily cost for an account over a date range.
 *
 * Queried from the `customer` resource rather than `campaign`, because the
 * dashboard reports what the account spent, not how it was divided. Cost comes
 * back in micros of the account's own currency — which is not necessarily the
 * workspace's, so the currency travels with every row.
 */
export async function fetchDailySpend(
  creds: GoogleAdsCreds,
  customerId: string,
  from: string,
  to: string,
  loginCustomerId?: string,
): Promise<DailySpendRow[]> {
  const accessToken = await getAccessToken(creds);
  const customer = customerId.replace(/\D/g, "");
  const resp = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customer}/googleAds:search`,
    {
      method: "POST",
      headers: gaHeaders(creds, accessToken, loginCustomerId),
      body: JSON.stringify({
        query: `
          SELECT segments.date, metrics.cost_micros, customer.currency_code
          FROM customer
          WHERE segments.date BETWEEN '${from}' AND '${to}'
          ORDER BY segments.date
        `,
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(googleAdsError("fetch_spend_failed", resp.status, text));
  }
  const json = (await resp.json()) as {
    results?: Array<{
      segments?: { date?: string };
      metrics?: { costMicros?: string | number };
      customer?: { currencyCode?: string };
    }>;
  };
  return (json.results ?? []).flatMap((r) => {
    const day = r.segments?.date;
    if (!day) return [];
    return [{
      day,
      costMicros: Number(r.metrics?.costMicros ?? 0),
      currency: r.customer?.currencyCode ?? "EUR",
    }];
  });
}

export type ConversionActionRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  type: string;
  /** Whether uploadClickConversions will accept it. */
  uploadable: boolean;
};

/** Lists conversion actions on a customer account via GAQL. */
export async function listConversionActions(
  creds: GoogleAdsCreds,
  customerId: string,
  loginCustomerId?: string,
): Promise<ConversionActionRow[]> {
  const accessToken = await getAccessToken(creds);
  const customer = customerId.replace(/\D/g, "");
  const resp = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customer}/googleAds:search`,
    {
      method: "POST",
      headers: gaHeaders(creds, accessToken, loginCustomerId),
      body: JSON.stringify({
        query: `
          SELECT conversion_action.id, conversion_action.name, conversion_action.category,
                 conversion_action.status, conversion_action.type
          FROM conversion_action
          WHERE conversion_action.status != 'REMOVED'
          ORDER BY conversion_action.name
        `,
      }),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(googleAdsError("list_conversion_actions_failed", resp.status, text));
  }
  const json = (await resp.json()) as {
    results?: Array<{
      conversionAction?: { id?: string; name?: string; category?: string; status?: string; type?: string };
    }>;
  };
  return (json.results ?? []).flatMap((r) => {
    const ca = r.conversionAction;
    if (!ca?.id) return [];
    return [{
      id: String(ca.id),
      name: ca.name ?? "",
      category: ca.category ?? "",
      status: ca.status ?? "",
      type: ca.type ?? "",
      // uploadClickConversions accepts only actions created for imported click
      // conversions. A website action listed beside them looks identical here
      // and fails at upload with INVALID_CONVERSION_ACTION, long after the
      // person who chose it has moved on.
      uploadable: ca.type === "UPLOAD_CLICKS",
    }];
  });
}
