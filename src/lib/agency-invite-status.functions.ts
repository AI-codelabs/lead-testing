import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInviteStatuses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invites, error } = await supabaseAdmin
      .from("agency_invites")
      .select(
        "id, kind, agency_email, inviter_workspace_name, access_level, status, created_at, accepted_at, expires_at, token",
      )
      .eq("inviter_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const emails = (invites ?? []).map((i: any) => i.agency_email).filter(Boolean);
    let emailRows: any[] = [];
    if (emails.length > 0) {
      const { data: logs, error: logErr } = await supabaseAdmin
        .from("email_send_log")
        .select("recipient_email, template_name, status, error_message, created_at")
        .in("recipient_email", emails)
        .in("template_name", ["client_invite", "agency_invite"])
        .order("created_at", { ascending: false });
      if (logErr) throw logErr;
      emailRows = logs ?? [];
    }

    const latestByEmail = new Map<string, any>();
    for (const row of emailRows) {
      const key = `${row.recipient_email}|${row.template_name}`;
      if (!latestByEmail.has(key)) latestByEmail.set(key, row);
    }

    return {
      invites: (invites ?? []).map((i: any) => {
        const log = latestByEmail.get(`${i.agency_email}|${i.kind}`);
        return {
          ...i,
          email_status: log?.status ?? null,
          email_error: log?.error_message ?? null,
          email_sent_at: log?.status === "sent" ? log?.created_at : null,
        };
      }),
    };
  });
