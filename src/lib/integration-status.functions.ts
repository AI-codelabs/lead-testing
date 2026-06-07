import { createServerFn } from "@tanstack/react-start";

export type IntegrationStatuses = {
  incomingConnectedIds: string[];
  googleAdsConnected: boolean;
};

export const getIntegrationStatuses = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string }) => {
    if (!data?.workspaceKey || data.workspaceKey.length > 128) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data }): Promise<IntegrationStatuses> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [incomingRes, legacyGtmRes, gaRes] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("raw_payload")
        .eq("workspace_key", data.workspaceKey),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_key", data.workspaceKey)
        .not("raw_payload", "cs", JSON.stringify({ integration_id: "" })),
      supabaseAdmin
        .from("google_ads_settings")
        .select("oauth_refresh_token")
        .eq("workspace_key", data.workspaceKey)
        .maybeSingle(),
    ]);
    const incomingConnectedIds = new Set<string>();
    for (const row of (incomingRes.data ?? []) as Array<{ raw_payload?: Record<string, unknown> | null }>) {
      const id = typeof row.raw_payload?.integration_id === "string" ? row.raw_payload.integration_id : "";
      if (["gtm", "wordpress", "api", "zapier"].includes(id)) incomingConnectedIds.add(id);
    }
    if ((legacyGtmRes.count ?? 0) > 0) incomingConnectedIds.add("gtm");
    const row = gaRes.data as { oauth_refresh_token?: string | null } | null;
    const googleAdsConnected = !!row?.oauth_refresh_token;
    return { incomingConnectedIds: [...incomingConnectedIds], googleAdsConnected };
  });
