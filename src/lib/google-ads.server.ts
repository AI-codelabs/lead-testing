/**
 * Minimal Google Ads REST API client for offline click-conversion uploads.
 * Server-only. Uses OAuth refresh-token flow (workspace-owner credentials)
 * + a developer token. One global app-level OAuth credential set is shared
 * across workspaces; the customer ID and conversion action IDs are per
 * workspace and stored in `google_ads_settings`.
 */

const API_VERSION = "v18";

export type GoogleAdsCreds = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type ClickConversionInput = {
  customerId: string; // "1234567890" (digits only)
  loginCustomerId?: string; // MCC manager, digits only
  conversionActionId: string; // numeric ID of the conversion action
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  conversionDateTime: string; // "YYYY-MM-DD HH:MM:SS+00:00"
  value?: number;
  currencyCode?: string;
  orderId?: string; // dedupe key on Google's side
  userIdentifiers?: Array<
    | { hashedEmail: string }
    | { hashedPhoneNumber: string }
  >;
};

export function readGoogleAdsCreds(): GoogleAdsCreds | null {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN;
  if (!developerToken || !clientId || !clientSecret || !refreshToken) return null;
  return { developerToken, clientId, clientSecret, refreshToken };
}

async function getAccessToken(creds: GoogleAdsCreds): Promise<string> {
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

/** SHA-256 then lowercase hex. Google requires lowercase hex hashes. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function formatConversionDateTime(date: Date, tzOffsetMinutes = 0): string {
  // Google requires "yyyy-MM-dd HH:mm:ss+HH:MM" in the account's timezone or with explicit offset.
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
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": creds.developerToken,
    "Content-Type": "application/json",
  };
  if (input.loginCustomerId) headers["login-customer-id"] = input.loginCustomerId.replace(/\D/g, "");

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  if (!resp.ok) {
    return { ok: false, status: resp.status, request: body, response: parsed, error: `http_${resp.status}` };
  }
  // Google returns 200 even on partial failures — check `partialFailureError`.
  const pfe = (parsed as { partialFailureError?: { message?: string } }).partialFailureError;
  if (pfe && pfe.message) {
    return { ok: false, status: 200, request: body, response: parsed, error: pfe.message };
  }
  return { ok: true, status: 200, request: body, response: parsed };
}
