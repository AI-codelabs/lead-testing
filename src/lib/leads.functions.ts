import { createServerFn } from "@tanstack/react-start";

export const deleteLead = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; workspaceKey: string }) => {
    if (!data || typeof data.id !== "string" || typeof data.workspaceKey !== "string") {
      throw new Error("Invalid input");
    }
    if (data.id.length > 64 || data.workspaceKey.length > 64) {
      throw new Error("Invalid input");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .delete()
      .eq("id", data.id)
      .eq("workspace_key", data.workspaceKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
