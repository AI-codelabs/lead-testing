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
    if (!row) return { settings: null };
    const r = row as Record<string, unknown>;
    const settings: GoogleAdsSettings = {
      workspace_key: r.workspace_key as string,
      enabled: r.enabled as boolean,
      customer_id: (r.customer_id as string) ?? "",
      login_customer_id: (r.login_customer_id as string | null) ?? null,
      default_currency: (r.default_currency as string) ?? "EUR",
      conversion_action_new: (r.conversion_action_new as string | null) ?? null,
      conversion_action_qualified: (r.conversion_action_qualified as string | null) ?? null,
      conversion_action_won: (r.conversion_action_won as string | null) ?? null,
      conversion_action_lost: (r.conversion_action_lost as string | null) ?? null,
      oauth_email: (r.oauth_email as string | null) ?? null,
      connected_at: (r.connected_at as string | null) ?? null,
      connected: !!r.oauth_refresh_token,
    };
    return { settings };
  });

export const saveGoogleAdsSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<GoogleAdsSettings> & { workspace_key: string }) => {
    if (!data?.workspace_key) throw new Error("workspace_key is required");
    if (data.customer_id && !/^\d{6,12}$/.test(data.customer_id.replace(/\D/g, ""))) {
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

/** Disconnects Google Ads for a workspace (clears refresh token + customer choice). */
export const disconnectGoogleAds = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_ads_settings")
      .update({
        oauth_refresh_token: null,
        oauth_email: null,
        connected_at: null,
        customer_id: "",
        login_customer_id: null,
        conversion_action_new: null,
        conversion_action_qualified: null,
        conversion_action_won: null,
        conversion_action_lost: null,
      } as never)
      .eq("workspace_key", data.workspaceKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lists every Google Ads account the connected user can access, with descriptive name. */
export const listGoogleAdsCustomers = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildGoogleAdsCreds, listAccessibleCustomers, getCustomerInfo } = await import("./google-ads.server");
    const { data: row } = await supabaseAdmin
      .from("google_ads_settings")
      .select("oauth_refresh_token")
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    const refresh = (row as { oauth_refresh_token?: string | null } | null)?.oauth_refresh_token ?? null;
    const creds = buildGoogleAdsCreds(refresh);
    if (!creds) return { customers: [], error: "not_connected" };
    try {
      const ids = await listAccessibleCustomers(creds);
      const infos = await Promise.all(ids.map((id) => getCustomerInfo(creds, id).catch(() => null)));
      const customers = infos
        .map((c, i) => c ?? { id: ids[i], descriptiveName: "(no access details)", currencyCode: "", timeZone: "", manager: false });
      return { customers, error: null as string | null };
    } catch (e) {
      return { customers: [], error: e instanceof Error ? e.message : "list_failed" };
    }
  });

/** Lists conversion actions on a customer account so the user can pick one per stage. */
export const listGoogleAdsConversionActions = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string; customerId: string; loginCustomerId?: string }) => {
    if (!data?.workspaceKey || !data?.customerId) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildGoogleAdsCreds, listConversionActions } = await import("./google-ads.server");
    const { data: row } = await supabaseAdmin
      .from("google_ads_settings")
      .select("oauth_refresh_token")
      .eq("workspace_key", data.workspaceKey)
      .maybeSingle();
    const refresh = (row as { oauth_refresh_token?: string | null } | null)?.oauth_refresh_token ?? null;
    const creds = buildGoogleAdsCreds(refresh);
    if (!creds) return { actions: [], error: "not_connected" };
    try {
      const actions = await listConversionActions(creds, data.customerId, data.loginCustomerId);
      return { actions, error: null as string | null };
    } catch (e) {
      return { actions: [], error: e instanceof Error ? e.message : "list_failed" };
    }
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
