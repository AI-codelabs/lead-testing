import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";
import type { Lead } from "@/components/leadlogr/lead-types";
import {
  LEAD_COLUMNS,
  rowToLead,
  toDbStage,
  toDbPriority,
  toDbQualification,
  toDbLabel,
  type LeadRow,
} from "./lead-mapping";

/**
 * Leads for one organization.
 *
 * Row level security restricts this to organizations the caller belongs to,
 * so the organizationId below narrows the result — it does not authorize it.
 * Passing another tenant's id returns nothing.
 */
export const listLeads = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; limit?: number }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return {
      organizationId: data.organizationId,
      limit: Math.min(Math.max(data.limit ?? 500, 1), 1000),
    };
  })
  .handler(async ({ data, context }): Promise<Lead[]> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    const rows = await context.db.sql<LeadRow>(
      `SELECT ${LEAD_COLUMNS}
         FROM public.leads l
        WHERE l.organization_id = $1
     ORDER BY l.created_at DESC
        LIMIT $2`,
      [organizationId, data.limit],
    );

    return rows.map(rowToLead);
  });

/** One lead, with its activity timeline. */
export const getLead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { leadId: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<Lead | null> => {
    const row = await context.db.one<LeadRow>(
      `SELECT ${LEAD_COLUMNS},
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'id', a.id, 'kind', a.kind, 'at', a.created_at,
                          'message', a.message, 'actor', a.actor_name)
                        ORDER BY a.created_at DESC)
                   FROM public.lead_activity a
                  WHERE a.lead_id = l.id),
                '[]'::json
              ) AS history
         FROM public.leads l
        WHERE l.id = $1`,
      [data.leadId],
    );

    return row ? rowToLead(row) : null;
  });

/**
 * Moves a lead to a new stage and queues the matching conversion upload.
 *
 * `stage_changed_at` and the activity entry are written by database triggers,
 * so the timeline cannot drift from the data even if another caller updates
 * the row directly.
 */
export const setLeadStage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      leadId: string;
      stage: string;
      wonValue?: number | null;
      lostReason?: string | null;
      qualification?: string | null;
    }) => {
      if (!data?.leadId) throw new Error("leadId is required");
      if (!data?.stage) throw new Error("stage is required");
      return {
        leadId: data.leadId,
        stage: toDbStage(data.stage),
        wonValue:
          typeof data.wonValue === "number" && Number.isFinite(data.wonValue)
            ? data.wonValue
            : null,
        lostReason:
          typeof data.lostReason === "string" ? data.lostReason.slice(0, 500) : null,
        qualification: data.qualification ? toDbQualification(data.qualification) : null,
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const updated = await context.db.one<{ id: string; organization_id: string }>(
      `UPDATE public.leads
          SET stage         = $2::lead_stage,
              won_value     = COALESCE($3, won_value),
              lost_reason   = COALESCE($4, lost_reason),
              qualification = COALESCE($5::lead_qualification, qualification),
              qualified_at  = CASE
                                WHEN $2::lead_stage = 'qualified' AND qualified_at IS NULL
                                THEN now() ELSE qualified_at
                              END
        WHERE id = $1
    RETURNING id, organization_id`,
      [data.leadId, data.stage, data.wonValue, data.lostReason, data.qualification],
    );

    // Null means RLS filtered the row out: the lead belongs to another tenant,
    // or does not exist. Both are "not yours" from the caller's perspective.
    if (!updated) throw new Error("Lead not found");

    try {
      const { queueConversion } = await import("./conversions.functions");
      void queueConversion({ data: { leadId: data.leadId, stage: data.stage } });
    } catch {
      // A conversion upload must never fail a stage change.
    }

    return { ok: true };
  });

/** Edits the mutable fields of a lead. */
export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      leadId: string;
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      description?: string;
      notes?: string;
      priority?: string;
      label?: string;
      tags?: string[];
      value?: number | null;
    }) => {
      if (!data?.leadId) throw new Error("leadId is required");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const updated = await context.db.one<{ id: string }>(
      `UPDATE public.leads
          SET name        = COALESCE($2,  name),
              email       = COALESCE($3,  email),
              phone       = COALESCE($4,  phone),
              company     = COALESCE($5,  company),
              description = COALESCE($6,  description),
              notes       = COALESCE($7,  notes),
              priority    = COALESCE($8::lead_priority, priority),
              label       = COALESCE($9::lead_label, label),
              tags        = COALESCE($10, tags),
              won_value   = COALESCE($11, won_value)
        WHERE id = $1
    RETURNING id`,
      [
        data.leadId,
        data.name ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.company ?? null,
        data.description ?? null,
        data.notes ?? null,
        data.priority ? toDbPriority(data.priority) : null,
        data.label ? toDbLabel(data.label) : null,
        data.tags ?? null,
        typeof data.value === "number" ? data.value : null,
      ],
    );

    if (!updated) throw new Error("Lead not found");
    return { ok: true };
  });

/** Appends a note to a lead's timeline. */
export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { leadId: string; message: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    const message = String(data.message ?? "").trim().slice(0, 2000);
    if (!message) throw new Error("Note cannot be empty");
    return { leadId: data.leadId, message };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    // The subquery inherits RLS, so a lead in another organization yields no
    // row and the insert affects nothing.
    const rows = await context.db.sql<{ id: string }>(
      `INSERT INTO public.lead_activity (organization_id, lead_id, kind, message, actor_id, actor_name)
       SELECT l.organization_id, l.id, 'note', $2, $3, $4
         FROM public.leads l
        WHERE l.id = $1
       RETURNING id`,
      [data.leadId, data.message, context.userId, context.email],
    );

    if (rows.length === 0) throw new Error("Lead not found");
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { leadId: string }) => {
    if (!data?.leadId) throw new Error("leadId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const deleted = await context.db.one<{ id: string }>(
      `DELETE FROM public.leads WHERE id = $1 RETURNING id`,
      [data.leadId],
    );

    if (!deleted) throw new Error("Lead not found");
    return { ok: true };
  });
