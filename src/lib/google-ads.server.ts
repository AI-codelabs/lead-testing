/**
 * Minimal Google Ads REST API client for offline click-conversion uploads.
 * Server-only.
 *
 * Auth model (scalable, one app for all clients):
 * - App-level OAuth credentials live in env (one set, shared across workspaces):
 *     GOOGLE_ADS_OAUTH_CLIENT_ID
 *     GOOGLE_ADS_OAUTH_CLIENT_SECRET
 *     GOOGLE_ADS_DEVELOPER_TOKEN
 * - Per-workspace refresh token is stored in `google_ads_settings.oauth_refresh_token`
 *   after the user clicks "Connect Google Ads" and completes Google's consent popup.
 * - We exchange the refresh token for a short-lived access token on every call.
 */

const API_VERSION = "v21";

export type GoogleAdsAppCreds = {
  developerToken: string;
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
};

/** App-level creds shared by all workspaces. Stored in env, set once by Leadlogr. */
export function readGoogleAdsAppCreds(): GoogleAdsAppCreds | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  if (!developerToken || !clientId || !clientSecret) return null;
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
    "developer-token": creds.developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/\D/g, "");
  return headers;
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

  const body = { conversions: [conversion], partialFailure: true, validateOnly: false };

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
    throw new Error(`list_accessible_customers_failed: ${resp.status} ${text.slice(0, 300)}`);
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

export type ConversionActionRow = { id: string; name: string; category: string; status: string };

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
          SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.status
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
    throw new Error(`list_conversion_actions_failed: ${resp.status} ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { results?: Array<{ conversionAction?: { id?: string; name?: string; category?: string; status?: string } }> };
  return (json.results ?? []).flatMap((r) => {
    const ca = r.conversionAction;
    if (!ca?.id) return [];
    return [{ id: String(ca.id), name: ca.name ?? "", category: ca.category ?? "", status: ca.status ?? "" }];
  });
}
