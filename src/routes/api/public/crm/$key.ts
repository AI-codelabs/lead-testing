import { createFileRoute } from "@tanstack/react-router";
import { withOwner } from "@/db";
import { isCrmProvider, mapStage, parseCrmWebhook, type CrmProvider } from "@/lib/crm-sync.server";

/**
 * Inbound status webhook from a customer's CRM.
 *
 * The secret is the whole URL path, because that is all these providers let you
 * configure — most send no custom headers and none of them sign a body we could
 * verify without an app registration. A leaked key therefore lets someone move
 * stages in that workspace, which is why it resolves to exactly one connection
 * and can be rotated by disconnecting and reconnecting.
 *
 * Always answers 200 once the key is valid, including when nothing matched.
 * Every one of these providers retries on a non-2xx and several disable the
 * webhook after repeated failures — so an unmapped stage must not read as an
 * outage. What happened is recorded in crm_events instead, which is what the
 * setup page shows.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Connection = {
  id: string;
  organization_id: string;
  provider: CrmProvider;
  stage_map: Record<string, string> | null;
  enabled: boolean;
};

export const Route = createFileRoute("/api/public/crm/$key")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const key = (params as { key?: string }).key ?? "";
        if (key.length < 16) return json({ error: "invalid_key" }, 404);

        const raw = await request.text().catch(() => "");
        let body: unknown = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = {};
        }

        // Monday verifies an endpoint by posting {challenge} and requiring it
        // echoed back verbatim. It does this before the webhook can be saved,
        // so it has to answer ahead of any key lookup.
        const challenge = (body as { challenge?: unknown } | null)?.challenge;
        if (typeof challenge === "string") return json({ challenge }, 200);

        return withOwner(async (db) => {
          const conn = await db.one<Connection>(
            `SELECT id, organization_id, provider::text AS provider, stage_map, enabled
               FROM public.crm_connections WHERE webhook_key = $1`,
            [key],
          );
          if (!conn) return json({ error: "unknown_key" }, 404);
          if (!isCrmProvider(conn.provider)) return json({ error: "unknown_provider" }, 404);
          if (!conn.enabled) return json({ ok: true, skipped: "disabled" }, 200);

          const update = parseCrmWebhook(conn.provider, body);
          const stage = mapStage(conn.stage_map ?? {}, update.stage);

          const record = async (leadId: string | null, error: string | null) => {
            await db.sql(
              `INSERT INTO public.crm_events
                 (organization_id, provider, lead_id, matched, external_stage, mapped_stage, email, error)
               VALUES ($1, $2::crm_provider, $3, $4, $5, $6::lead_stage, $7, $8)`,
              [
                conn.organization_id,
                conn.provider,
                leadId,
                leadId !== null && error === null,
                update.stage,
                stage,
                update.email,
                error,
              ],
            );
            await db.sql(`UPDATE public.crm_connections SET last_event_at = now() WHERE id = $1`, [
              conn.id,
            ]);
          };

          if (!update.stage) {
            await record(null, "no_stage_in_payload");
            return json({ ok: true, skipped: "no_stage" }, 200);
          }
          if (!stage) {
            await record(null, `unmapped_stage:${update.stage}`);
            return json({ ok: true, skipped: "unmapped_stage" }, 200);
          }
          if (!update.email) {
            await record(null, "no_email_in_payload");
            return json({ ok: true, skipped: "no_email" }, 200);
          }

          // Most recent lead with that email in this workspace. A person who
          // enquired twice has two leads, and the live one is the later.
          const lead = await db.one<{ id: string }>(
            `SELECT id FROM public.leads
              WHERE organization_id = $1 AND lower(email) = lower($2)
           ORDER BY created_at DESC LIMIT 1`,
            [conn.organization_id, update.email],
          );
          if (!lead) {
            await record(null, "no_matching_lead");
            return json({ ok: true, skipped: "no_matching_lead" }, 200);
          }

          await db.sql(
            `UPDATE public.leads
                SET stage        = $2::lead_stage,
                    won_value    = COALESCE($3, won_value),
                    qualified_at = CASE
                                     WHEN $2::lead_stage = 'qualified' AND qualified_at IS NULL
                                     THEN now() ELSE qualified_at
                                   END
              WHERE id = $1`,
            [lead.id, stage, stage === "won" ? update.value : null],
          );
          await record(lead.id, null);

          // Same contract as a stage change made in the app: report it onward,
          // and never let that failing undo the stage change itself.
          try {
            const { queueConversion } = await import("@/lib/conversions.functions");
            void queueConversion({ data: { leadId: lead.id, stage } });
          } catch {
            /* recorded by the uploader, not this webhook */
          }

          return json({ ok: true, leadId: lead.id, stage }, 200);
        });
      },

      // Several providers verify the endpoint with a GET before they will save
      // it, and Monday handshakes by echoing a challenge back.
      GET: async ({ params }) => {
        const key = (params as { key?: string }).key ?? "";
        if (key.length < 16) return json({ error: "invalid_key" }, 404);
        return json({ ok: true }, 200);
      },
    },
  },
});
