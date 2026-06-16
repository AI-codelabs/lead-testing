import { createServerFn } from "@tanstack/react-start";

export const updateLeadStage = createServerFn({ method: "POST" })
  .inputValidator((data: { leadId: string; workspaceKey: string; stage: string; value?: number; lossReason?: string }) => {
    if (!data?.leadId || typeof data.leadId !== "string") throw new Error("Invalid leadId");
    if (!data?.workspaceKey || typeof data.workspaceKey !== "string") throw new Error("Invalid workspace");
    if (!data?.stage || typeof data.stage !== "string" || data.stage.length > 64) throw new Error("Invalid stage");
    return {
      leadId: data.leadId,
      workspaceKey: data.workspaceKey,
      stage: data.stage,
      value: typeof data.value === "number" && isFinite(data.value) ? data.value : undefined,
      lossReason: typeof data.lossReason === "string" ? data.lossReason.slice(0, 500) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const patch: {
      stage: string;
      updated_at: string;
      stage_changed_at: string;
      won_value?: number;
      lost_reason?: string;
    } = { stage: data.stage, updated_at: now, stage_changed_at: now };
    if (typeof data.value === "number") patch.won_value = data.value;
    if (data.lossReason) patch.lost_reason = data.lossReason;
    const { error } = await supabaseAdmin
      .from("leads")
      .update(patch)
      .eq("id", data.leadId)
      .eq("workspace_key", data.workspaceKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
