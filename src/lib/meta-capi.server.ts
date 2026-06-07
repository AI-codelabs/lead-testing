/**
 * Minimal Meta Conversions API client. Server-only.
 *
 * Auth model: per-workspace Pixel ID + long-lived System User access token
 * pasted by the user in /app/integrations/meta-ads. No OAuth round-trip.
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const GRAPH_VERSION = "v21.0";

export type MetaCapiCreds = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string | null;
};

export type MetaCapiEventInput = {
  eventName: string;
  eventTime: number; // unix seconds
  eventId?: string; // dedupe key
  eventSourceUrl?: string;
  actionSource?: "website" | "system_generated" | "other";
  userData: {
    email?: string;
    phone?: string;
    fbp?: string;
    fbc?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
  };
  value?: number;
  currency?: string;
  orderId?: string;
};

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** Build the `fbc` browser cookie value from a fbclid + click time. */
export function buildFbc(fbclid: string, clickTimeMs?: number): string {
  const ts = Math.floor((clickTimeMs ?? Date.now()) / 1);
  return `fb.1.${ts}.${fbclid}`;
}

export async function sendMetaCapiEvent(
  creds: MetaCapiCreds,
  input: MetaCapiEventInput,
): Promise<{ ok: boolean; status: number; request: unknown; response: unknown; error?: string }> {
  const ud: Record<string, unknown> = {};
  if (input.userData.email) ud.em = [await sha256Hex(input.userData.email)];
  if (input.userData.phone) ud.ph = [await sha256Hex(input.userData.phone.replace(/[^\d+]/g, "").replace(/^\+/, ""))];
  if (input.userData.fbp) ud.fbp = input.userData.fbp;
  if (input.userData.fbc) ud.fbc = input.userData.fbc;
  if (input.userData.clientIpAddress) ud.client_ip_address = input.userData.clientIpAddress;
  if (input.userData.clientUserAgent) ud.client_user_agent = input.userData.clientUserAgent;

  const customData: Record<string, unknown> = {};
  if (typeof input.value === "number") customData.value = input.value;
  if (input.currency) customData.currency = input.currency;
  if (input.orderId) customData.order_id = input.orderId;

  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime,
    action_source: input.actionSource ?? "website",
    user_data: ud,
  };
  if (input.eventId) event.event_id = input.eventId;
  if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;
  if (Object.keys(customData).length) event.custom_data = customData;

  const body: Record<string, unknown> = { data: [event] };
  if (creds.testEventCode) body.test_event_code = creds.testEventCode;

  const pixel = creds.pixelId.replace(/\D/g, "");
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events?access_token=${encodeURIComponent(creds.accessToken)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }

  // Don't log the access token back to the user / DB
  const safeRequest = { ...body, _url: `https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events` };

  if (!resp.ok) {
    const errMsg = (parsed as { error?: { message?: string } })?.error?.message;
    return { ok: false, status: resp.status, request: safeRequest, response: parsed, error: errMsg || `http_${resp.status}` };
  }
  return { ok: true, status: 200, request: safeRequest, response: parsed };
}

/** Lightweight credential check — sends a test_event_code event to verify pixel + token work. */
export async function verifyMetaCapi(creds: MetaCapiCreds): Promise<{ ok: boolean; error?: string }> {
  const r = await sendMetaCapiEvent(
    { ...creds, testEventCode: creds.testEventCode || "TEST12345" },
    {
      eventName: "Lead",
      eventTime: Math.floor(Date.now() / 1000),
      eventId: `verify-${Date.now()}`,
      actionSource: "system_generated",
      userData: {},
    },
  );
  return { ok: r.ok, error: r.error };
}
