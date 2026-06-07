import { createServerFn } from "@tanstack/react-start";

export type WorkspaceLeadRow = {
  id: string;
  workspace_key: string;
  stage: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  gclid: string;
  fbclid: string;
  msclkid: string;
  li_fat_id: string;
  fbp: string;
  ga_client_id: string;
  ga_session_id: string;
  landing_page_url: string;
  page_path: string;
  referrer_url: string;
  consent: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export const getWorkspaceLeads = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string; limit?: number }) => {
    if (!data?.workspaceKey || typeof data.workspaceKey !== "string") {
      throw new Error("Invalid workspace");
    }
    if (data.workspaceKey.length > 128) throw new Error("Invalid workspace");
    const limit = Math.min(Math.max(data.limit ?? 500, 1), 1000);
    return { workspaceKey: data.workspaceKey, limit };
  })
  .handler(async ({ data }): Promise<WorkspaceLeadRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id,workspace_key,stage,name,email,phone,company,message,source,utm_source,utm_medium,utm_campaign,gclid,fbclid,msclkid,li_fat_id,fbp,ga_client_id,ga_session_id,landing_page_url,page_path,referrer_url,consent,raw_payload,created_at,updated_at",
      )
      .eq("workspace_key", data.workspaceKey)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkspaceLeadRow[];
  });
