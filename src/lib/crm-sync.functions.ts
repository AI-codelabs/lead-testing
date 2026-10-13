import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";
import { CRM_PROVIDERS, MAPPABLE_STAGES, isCrmProvider, type CrmProvider } from "./crm-sync.server";

/**
 * How far along the setup actually is.
 *
 * Creating the connection only issues a URL. It proves nothing: the customer
 * still has to paste it into their CRM, and until a delivery arrives we have
 * no evidence they did. Calling that "connected" is the kind of green tick
 * people trust right up until they wonder why nothing syncs.
 *
 *   awaiting_events — URL issued, nothing has ever been received
 *   needs_mapping   — deliveries are arriving but no stage is mapped, so every
 *                     one of them is being ignored
 *   active          — receiving, and at least one stage means something
 */
export type CrmStatus = "awaiting_events" | "needs_mapping" | "active";

export type CrmConnection = {
  provider: CrmProvider;
  status: CrmStatus;
  /** The URL the customer pastes into their CRM. */
  webhookUrl: string;
  stageMap: Record<string, string>;
  enabled: boolean;
  lastEventAt: string | null;
};

export type CrmEvent = {
  id: string;
  provider: CrmProvider;
  matched: boolean;
  externalStage: string | null;
  mappedStage: string | null;
  email: string | null;
  error: string | null;
  createdAt: string;
};

/**
 * Where the webhook lives.
 *
 * The ingest endpoint is served from the backend origin rather than wherever
 * the dashboard happens to be hosted, and the same is true here — a customer
 * pastes this into their CRM once and it must not change when the frontend
 * moves.
 */
const BACKEND_ORIGIN = "https://www.leadlogr.com";
const webhookUrl = (key: string) => `${BACKEND_ORIGIN}/api/public/crm/${key}`;

/** 32 hex characters, which is what the endpoint's length check assumes. */
function newKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanStageMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const their = String(k).trim().toLowerCase();
    const ours = String(v ?? "")
      .trim()
      .toLowerCase();
    // Keys are lower-cased on the way in so the webhook can look them up
    // without caring how the customer typed them.
    if (their && (MAPPABLE_STAGES as readonly string[]).includes(ours)) out[their] = ours;
  }
  return out;
}

function statusOf(lastEventAt: string | null, stageMap: Record<string, string> | null): CrmStatus {
  if (!lastEventAt) return "awaiting_events";
  if (!stageMap || Object.keys(stageMap).length === 0) return "needs_mapping";
  return "active";
}

export const listCrmConnections = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<CrmConnection[]> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const rows = await context.db.sql<{
      provider: CrmProvider;
      webhook_key: string;
      stage_map: Record<string, string> | null;
      enabled: boolean;
      last_event_at: string | null;
    }>(
      `SELECT provider::text AS provider, webhook_key, stage_map, enabled, last_event_at
         FROM public.crm_connections WHERE organization_id = $1`,
      [orgId],
    );
    return rows.map((r) => ({
      provider: r.provider,
      status: statusOf(r.last_event_at, r.stage_map),
      webhookUrl: webhookUrl(r.webhook_key),
      stageMap: r.stage_map ?? {},
      enabled: r.enabled,
      lastEventAt: r.last_event_at,
    }));
  });

/**
 * Creates the connection if it does not exist, and returns it either way.
 *
 * Idempotent on purpose: "Connect" is a button someone will press twice, and
 * issuing a second key would silently invalidate the URL they already pasted
 * into their CRM.
 */
export const connectCrm = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; provider: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (!isCrmProvider(data.provider)) throw new Error("Unknown provider");
    return { organizationId: data.organizationId, provider: data.provider };
  })
  .handler(async ({ data, context }): Promise<CrmConnection> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const existing = await context.db.one<{
      webhook_key: string;
      stage_map: Record<string, string> | null;
      enabled: boolean;
      last_event_at: string | null;
    }>(
      `SELECT webhook_key, stage_map, enabled, last_event_at
         FROM public.crm_connections
        WHERE organization_id = $1 AND provider = $2::crm_provider`,
      [orgId, data.provider],
    );
    if (existing) {
      return {
        provider: data.provider,
        status: statusOf(existing.last_event_at, existing.stage_map),
        webhookUrl: webhookUrl(existing.webhook_key),
        stageMap: existing.stage_map ?? {},
        enabled: existing.enabled,
        lastEventAt: existing.last_event_at,
      };
    }

    const key = newKey();
    await context.db.sql(
      `INSERT INTO public.crm_connections (organization_id, provider, webhook_key)
       VALUES ($1, $2::crm_provider, $3)
       ON CONFLICT (organization_id, provider) DO NOTHING`,
      [orgId, data.provider, key],
    );
    const row = await context.db.one<{ webhook_key: string }>(
      `SELECT webhook_key FROM public.crm_connections
        WHERE organization_id = $1 AND provider = $2::crm_provider`,
      [orgId, data.provider],
    );
    return {
      provider: data.provider,
      status: "awaiting_events",
      webhookUrl: webhookUrl(row?.webhook_key ?? key),
      stageMap: {},
      enabled: true,
      lastEventAt: null,
    };
  });

export const saveCrmStageMap = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      provider: string;
      stageMap: Record<string, string>;
      enabled?: boolean;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      if (!isCrmProvider(data.provider)) throw new Error("Unknown provider");
      return {
        organizationId: data.organizationId,
        provider: data.provider,
        stageMap: cleanStageMap(data.stageMap),
        enabled: data.enabled !== false,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    await context.db.sql(
      `UPDATE public.crm_connections
          SET stage_map = $3::jsonb, enabled = $4
        WHERE organization_id = $1 AND provider = $2::crm_provider`,
      [orgId, data.provider, JSON.stringify(data.stageMap), data.enabled],
    );
    return { ok: true };
  });

export const disconnectCrm = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; provider: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (!isCrmProvider(data.provider)) throw new Error("Unknown provider");
    return { organizationId: data.organizationId, provider: data.provider };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    await context.db.sql(
      `DELETE FROM public.crm_connections
        WHERE organization_id = $1 AND provider = $2::crm_provider`,
      [orgId, data.provider],
    );
    return { ok: true };
  });

/**
 * Recent deliveries, matched or not.
 *
 * The failures are the point. A webhook that fires and quietly changes nothing
 * — an unmapped stage, an email belonging to no lead — is otherwise invisible,
 * and is the first thing to check when someone says the sync is not working.
 */
export const listCrmEvents = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; provider?: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return {
      organizationId: data.organizationId,
      provider: data.provider && isCrmProvider(data.provider) ? data.provider : null,
    };
  })
  .handler(async ({ data, context }): Promise<CrmEvent[]> => {
    const orgId = await requireOrganization(context.db, data.organizationId);
    const rows = await context.db.sql<{
      id: string;
      provider: CrmProvider;
      matched: boolean;
      external_stage: string | null;
      mapped_stage: string | null;
      email: string | null;
      error: string | null;
      created_at: string;
    }>(
      `SELECT id, provider::text AS provider, matched, external_stage,
              mapped_stage::text AS mapped_stage, email, error, created_at
         FROM public.crm_events
        WHERE organization_id = $1
          AND ($2::text IS NULL OR provider = $2::crm_provider)
     ORDER BY created_at DESC
        LIMIT 25`,
      [orgId, data.provider],
    );
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      matched: r.matched,
      externalStage: r.external_stage,
      mappedStage: r.mapped_stage,
      email: r.email,
      error: r.error,
      createdAt: r.created_at,
    }));
  });

export { CRM_PROVIDERS, MAPPABLE_STAGES };
