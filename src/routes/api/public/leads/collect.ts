import { createFileRoute } from "@tanstack/react-router";
import { resolveIngestKey, withIngest } from "@/db";

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
  "ingest_key",
  "name",
  "email",
  "phone",
  "company",
  "message",
  "source",
  "campaign_name",
  "website_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "msclkid",
  "li_fat_id",
  "fbp",
  "ga_client_id",
  "ga_session_id",
  "landing_page_url",
  "page_path",
  "referrer_url",
  "user_agent",
]);

/**
 * How long an identical submission counts as the same enquiry.
 *
 * An hour is comfortably longer than the bursts seen in the wild (97 copies
 * over 36 minutes) while still letting someone who genuinely enquires again
 * later that day get their own lead.
 */
const DEDUPE_WINDOW_MINUTES = 60;

/**
 * How long a half-filled version of the same form counts as the same enquiry.
 *
 * Ten minutes is longer than anyone takes to finish a contact form and far
 * shorter than the gap between two different people enquiring from one page.
 */
const SUPERSEDE_WINDOW_MINUTES = 10;

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

          // Same person, same answers, same page, within the hour: one
          // enquiry arriving twice, not two enquiries. The tracker guards this
          // too, but only within one page's lifetime — it cannot see what a
          // reload, another tab or a re-fire has already sent, and one site
          // produced 97 copies of a single submission that way.
          //
          // Answered by a SECURITY DEFINER function because the ingest role
          // holds INSERT and nothing else: it must never be able to read a
          // lead back, so it gets a boolean rather than a query.
          const duplicate = await withIngest(organizationId, (db) =>
            db.one<{ dup: boolean }>(
              `SELECT app.is_duplicate_lead($1, $2, $3, $4, $5, $6) AS dup`,
              [
                organizationId,
                str(body.email, 320),
                str(body.phone, 64),
                str(body.name, 200),
                str(body.page_path, 2000),
                DEDUPE_WINDOW_MINUTES,
              ],
            ),
          );
          if (duplicate?.dup) {
            return json({ ok: true, deduplicated: true }, 200, CORS);
          }

          // Does this workspace want this form at all?
          //
          // Not a judgement we can make: a courier company's job-application
          // form is noise in a sales pipeline, and a recruiter advertising
          // that same form has nothing else. The workspace decides, and
          // anything nobody has ruled on is collected.
          const rule = await withIngest(organizationId, (db) =>
            db.one<{ mode: string | null }>(
              `SELECT app.form_capture_mode($1, $2, $3)::text AS mode`,
              [organizationId, str(body.form_action, 2000) ?? "", str(body.page_path, 2000) ?? ""],
            ),
          );
          // 'block' means the contents should never be held at all — a
          // self-hosted payment form is the case that matters — so nothing is
          // written, not even an empty row.
          if (rule?.mode === "block") {
            return json({ ok: true, blocked: true }, 200, CORS);
          }
          const excluded = rule?.mode === "hide";

          // Is this the same form, in the same visit, with the same answers
          // only further along? One submission on a tester's site arrived four
          // times -- "Test"/"te", then the full email, then a phone number,
          // then the phone number corrected -- because a third-party analytics
          // ping every ten seconds was being read as a submission. The tracker
          // no longer does that, but it runs in someone else's page beside
          // scripts nobody has audited, and a GTM container we do not control
          // cannot be redeployed. So the finished version replaces the partial
          // one here rather than joining it.
          //
          // Not something app.is_duplicate_lead can answer: these rows are not
          // duplicates, each genuinely differs from the last.
          const superseded = await withIngest(organizationId, (db) =>
            db.one<{ id: string | null }>(
              `SELECT app.supersede_lead($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS id`,
              [
                organizationId,
                str(body.session_id, 64) ?? "",
                str(body.form_action, 2000) ?? "",
                str(body.page_path, 2000) ?? "",
                str(body.name, 200),
                str(body.email, 320),
                str(body.phone, 64),
                str(body.message, 4000),
                str(body.company, 200),
                SUPERSEDE_WINDOW_MINUTES,
              ],
            ),
          );
          if (superseded?.id) {
            // The lead already exists and its 'new' stage was already
            // reported, so there is no conversion to queue -- only more of the
            // visitor's answers, which the function has just written.
            return json({ ok: true, id: superseded.id, superseded: true }, 200, CORS);
          }

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
                 custom_fields, raw_payload, excluded
               ) VALUES (
                 $1, $2, 'new',
                 $3, $4, $5, $6, $7,
                 $8, $9, $10,
                 $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22,
                 $23, $24,
                 $25, $26, $27, $28,
                 $29, $30, $31
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
                JSON.stringify(custom),
                JSON.stringify(body),
                excluded,
              ],
            ),
          );

          // Report the 'new' stage in the background; never block intake on it.
          // A hidden lead is not a conversion: the whole point is that this
          // form does not count for this workspace right now.
          try {
            if (!excluded) {
              const { queueConversion } = await import("@/lib/conversions.functions");
              void queueConversion({ data: { leadId, stage: "new" } });
            }
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
