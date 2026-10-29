/**
 * Minimal LinkedIn Conversions API client. Server-only.
 *
 * Auth model: per-workspace conversion rule URN + access token pasted by the
 * user, the same shape as Meta rather than Google's OAuth round-trip. That is
 * deliberate: an advertiser can generate a token for their own ad account
 * directly in Campaign Manager without a developer application, an approval
 * queue or a review, and those tokens do not expire. The partner path (a
 * LinkedIn app, Company Page verification and a 3-legged OAuth flow) buys a
 * nicer connect button and nothing else functional, so it can wait.
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/conversions/conversions-api
 */

/**
 * LinkedIn dates its API versions and supports each for a minimum of one year.
 * 202609 is the current release; 202510 sunsets on 15 October 2026. A retired
 * version is rejected outright, so this needs raising roughly annually.
 */
const API_VERSION = "202609";
const BASE = "https://api.linkedin.com/rest";

export type LinkedInAdsCreds = {
  /** urn:lla:llaPartnerConversion:1234567 — one rule per thing being measured. */
  conversionUrn: string;
  accessToken: string;
};

export type LinkedInConversionInput = {
  /** When the conversion happened, unix milliseconds. LinkedIn wants ms, not seconds. */
  conversionHappenedAt: number;
  /** Dedupe key. Re-sending the same one replaces rather than double-counts. */
  eventId?: string;
  value?: number;
  currency?: string;
  /** SHA-256 of the lowercased, trimmed email. Omitted when the lead left none. */
  hashedEmail?: string;
  /** First-party ad tracking id from the click. Not personal data in the way an email is. */
  liFatId?: string;
  /** Unhashed context LinkedIn uses to improve matching. */
  firstName?: string;
  lastName?: string;
  companyName?: string;
};

function headers(creds: LinkedInAdsCreds): Record<string, string> {
  return {
    Authorization: `Bearer ${creds.accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

/** Turns LinkedIn's error shape into one line, and names an HTML page for what it is. */
function linkedInError(prefix: string, status: number, body: string): string {
  if (/^\s*<(!doctype|html)/i.test(body)) {
    return `${prefix}: LinkedIn returned a page instead of an API response (HTTP ${status}). API_VERSION ${API_VERSION} has probably been sunset — raise it in linkedin-ads.server.ts.`;
  }
  try {
    const parsed = JSON.parse(body) as { message?: string; serviceErrorCode?: number };
    if (status === 401) {
      return `${prefix}: LinkedIn rejected the access token. Generate a new one in Campaign Manager and paste it again.`;
    }
    if (parsed.message) return `${prefix}: ${parsed.message}`;
  } catch {
    /* fall through */
  }
  return `${prefix}: ${status} ${body.slice(0, 300)}`;
}

/**
 * Sends one conversion.
 *
 * LinkedIn needs at least one user identifier and will reject the event
 * outright without one. The caller is responsible for deciding whether the
 * hashed email may be included; where it may not and no click id was captured
 * either, there is nothing to match on and the event should not be attempted.
 */
export async function sendLinkedInConversion(
  creds: LinkedInAdsCreds,
  input: LinkedInConversionInput,
): Promise<{ ok: boolean; error?: string }> {
  const userIds: Array<{ idType: string; idValue: string }> = [];
  if (input.liFatId) {
    userIds.push({ idType: "LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID", idValue: input.liFatId });
  }
  if (input.hashedEmail) {
    userIds.push({ idType: "SHA256_EMAIL", idValue: input.hashedEmail });
  }
  if (userIds.length === 0) {
    return { ok: false, error: "no_user_identifier" };
  }

  const userInfo: Record<string, string> = {};
  if (input.firstName) userInfo.firstName = input.firstName;
  if (input.lastName) userInfo.lastName = input.lastName;
  if (input.companyName) userInfo.companyName = input.companyName;

  const body: Record<string, unknown> = {
    conversion: creds.conversionUrn,
    conversionHappenedAt: input.conversionHappenedAt,
    user: {
      userIds,
      ...(Object.keys(userInfo).length > 0 ? { userInfo } : {}),
    },
  };
  if (input.eventId) body.eventId = input.eventId;
  if (input.value != null) {
    body.conversionValue = {
      currencyCode: input.currency || "EUR",
      // LinkedIn wants the amount as a string.
      amount: String(input.value),
    };
  }

  let resp: Response;
  try {
    resp = await fetch(`${BASE}/conversionEvents`, {
      method: "POST",
      headers: headers(creds),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: `linkedin_request_failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!resp.ok) {
    return { ok: false, error: linkedInError("linkedin_conversion_failed", resp.status, await resp.text()) };
  }
  return { ok: true };
}

/**
 * Checks the pasted credentials before they are saved.
 *
 * Reads the conversion rule back rather than sending a throwaway conversion:
 * a test event would land in the advertiser's reporting and cannot be removed.
 */
export async function verifyLinkedInAds(
  creds: LinkedInAdsCreds,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  if (!/^urn:lla:llaPartnerConversion:\d+$/.test(creds.conversionUrn.trim())) {
    return {
      ok: false,
      error: "That does not look like a conversion rule URN. It should read urn:lla:llaPartnerConversion: followed by digits.",
    };
  }
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/conversions/${encodeURIComponent(creds.conversionUrn.trim())}`, {
      headers: headers(creds),
    });
  } catch (e) {
    return { ok: false, error: `linkedin_request_failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!resp.ok) {
    return { ok: false, error: linkedInError("linkedin_verify_failed", resp.status, await resp.text()) };
  }
  try {
    const json = (await resp.json()) as { name?: string };
    return { ok: true, name: json.name };
  } catch {
    return { ok: true };
  }
}
