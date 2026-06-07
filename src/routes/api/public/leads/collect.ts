import { createFileRoute } from "@tanstack/react-router";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

const KNOWN_FIELDS = new Set([
  "workspace_key", "name", "email", "phone", "company", "message",
  "source", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "wbraid", "gbraid", "fbclid", "msclkid", "li_fat_id", "fbp", "ga_client_id", "ga_session_id",
  "landing_page_url", "page_path", "referrer_url", "user_agent", "consent",
]);

function str(v: unknown, max = 2000): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

export const Route = createFileRoute("/api/public/leads/collect")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const CORS = corsHeaders(request);
        try {
          // Accept JSON or text/plain (sendBeacon) bodies
          const raw = await request.text().catch(() => "");
          let body: any = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
          const workspace_key = str(body?.workspace_key, 128).trim();
          if (!workspace_key) {
            return new Response(JSON.stringify({ error: "workspace_key is required" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          const custom: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(body ?? {})) {
            if (!KNOWN_FIELDS.has(k)) custom[k] = v;
          }
          const customJson = JSON.parse(JSON.stringify(custom));
          const rawJson = JSON.parse(JSON.stringify(body ?? {}));


          const row = {
            workspace_key,
            stage: "New",
            name: str(body?.name, 200),
            email: str(body?.email, 320),
            phone: str(body?.phone, 64),
            company: str(body?.company, 200),
            message: str(body?.message, 4000),
            source: str(body?.source, 32) || "Direct",
            utm_source: str(body?.utm_source, 200),
            utm_medium: str(body?.utm_medium, 200),
            utm_campaign: str(body?.utm_campaign, 200),
            utm_term: str(body?.utm_term, 200),
            utm_content: str(body?.utm_content, 200),
            gclid: str(body?.gclid, 500),
            wbraid: str(body?.wbraid, 500),
            gbraid: str(body?.gbraid, 500),
            fbclid: str(body?.fbclid, 500),
            msclkid: str(body?.msclkid, 500),
            li_fat_id: str(body?.li_fat_id, 500),
            fbp: str(body?.fbp, 500),
            ga_client_id: str(body?.ga_client_id, 200),
            ga_session_id: str(body?.ga_session_id, 200),
            landing_page_url: str(body?.landing_page_url, 2000),
            page_path: str(body?.page_path, 2000),
            referrer_url: str(body?.referrer_url, 2000),
            user_agent: str(request.headers.get("user-agent") ?? body?.user_agent, 500),
            consent: str(body?.consent, 32) || "Unknown",
            custom_fields: customJson,
            raw_payload: rawJson,
          };

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("leads")
            .insert(row)
            .select("id")
            .single();

          if (error) {
            console.error("[leads/collect] insert failed", error);
            return new Response(JSON.stringify({ error: "insert_failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...CORS },
            });
          }

          return new Response(JSON.stringify({ ok: true, id: data?.id }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (err) {
          console.error("[leads/collect] error", err);
          return new Response(JSON.stringify({ error: "bad_request" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
