import { createFileRoute } from "@tanstack/react-router";
import { resolveIngestKey, withIngest } from "@/db";
import { toDbConsent } from "@/lib/lead-mapping";

/**
 * Public lead intake for the website tracker.
 *
 * Authenticated by `ingest_key`, a rotatable per-organization credential. The
 * previous version accepted `workspace_key`, which doubled as the tenant's
 * identifier everywhere else — anyone who saw one could write to that tenant
 * and, through the unauthenticated read endpoints, read it back.
 *
 * This runs on the app_ingest role, which can insert leads and nothing else:
 * it cannot read a lead back, and row level security pins the insert to the
 * organization the key resolved to.
 */

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

const KNOWN_FIELDS = new Set([
  "ingest_key", "name", "email", "phone", "company", "message",
  "source", "campaign_name", "website_url",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "wbraid", "gbraid", "fbclid", "msclkid", "li_fat_id", "fbp",
  "ga_client_id", "ga_session_id",
  "landing_page_url", "page_path", "referrer_url", "user_agent", "consent",
]);

/** Trims to a maximum length, and returns null for absent values. */
function str(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

export const Route = createFileRoute("/api/public/leads/collect")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),

      POST: async ({ request }) => {
        const CORS = corsHeaders(request);
        try {
          // sendBeacon posts text/plain, so parse the body rather than trusting
          // the content type.
          const raw = await request.text().catch(() => "");
          let body: Record<string, unknown> = {};
          try {
            body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            body = {};
          }

          const ingestKey = str(body.ingest_key, 128);
          if (!ingestKey) {
            return json({ error: "ingest_key is required" }, 400, CORS);
          }

          const organizationId = await resolveIngestKey(ingestKey);
          if (!organizationId) {
            // Deliberately does not echo the key back.
            return json({ error: "unknown_ingest_key" }, 404, CORS);
          }

          const custom: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(body)) {
            if (!KNOWN_FIELDS.has(k)) custom[k] = v;
          }

          // The id is generated here rather than read back with RETURNING.
          // RETURNING makes Postgres apply a SELECT policy to the new row, and
          // app_ingest deliberately has none — it must never be able to read a
          // lead back. Generating the id keeps that guarantee intact.
          const leadId = crypto.randomUUID();

          await withIngest(organizationId, (db) =>
            db.sql(
              `INSERT INTO public.leads (
                 id, organization_id, stage,
                 name, email, phone, company, message,
                 source, campaign_name, website_url,
                 utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                 gclid, wbraid, gbraid, fbclid, msclkid, li_fat_id, fbp,
                 ga_client_id, ga_session_id,
                 landing_page_url, page_path, referrer_url, user_agent,
                 consent, custom_fields, raw_payload
               ) VALUES (
                 $1, $2, 'new',
                 $3, $4, $5, $6, $7,
                 $8, $9, $10,
                 $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22,
                 $23, $24,
                 $25, $26, $27, $28,
                 $29::lead_consent, $30, $31
               )`,
              [
                leadId,
                organizationId,
                str(body.name, 200),
                str(body.email, 320),
                str(body.phone, 64),
                str(body.company, 200),
                str(body.message, 4000),
                str(body.source, 32) ?? "Direct",
                str(body.campaign_name, 200),
                str(body.website_url, 2000),
                str(body.utm_source, 200),
                str(body.utm_medium, 200),
                str(body.utm_campaign, 200),
                str(body.utm_term, 200),
                str(body.utm_content, 200),
                str(body.gclid, 500),
                str(body.wbraid, 500),
                str(body.gbraid, 500),
                str(body.fbclid, 500),
                str(body.msclkid, 500),
                str(body.li_fat_id, 500),
                str(body.fbp, 500),
                str(body.ga_client_id, 200),
                str(body.ga_session_id, 200),
                str(body.landing_page_url, 2000),
                str(body.page_path, 2000),
                str(body.referrer_url, 2000),
                str(request.headers.get("user-agent") ?? body.user_agent, 500),
                toDbConsent(str(body.consent, 32)),
                JSON.stringify(custom),
                JSON.stringify(body),
              ],
            ),
          );

          // Report the 'new' stage in the background; never block intake on it.
          try {
            const { queueConversion } = await import("@/lib/conversions.functions");
            void queueConversion({ data: { leadId, stage: "new" } });
          } catch {
            /* ignored by design */
          }

          return json({ ok: true, id: leadId }, 200, CORS);
        } catch (err) {
          console.error("[leads/collect] failed", err);
          return json({ error: "server_error" }, 500, CORS);
        }
      },
    },
  },
});
