import { createServerFn } from "@tanstack/react-start";

export type GoogleAdsSettings = {
  workspace_key: string;
  enabled: boolean;
  customer_id: string;
  login_customer_id: string | null;
  default_currency: string;
  conversion_action_new: string | null;
  conversion_action_qualified: string | null;
  conversion_action_won: string | null;
  conversion_action_lost: string | null;
  oauth_email: string | null;
  connected_at: string | null;
  connected: boolean;
};

export const getGoogleAdsSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("google_ads_settings")
      .select("*")
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    return { settings: (row as GoogleAdsSettings | null) ?? null };
  });

export const saveGoogleAdsSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<GoogleAdsSettings> & { workspace_key: string }) => {
    if (!data?.workspace_key || typeof data.customer_id !== "string") {
      throw new Error("workspace_key and customer_id are required");
    }
    if (!/^\d{6,12}$/.test(data.customer_id.replace(/\D/g, ""))) {
      throw new Error("customer_id must be 6–12 digits (no dashes)");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      workspace_key: data.workspace_key,
      enabled: data.enabled ?? true,
      customer_id: (data.customer_id || "").replace(/\D/g, ""),
      login_customer_id: data.login_customer_id ? data.login_customer_id.replace(/\D/g, "") : null,
      default_currency: (data.default_currency || "EUR").toUpperCase().slice(0, 3),
      conversion_action_new: data.conversion_action_new || null,
      conversion_action_qualified: data.conversion_action_qualified || null,
      conversion_action_won: data.conversion_action_won || null,
      conversion_action_lost: data.conversion_action_lost || null,
    };
    const { error } = await supabaseAdmin
      .from("google_ads_settings")
      .upsert(row as never, { onConflict: "workspace_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lists recent conversion uploads for the dashboard. */
export const listConversionUploads = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string; limit?: number }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("conversion_uploads")
      .select("id, lead_id, network, stage, status, value, currency, click_id_type, error, attempted_at, succeeded_at")
      .eq("workspace_key", data.workspaceKey)
      .order("attempted_at", { ascending: false })
      .limit(Math.min(data.limit ?? 50, 200));
    return { uploads: rows ?? [] };
  });
