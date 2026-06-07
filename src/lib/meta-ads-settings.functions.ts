import { createServerFn } from "@tanstack/react-start";

export type MetaAdsSettings = {
  workspace_key: string;
  enabled: boolean;
  pixel_id: string;
  test_event_code: string | null;
  default_currency: string;
  event_name_new: string | null;
  event_name_qualified: string | null;
  event_name_won: string | null;
  event_name_lost: string | null;
  connected_at: string | null;
  connected: boolean; // true if access_token present (never returned)
  has_token: boolean;
};

export const getMetaAdsSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey || data.workspaceKey.length > 128) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("meta_ads_settings")
      .select("*")
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    if (!row) return { settings: null as MetaAdsSettings | null };
    const r = row as Record<string, unknown>;
    const hasToken = !!(r.access_token as string | null);
    const settings: MetaAdsSettings = {
      workspace_key: r.workspace_key as string,
      enabled: r.enabled as boolean,
      pixel_id: (r.pixel_id as string) ?? "",
      test_event_code: (r.test_event_code as string | null) ?? null,
      default_currency: (r.default_currency as string) ?? "EUR",
      event_name_new: (r.event_name_new as string | null) ?? null,
      event_name_qualified: (r.event_name_qualified as string | null) ?? null,
      event_name_won: (r.event_name_won as string | null) ?? null,
      event_name_lost: (r.event_name_lost as string | null) ?? null,
      connected_at: (r.connected_at as string | null) ?? null,
      connected: hasToken,
      has_token: hasToken,
    };
    return { settings };
  });

export const saveMetaAdsSettings = createServerFn({ method: "POST" })
  .inputValidator((data: {
    workspace_key: string;
    enabled?: boolean;
    pixel_id?: string;
    access_token?: string | null; // null = clear, "" / undefined = leave unchanged
    test_event_code?: string | null;
    default_currency?: string;
    event_name_new?: string | null;
    event_name_qualified?: string | null;
    event_name_won?: string | null;
    event_name_lost?: string | null;
  }) => {
    if (!data?.workspace_key) throw new Error("workspace_key is required");
    if (data.pixel_id && !/^\d{6,20}$/.test(data.pixel_id.replace(/\D/g, ""))) {
      throw new Error("pixel_id must be 6–20 digits");
    }
    if (data.access_token && data.access_token.length > 1024) {
      throw new Error("access_token too long");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: Record<string, unknown> = {
      workspace_key: data.workspace_key,
      enabled: data.enabled ?? true,
      pixel_id: (data.pixel_id || "").replace(/\D/g, ""),
      test_event_code: data.test_event_code?.trim() || null,
      default_currency: (data.default_currency || "EUR").toUpperCase().slice(0, 3),
      event_name_new: data.event_name_new?.trim() || null,
      event_name_qualified: data.event_name_qualified?.trim() || null,
      event_name_won: data.event_name_won?.trim() || null,
      event_name_lost: data.event_name_lost?.trim() || null,
    };
    // Only set access_token if explicitly provided (non-empty string sets, null clears, undefined leaves)
    if (data.access_token === null) {
      row.access_token = null;
      row.connected_at = null;
    } else if (typeof data.access_token === "string" && data.access_token.trim().length > 0) {
      row.access_token = data.access_token.trim();
      row.connected_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("meta_ads_settings")
      .upsert(row as never, { onConflict: "workspace_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectMetaAds = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("meta_ads_settings")
      .update({ access_token: null, connected_at: null } as never)
      .eq("workspace_key", data.workspaceKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a test event using the saved credentials and reports the result. */
export const testMetaAdsConnection = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyMetaCapi } = await import("./meta-capi.server");
    const { data: row } = await supabaseAdmin
      .from("meta_ads_settings")
      .select("pixel_id, access_token, test_event_code")
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    const r = row as { pixel_id?: string; access_token?: string | null; test_event_code?: string | null } | null;
    if (!r?.access_token || !r.pixel_id) return { ok: false, error: "not_connected" };
    const result = await verifyMetaCapi({
      pixelId: r.pixel_id,
      accessToken: r.access_token,
      testEventCode: r.test_event_code ?? null,
    });
    return result;
  });
