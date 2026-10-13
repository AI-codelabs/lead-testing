import { createServerFn } from "@tanstack/react-start";
import { withOwner } from "@/db";
import {
  buildGoogleAdsCreds,
  uploadClickConversion,
  sha256Hex,
  formatConversionDateTime,
} from "./google-ads.server";
import { sendMetaCapiEvent, buildFbc } from "./meta-capi.server";
import type { DbStage } from "./lead-mapping";

/**
 * Conversion upload to Google Ads and Meta.
 *
 * Runs on the owner connection rather than a user-scoped one, because it needs
 * ad platform credentials that app_user is deliberately not granted, and
 * because it is triggered in the background where no session exists. The lead
 * id is resolved to its organization here — nothing about the tenant comes
 * from the caller.
 */

const STAGE_TO_ACTION_COLUMN: Record<DbStage, string | null> = {
  new: "action_new",
  contacted: null,
  qualified: "action_qualified",
  won: "action_won",
  lost: "action_lost",
  disqualified: "action_lost",
};

type LeadForUpload = {
  id: string;
  organization_id: string;
  stage: DbStage;
  email: string | null;
  phone: string | null;
  consent: string;
  name: string | null;
  company: string | null;
  li_fat_id: string | null;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  fbclid: string | null;
  fbp: string | null;
  won_value: string | null;
  currency: string;
  stage_changed_at: string | null;
  updated_at: string;
  created_at: string;
};

type SettingsForUpload = {
  enabled: boolean;
  account_id: string | null;
  secondary_id: string | null;
  default_currency: string;
  test_event_code: string | null;
  action: string | null;
  refresh_token: string | null;
  access_token: string | null;
};

/** Networks a conversion can be reported to. Mirrors the ad_network enum. */
type AdUploadNetwork = "google_ads" | "meta_ads" | "linkedin_ads";

async function loadContext(leadId: string, network: AdUploadNetwork, stage: DbStage) {
  const actionColumn = STAGE_TO_ACTION_COLUMN[stage];
  if (!actionColumn) return null;

  return withOwner(async (db) => {
    const lead = await db.one<LeadForUpload>(
      `SELECT id, organization_id, stage, email, phone, consent::text AS consent,
              name, company, li_fat_id,
              gclid, wbraid, gbraid, fbclid, fbp, won_value, currency,
              stage_changed_at, updated_at, created_at
         FROM public.leads WHERE id = $1`,
      [leadId],
    );
    if (!lead) return null;

    const settings = await db.one<SettingsForUpload>(
      `SELECT s.enabled, s.account_id, s.secondary_id, s.default_currency, s.test_event_code,
              s.${actionColumn} AS action,
              c.refresh_token, c.access_token
         FROM public.ad_platform_settings s
    LEFT JOIN public.ad_platform_credentials c
           ON c.organization_id = s.organization_id AND c.network = s.network
        WHERE s.organization_id = $1 AND s.network = $2::ad_network`,
      [lead.organization_id, network],
    );

    return { lead, settings };
  });
}

async function recordUpload(row: {
  organizationId: string;
  leadId: string;
  network: AdUploadNetwork;
  stage: DbStage;
  status: "sent" | "failed" | "skipped";
  conversionAction: string | null;
  value: number | null;
  currency: string | null;
  clickId: string | null;
  clickIdType: string | null;
  request: unknown;
  response: unknown;
  error: string | null;
}) {
  await withOwner((db) =>
    db.sql(
      `INSERT INTO public.conversion_uploads AS u
         (organization_id, lead_id, network, stage, status, conversion_action,
          value, currency, click_id, click_id_type,
          request_payload, response_payload, error, attempts, attempted_at, succeeded_at)
       VALUES ($1, $2, $3::ad_network, $4::lead_stage, $5::upload_status, $6,
               $7, $8, $9, $10, $11, $12, $13, 1, now(),
               CASE WHEN $5 = 'sent' THEN now() END)
       ON CONFLICT (lead_id, network, stage) DO UPDATE SET
         status           = EXCLUDED.status,
         conversion_action= EXCLUDED.conversion_action,
         value            = EXCLUDED.value,
         currency         = EXCLUDED.currency,
         click_id         = EXCLUDED.click_id,
         click_id_type    = EXCLUDED.click_id_type,
         request_payload  = EXCLUDED.request_payload,
         response_payload = EXCLUDED.response_payload,
         error            = EXCLUDED.error,
         attempts         = u.attempts + 1,
         attempted_at     = now(),
         succeeded_at     = CASE WHEN EXCLUDED.status = 'sent' THEN now() ELSE u.succeeded_at END`,
      [
        row.organizationId,
        row.leadId,
        row.network,
        row.stage,
        row.status,
        row.conversionAction,
        row.value,
        row.currency,
        row.clickId,
        row.clickIdType,
        JSON.stringify(row.request ?? null),
        JSON.stringify(row.response ?? null),
        row.error,
      ],
    ),
  );
}

type UploadResult = { ok: boolean; skipped?: boolean; reason?: string; error?: string };

/**
 * Whether a lead's own email and phone may be passed on to an ad platform.
 *
 * Recording the submission needs no consent: the visitor filled in a form to
 * reach the business, and the record is that enquiry. Handing those details to
 * Google or Meta to improve ad matching is a separate act with a separate
 * basis, and Google's EU User Consent Policy puts the duty to hold consent on
 * the advertiser — so this stays gated while the Ads API application is under
 * review.
 *
 * This is the only place consent still changes what happens. Lifting it later
 * means returning true here; nothing else needs touching. The conversion
 * itself uploads either way — only the identifiers are withheld.
 */
function mayShareIdentifiers(lead: { consent: string }): boolean {
  return lead.consent === "accepted";
}

async function uploadGoogleAds(leadId: string, stage: DbStage): Promise<UploadResult> {
  const ctx = await loadContext(leadId, "google_ads", stage);
  if (!ctx) return { ok: false, skipped: true, reason: "stage_not_reported" };

  const { lead, settings } = ctx;
  if (!settings?.enabled) return { ok: false, skipped: true, reason: "not_configured" };
  if (!settings.account_id) return { ok: false, skipped: true, reason: "no_customer_id" };
  if (!settings.action) return { ok: false, skipped: true, reason: `no_action_for:${stage}` };

  const creds = buildGoogleAdsCreds(settings.refresh_token);
  if (!creds) return { ok: false, skipped: true, reason: "not_connected" };

  // Only leads that came from a Google click. The integrations page has always
  // said so — "Direct/organic leads stay internal" — but nothing enforced it,
  // and uploadClickConversions accepts a conversion carrying only hashed
  // identifiers as an Enhanced Conversion for Lead. So a Direct, Meta or
  // LinkedIn lead with consent and an email was reported to Google as a
  // conversion, inflating the performance of campaigns that never produced it.
  if (!lead.gclid && !lead.wbraid && !lead.gbraid) {
    return { ok: false, skipped: true, reason: "no_google_click" };
  }

  const userIdentifiers: Array<{ hashedEmail: string } | { hashedPhoneNumber: string }> = [];
  if (mayShareIdentifiers(lead)) {
    if (lead.email) userIdentifiers.push({ hashedEmail: await sha256Hex(lead.email) });
    if (lead.phone) {
      userIdentifiers.push({ hashedPhoneNumber: await sha256Hex(lead.phone.replace(/[^\d+]/g, "")) });
    }
  }

  const value = stage === "won" && lead.won_value != null ? Number(lead.won_value) : undefined;
  const currency = value != null ? (settings.default_currency || lead.currency || "EUR") : undefined;

  // Wrapped: a throw here (an expired refresh token raises invalid_grant from
  // the token endpoint, not a response we can inspect) used to escape past
  // recordUpload, so the attempt left no trace at all. A broken connection
  // should be visible in the upload log, not silent.
  let result: Awaited<ReturnType<typeof uploadClickConversion>>;
  try {
    result = await uploadClickConversion(creds, {
      customerId: settings.account_id,
      loginCustomerId: settings.secondary_id ?? undefined,
      conversionActionId: settings.action,
      gclid: lead.gclid ?? undefined,
      wbraid: !lead.gclid && lead.wbraid ? lead.wbraid : undefined,
      gbraid: !lead.gclid && !lead.wbraid && lead.gbraid ? lead.gbraid : undefined,
      conversionDateTime: formatConversionDateTime(
        new Date(lead.stage_changed_at || lead.updated_at || lead.created_at),
      ),
      value,
      currencyCode: currency,
      orderId: `${lead.id}:${stage}`,
      userIdentifiers: userIdentifiers.length ? userIdentifiers : undefined,
    });
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      request: null,
      response: null,
      error: err instanceof Error ? err.message : "upload_threw",
    };
  }

  await recordUpload({
    organizationId: lead.organization_id,
    leadId: lead.id,
    network: "google_ads",
    stage,
    status: result.ok ? "sent" : "failed",
    conversionAction: settings.action,
    value: value ?? null,
    currency: currency ?? null,
    clickId: lead.gclid || lead.wbraid || lead.gbraid || null,
    clickIdType: lead.gclid ? "gclid" : lead.wbraid ? "wbraid" : lead.gbraid ? "gbraid" : null,
    request: result.request,
    response: result.response,
    error: result.error ?? null,
  });

  return { ok: result.ok, error: result.error ?? undefined };
}

async function uploadMeta(leadId: string, stage: DbStage): Promise<UploadResult> {
  const ctx = await loadContext(leadId, "meta_ads", stage);
  if (!ctx) return { ok: false, skipped: true, reason: "stage_not_reported" };

  const { lead, settings } = ctx;
  if (!settings?.enabled) return { ok: false, skipped: true, reason: "not_configured" };
  if (!settings.access_token || !settings.account_id) {
    return { ok: false, skipped: true, reason: "not_connected" };
  }
  if (!settings.action) return { ok: false, skipped: true, reason: `no_event_for:${stage}` };

  // The same rule on the other side: a lead reaches Meta only if it arrived
  // from a Meta click. fbp is deliberately not enough — that cookie is set for
  // anyone who has ever loaded the pixel, including people who came from
  // Google, so treating it as provenance would report leads to the wrong
  // network just as surely.
  if (!lead.fbclid) return { ok: false, skipped: true, reason: "no_meta_click" };

  const value = stage === "won" && lead.won_value != null ? Number(lead.won_value) : undefined;
  const currency = value != null ? (settings.default_currency || lead.currency || "EUR") : undefined;

  const withConsent = mayShareIdentifiers(lead);

  // Same reason as the Google path above: a throw must still be recorded.
  let result: Awaited<ReturnType<typeof sendMetaCapiEvent>>;
  try {
    result = await sendMetaCapiEvent(
    {
      pixelId: settings.account_id,
      accessToken: settings.access_token,
      testEventCode: settings.test_event_code,
    },
    {
      eventName: settings.action,
      eventId: `${lead.id}:${stage}`,
      eventTime: Math.floor(
        new Date(lead.stage_changed_at || lead.updated_at || lead.created_at).getTime() / 1000,
      ),
      actionSource: "system_generated",
      userData: {
        email: withConsent ? lead.email ?? undefined : undefined,
        phone: withConsent ? lead.phone ?? undefined : undefined,
        fbc: lead.fbclid ? buildFbc(lead.fbclid) : undefined,
        fbp: lead.fbp ?? undefined,
      },
      value,
      currency,
      orderId: `${lead.id}:${stage}`,
      },
    );
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      request: null,
      response: null,
      error: err instanceof Error ? err.message : "upload_threw",
    };
  }

  await recordUpload({
    organizationId: lead.organization_id,
    leadId: lead.id,
    network: "meta_ads",
    stage,
    status: result.ok ? "sent" : "failed",
    conversionAction: settings.action,
    value: value ?? null,
    currency: currency ?? null,
    clickId: lead.fbclid ?? null,
    clickIdType: lead.fbclid ? "fbclid" : null,
    request: result.request,
    response: result.response,
    error: result.error ?? null,
  });

  return { ok: result.ok, error: result.error ?? undefined };
}

async function uploadLinkedIn(leadId: string, stage: DbStage): Promise<UploadResult> {
  const ctx = await loadContext(leadId, "linkedin_ads", stage);
  if (!ctx) return { ok: false, skipped: true, reason: "stage_not_reported" };

  const { lead, settings } = ctx;
  if (!settings?.enabled) return { ok: false, skipped: true, reason: "not_configured" };
  if (!settings.access_token) return { ok: false, skipped: true, reason: "not_connected" };
  // For LinkedIn the per-stage action is the conversion rule URN itself.
  if (!settings.action) return { ok: false, skipped: true, reason: `no_conversion_rule_for:${stage}` };

  // Same provenance rule as the other two networks: only report a lead to the
  // network that produced it.
  if (!lead.li_fat_id) return { ok: false, skipped: true, reason: "no_linkedin_click" };

  const value = stage === "won" && lead.won_value != null ? Number(lead.won_value) : undefined;
  const currency = value != null ? (settings.default_currency || lead.currency || "EUR") : undefined;

  // The click id alone is a valid identifier, so a lead with no permission to
  // share an email is still reportable — unlike Meta, nothing is lost but the
  // match on email.
  const hashedEmail =
    mayShareIdentifiers(lead) && lead.email ? await sha256Hex(lead.email) : undefined;

  // The name is split only because LinkedIn takes the two halves separately;
  // a single-word name becomes a first name with no surname rather than being
  // dropped.
  const parts = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;

  let result: { ok: boolean; error?: string };
  try {
    const { sendLinkedInConversion: send } = await import("./linkedin-ads.server");
    result = await send(
      { conversionUrn: settings.action, accessToken: settings.access_token },
      {
        conversionHappenedAt: new Date(
          lead.stage_changed_at || lead.updated_at || lead.created_at,
        ).getTime(),
        eventId: `${lead.id}:${stage}`,
        value,
        currency,
        hashedEmail,
        liFatId: lead.li_fat_id,
        firstName,
        lastName,
        companyName: lead.company ?? undefined,
      },
    );
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "upload_threw" };
  }

  await recordUpload({
    organizationId: lead.organization_id,
    leadId: lead.id,
    network: "linkedin_ads",
    stage,
    status: result.ok ? "sent" : "failed",
    conversionAction: settings.action,
    value: value ?? null,
    currency: currency ?? null,
    clickId: lead.li_fat_id,
    clickIdType: "li_fat_id",
    request: null,
    response: null,
    error: result.error ?? null,
  });

  return { ok: result.ok, error: result.error ?? undefined };
}

/**
 * Reports one stage change to every configured network.
 *
 * Idempotent per (lead, network, stage) via the unique index on
 * conversion_uploads, so a retried stage change cannot double-report.
 */
export const queueConversion = createServerFn({ method: "POST" })
  .inputValidator((data: { leadId: string; stage: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    if (!data?.stage) throw new Error("stage is required");
    return { leadId: data.leadId, stage: data.stage as DbStage };
  })
  .handler(async ({ data }) => {
    const [google, meta, linkedin] = await Promise.allSettled([
      uploadGoogleAds(data.leadId, data.stage),
      uploadMeta(data.leadId, data.stage),
      uploadLinkedIn(data.leadId, data.stage),
    ]);

    const settled = (r: PromiseSettledResult<UploadResult>): UploadResult =>
      r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) };

    return { google: settled(google), meta: settled(meta), linkedin: settled(linkedin) };
  });
