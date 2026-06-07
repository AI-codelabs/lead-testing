import { createServerFn } from "@tanstack/react-start";

/**
 * Updates a lead's stage and (optional) extras, then fires the Google Ads
 * conversion upload for that stage in the background. Idempotent: the
 * conversion uploader itself dedupes per (lead, network, stage).
 */
export const setLeadStage = createServerFn({ method: "POST" })
  .inputValidator((data: {
    leadId: string;
    workspaceKey: string;
    stage: string;
    wonValue?: number | null;
    lostReason?: string | null;
    qualification?: string | null;
  }) => {
    if (!data?.leadId || !data?.workspaceKey || !data?.stage) throw new Error("Invalid input");
    if (data.leadId.length > 64 || data.workspaceKey.length > 128 || data.stage.length > 64) {
      throw new Error("Invalid input");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      stage: data.stage,
      stage_changed_at: new Date().toISOString(),
    };
    if (data.wonValue !== undefined) patch.won_value = data.wonValue;
    if (data.lostReason !== undefined) patch.lost_reason = data.lostReason ?? "";
    if (data.qualification !== undefined) patch.qualification = data.qualification ?? "";

    const { error } = await supabaseAdmin
      .from("leads")
      .update(patch as never)
      .eq("id", data.leadId)
      .eq("workspace_key", data.workspaceKey);
    if (error) throw new Error(error.message);

    // Fire conversion in the background. We don't block the UI on Google.
    try {
      const { sendGoogleAdsConversion } = await import("./conversions.functions");
      // Intentionally not awaited; serverless runtime will keep it alive long enough
      // for a single fetch round-trip via keepalive.
      void sendGoogleAdsConversion({ data: { leadId: data.leadId, stage: data.stage } });
    } catch {
      /* swallow — conversion failure must never break stage updates */
    }

    return { ok: true };
  });
