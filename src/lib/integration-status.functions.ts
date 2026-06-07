import { createServerFn } from "@tanstack/react-start";

export type IntegrationStatuses = {
  incomingConnected: boolean;
  googleAdsConnected: boolean;
};

export const getIntegrationStatuses = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey || data.workspaceKey.length > 128) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }): Promise<IntegrationStatuses> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [leadsRes, gaRes] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_key", data.workspaceKey),
      supabaseAdmin
        .from("google_ads_settings")
        .select("oauth_refresh_token")
        .eq("workspace_key", data.workspaceKey)
        .maybeSingle(),
    ]);
    const incomingConnected = (leadsRes.count ?? 0) > 0;
    const row = gaRes.data as { oauth_refresh_token?: string | null } | null;
    const googleAdsConnected = !!row?.oauth_refresh_token;
    return { incomingConnected, googleAdsConnected };
  });
