import { createServerFn } from "@tanstack/react-start";

/**
 * Send (or re-send) a Google Ads click conversion for one lead at a given stage.
 * - Only fires when the lead has a gclid/wbraid/gbraid (i.e. it actually came from Google).
 * - Idempotent per (lead_id, network, stage): a successful upload is recorded in
 *   conversion_uploads and won't be sent again.
 * - Records request/response and failures for debugging.
 *
 * Returns a serialisable status. Never throws on upstream API failures —
 * caller logs and continues.
 */
export const sendGoogleAdsConversion = createServerFn({ method: "POST" })
  .inputValidator((data: { leadId: string; stage: string }) => {
    if (!data || typeof data.leadId !== "string" || typeof data.stage !== "string") {
      throw new Error("Invalid input");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      buildGoogleAdsCreds,
      uploadClickConversion,
      formatConversionDateTime,
      sha256Hex,
    } = await import("./google-ads.server");

    const stage = data.stage;
    const STAGE_MAP: Record<string, "conversion_action_new" | "conversion_action_qualified" | "conversion_action_won" | "conversion_action_lost"> = {
      New: "conversion_action_new",
      Qualified: "conversion_action_qualified",
      Won: "conversion_action_won",
      Lost: "conversion_action_lost",
      Disqualified: "conversion_action_lost",
    };
    const settingsField = STAGE_MAP[stage];
    if (!settingsField) {
      return { ok: false, skipped: true, reason: `unsupported_stage:${stage}` };
    }

    // Already uploaded successfully? — short-circuit (dedupes Google's side too).
    const existing = await supabaseAdmin
      .from("conversion_uploads")
      .select("id, status")
      .eq("lead_id", data.leadId)
      .eq("network", "google_ads")
      .eq("stage", stage)
      .maybeSingle();
    if (existing.data && existing.data.status === "success") {
      return { ok: true, skipped: true, reason: "already_sent" };
    }

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", data.leadId)
      .single();
    if (leadErr || !lead) return { ok: false, skipped: true, reason: "lead_not_found" };

    // Must have a Google click identifier
    const gclid = (lead as any).gclid as string;
    const wbraid = (lead as any).wbraid as string;
    const gbraid = (lead as any).gbraid as string;
    if (!gclid && !wbraid && !gbraid) {
      return { ok: false, skipped: true, reason: "no_google_click_id" };
    }

    const { data: settings } = await supabaseAdmin
      .from("google_ads_settings")
      .select("*")
      .eq("workspace_key", lead.workspace_key)
      .maybeSingle();
    if (!settings || !settings.enabled) {
      return { ok: false, skipped: true, reason: "google_ads_not_configured" };
    }
    if (!settings.customer_id) {
      return { ok: false, skipped: true, reason: "no_customer_id" };
    }
    const conversionActionId = (settings as unknown as Record<string, string | null>)[settingsField];
    if (!conversionActionId) {
      return { ok: false, skipped: true, reason: `no_conversion_action_for:${stage}` };
    }

    const creds = buildGoogleAdsCreds((settings as { oauth_refresh_token?: string | null }).oauth_refresh_token);
    if (!creds) {
      return { ok: false, skipped: true, reason: "not_connected" };
    }

    // Enhanced conversions: hashed email + phone (when consent was given).
    const userIdentifiers: Array<{ hashedEmail: string } | { hashedPhoneNumber: string }> = [];
    const consent = String(lead.consent || "").toLowerCase();
    if (consent === "accepted") {
      if (lead.email) userIdentifiers.push({ hashedEmail: await sha256Hex(lead.email) });
      if (lead.phone) userIdentifiers.push({ hashedPhoneNumber: await sha256Hex(lead.phone.replace(/[^\d+]/g, "")) });
    }

    const value =
      stage === "Won" && (lead as any).won_value != null
        ? Number((lead as any).won_value)
        : undefined;

    const conversionDateTime = formatConversionDateTime(
      new Date((lead as any).stage_changed_at || lead.updated_at || lead.created_at),
    );

    const result = await uploadClickConversion(creds, {
      customerId: settings.customer_id,
      loginCustomerId: settings.login_customer_id ?? undefined,
      conversionActionId,
      gclid: gclid || undefined,
      wbraid: !gclid && wbraid ? wbraid : undefined,
      gbraid: !gclid && !wbraid && gbraid ? gbraid : undefined,
      conversionDateTime,
      value,
      currencyCode: value != null ? settings.default_currency || "EUR" : undefined,
      orderId: `${lead.id}:${stage}`,
      userIdentifiers: userIdentifiers.length ? userIdentifiers : undefined,
    });

    const row = {
      lead_id: lead.id,
      workspace_key: lead.workspace_key,
      network: "google_ads",
      stage,
      status: result.ok ? "success" : "failed",
      conversion_action: conversionActionId,
      value: value ?? null,
      currency: value != null ? settings.default_currency || "EUR" : null,
      click_id: gclid || wbraid || gbraid,
      click_id_type: gclid ? "gclid" : wbraid ? "wbraid" : "gbraid",
      request_payload: JSON.parse(JSON.stringify(result.request)),
      response_payload: JSON.parse(JSON.stringify(result.response)),
      error: result.error ?? null,
      attempts: (existing.data ? 1 : 0) + 1,
      attempted_at: new Date().toISOString(),
      succeeded_at: result.ok ? new Date().toISOString() : null,
    };
    await supabaseAdmin
      .from("conversion_uploads")
      .upsert(row as never, { onConflict: "lead_id,network,stage" });

    return { ok: result.ok, status: result.status, error: result.error };
  });
