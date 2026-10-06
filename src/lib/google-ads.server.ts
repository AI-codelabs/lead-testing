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

function googleAdsError(prefix: string, status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; details?: Array<{ errors?: Array<{ errorCode?: Record<string, string>; message?: string }> }> };
    };
    const detail = parsed.error?.details?.flatMap((d) => d.errors ?? [])?.[0];
    const authzCode = detail?.errorCode?.authorizationError;
    if (authzCode && PLATFORM_AUTHORIZATION_CODES.has(authzCode)) {
      console.warn(`[google-ads] platform-side authorization: ${authzCode} — ${detail?.message ?? ""}`);
      return PLATFORM_NOT_READY;
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
  } catch { /* keep raw fallback */ }
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

export type CustomerInfo = { id: string; descriptiveName: string; currencyCode: string; timeZone: string; manager: boolean };

/** Fetches descriptive info for one or more customer IDs (one GAQL call per ID). */
export async function getCustomerInfo(
  creds: GoogleAdsCreds,
  customerId: string,
  loginCustomerId?: string,
): Promise<CustomerInfo | null> {
  const accessToken = await getAccessToken(creds);
  const customer = customerId.replace(/\D/g, "");
  const resp = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customer}/googleAds:search`,
    {
      method: "POST",
      headers: gaHeaders(creds, accessToken, loginCustomerId ?? customer),
      body: JSON.stringify({
        query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
      }),
    },
  );
  if (!resp.ok) return null;
  const json = (await resp.json()) as { results?: Array<{ customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean } }> };
  const c = json.results?.[0]?.customer;
  if (!c?.id) return null;
  return {
    id: String(c.id),
    descriptiveName: c.descriptiveName ?? "",
    currencyCode: c.currencyCode ?? "",
    timeZone: c.timeZone ?? "",
    manager: !!c.manager,
  };
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
        pageSize: 1000,
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
        pageSize: 200,
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
