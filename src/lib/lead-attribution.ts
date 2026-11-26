/**
 * How a lead’s channel (`source`) is decided at capture time.
 *
 * Click IDs win first (paid). Google Business Profile / Maps referrers are
 * separated from Direct so reports can show Google, Direct and Google My
 * Business side by side instead of dumping organic Maps traffic into Direct.
 */

export const LEAD_SOURCES = [
  "Google",
  "Google My Business",
  "Meta",
  "LinkedIn",
  "Microsoft",
  "Direct",
] as const;

export type LeadSourceName = (typeof LEAD_SOURCES)[number];

const GMB_REFERRER =
  /(?:^|\.)(?:google\.[^/]+\/maps|maps\.google\.|business\.google\.|google\.com\/local|g\.page\/|google\.[^/]+\/.*(?:place|maps))/i;

const GMB_UTM_SOURCE = /^(google.?my.?business|google.?business|gmb|maps)$/i;
const GMB_UTM_MEDIUM = /^(organic|local|maps|yext|gmb)$/i;

export function isGoogleMyBusinessReferrer(referrer: string | null | undefined): boolean {
  const ref = String(referrer ?? "").trim();
  if (!ref) return false;
  try {
    const hostPath = ref.includes("://") ? new URL(ref).host + new URL(ref).pathname : ref;
    return GMB_REFERRER.test(hostPath) || GMB_REFERRER.test(ref);
  } catch {
    return GMB_REFERRER.test(ref);
  }
}

export function inferLeadSource(input: {
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  fbclid?: string | null;
  liFatId?: string | null;
  msclkid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  referrerUrl?: string | null;
  /** Tracker-supplied source; used only when it is already a known paid channel. */
  hinted?: string | null;
}): LeadSourceName {
  if (input.gclid || input.wbraid || input.gbraid) return "Google";
  if (input.fbclid) return "Meta";
  if (input.liFatId) return "LinkedIn";
  if (input.msclkid) return "Microsoft";

  const utmSource = String(input.utmSource ?? "").trim();
  const utmMedium = String(input.utmMedium ?? "").trim();
  if (GMB_UTM_SOURCE.test(utmSource) || (utmSource.toLowerCase() === "google" && GMB_UTM_MEDIUM.test(utmMedium))) {
    return "Google My Business";
  }
  if (isGoogleMyBusinessReferrer(input.referrerUrl)) return "Google My Business";

  const hinted = String(input.hinted ?? "").trim();
  const known = LEAD_SOURCES.find((s) => s.toLowerCase() === hinted.toLowerCase());
  if (known && known !== "Direct") return known;

  return "Direct";
}

/** Prefer an explicit campaign field, then the UTM campaign. */
export function resolveCampaignName(
  campaignName: string | null | undefined,
  utmCampaign: string | null | undefined,
): string | null {
  const named = String(campaignName ?? "").trim();
  if (named) return named;
  const utm = String(utmCampaign ?? "").trim();
  return utm || null;
}
