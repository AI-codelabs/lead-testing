import { createServerFn } from "@tanstack/react-start";

export type IntegrationStatuses = {
  incomingConnectedIds: string[];
  googleAdsConnected: boolean;
  metaAdsConnected: boolean;
};

export const getIntegrationStatuses = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey || data.workspaceKey.length > 128) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }): Promise<IntegrationStatuses> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [incomingRes, gaRes, metaRes] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("raw_payload")
        .eq("workspace_key", data.workspaceKey),
      supabaseAdmin
        .from("google_ads_settings")
        .select("oauth_refresh_token")
        .eq("workspace_key", data.workspaceKey)
        .maybeSingle(),
      supabaseAdmin
        .from("meta_ads_settings")
        .select("access_token, pixel_id")
        .eq("workspace_key", data.workspaceKey)
        .maybeSingle(),
    ]);
    const incomingConnectedIds = new Set<string>();
    for (const row of (incomingRes.data ?? []) as Array<{ raw_payload?: Record<string, unknown> | null }>) {
      const id = typeof row.raw_payload?.integration_id === "string" ? row.raw_payload.integration_id : "";
      if (["gtm", "wordpress", "api", "zapier"].includes(id)) incomingConnectedIds.add(id);
      if (!id) incomingConnectedIds.add("gtm");
    }
    const gaRow = gaRes.data as { oauth_refresh_token?: string | null } | null;
    const googleAdsConnected = !!gaRow?.oauth_refresh_token;
    const metaRow = metaRes.data as { access_token?: string | null; pixel_id?: string | null } | null;
    const metaAdsConnected = !!(metaRow?.access_token && metaRow?.pixel_id);
    return { incomingConnectedIds: [...incomingConnectedIds], googleAdsConnected, metaAdsConnected };
  });
