import { createServerFn } from "@tanstack/react-start";
import { requireAuth, resolveWorkspaceAccess } from "@/auth/middleware";

/**
 * Which forms on a workspace's site count as leads.
 *
 * Driven by what we have actually seen rather than by patterns someone types
 * blind: every lead carries the form it came from, so the workspace picks from
 * a real list. Anything nobody has ruled on is collected — a pipeline with
 * noise in it is a visible problem somebody fixes, while one silently missing
 * enquiries is invisible and costs money.
 */

export type FormCaptureMode = "collect" | "hide" | "block";

export type DiscoveredForm = {
  formAction: string;
  pagePath: string;
  /** Page title as we saw it, for a name a human recognises. */
  label: string;
  /** How many leads have arrived from it, hidden ones included. */
  leads: number;
  hidden: number;
  lastSeen: string | null;
  mode: FormCaptureMode;
  /** No rule has been saved for this one yet, so it is collected by default. */
  unreviewed: boolean;
};

const MODES: FormCaptureMode[] = ["collect", "hide", "block"];
const isMode = (v: string): v is FormCaptureMode => (MODES as string[]).includes(v);

/**
 * Every form we have seen, with the rule currently applying to it.
 *
 * A blocked form stops producing leads, so it would vanish from a list built
 * only from leads. Saved rules are unioned in to keep it visible and
 * reversible — otherwise switching one off would be a one-way door.
 */
export const listForms = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<DiscoveredForm[]> => {
    const access = await resolveWorkspaceAccess(context.db, data.organizationId);
    const orgId = access.organizationId;

    const rows = await context.db.sql<{
      form_action: string;
      page_path: string;
      label: string;
      leads: string;
      hidden: string;
      last_seen: string | null;
      mode: string | null;
    }>(
      `WITH seen AS (
         SELECT COALESCE(l.custom_fields->>'form_action', l.raw_payload->>'form_action', '') AS form_action,
                COALESCE(l.page_path, '')                                                    AS page_path,
                COALESCE(max(l.custom_fields->>'page_title'), '')                            AS label,
                count(*)                                                                     AS leads,
                count(*) FILTER (WHERE l.excluded)                                           AS hidden,
                max(l.created_at)                                                            AS last_seen
           FROM public.leads l
          WHERE l.organization_id = $1
       GROUP BY 1, 2
       ), ruled AS (
         SELECT r.form_action, r.page_path, r.label, '0' AS leads, '0' AS hidden,
                NULL::timestamptz AS last_seen
           FROM public.form_rules r
          WHERE r.organization_id = $1
       )
       SELECT COALESCE(s.form_action, u.form_action) AS form_action,
              COALESCE(s.page_path,   u.page_path)   AS page_path,
              COALESCE(NULLIF(s.label, ''), u.label, '') AS label,
              COALESCE(s.leads, 0)                   AS leads,
              COALESCE(s.hidden, 0)                  AS hidden,
              s.last_seen                            AS last_seen,
              r.mode::text                           AS mode
         FROM seen s
    FULL OUTER JOIN ruled u
           ON u.form_action = s.form_action AND u.page_path = s.page_path
    LEFT JOIN public.form_rules r
           ON r.organization_id = $1
          AND r.form_action = COALESCE(s.form_action, u.form_action)
          AND r.page_path   = COALESCE(s.page_path,   u.page_path)
     ORDER BY COALESCE(s.leads, 0) DESC, 1, 2`,
      [orgId],
    );

    return rows.map((r) => ({
      formAction: r.form_action ?? "",
      pagePath: r.page_path ?? "",
      label: r.label ?? "",
      leads: Number(r.leads ?? 0),
      hidden: Number(r.hidden ?? 0),
      lastSeen: r.last_seen,
      mode: r.mode && isMode(r.mode) ? r.mode : "collect",
      unreviewed: !r.mode,
    }));
  });

/**
 * Sets the rule for one form, and applies it to what is already stored.
 *
 * Retroactive on purpose: someone switching a form off means "these are not
 * leads", and leaving the existing ones in the pipeline would not answer that.
 * Switching it back on restores them, which is the whole reason `hide` keeps
 * the rows rather than deleting them.
 *
 * `block` stops future storage but does not delete history — throwing away
 * data is a separate, explicit act, not a side effect of changing a setting.
 */
export const setFormRule = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: {
      organizationId: string;
      formAction: string;
      pagePath: string;
      mode: string;
      label?: string;
    }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      if (!isMode(data.mode)) throw new Error("Unknown mode");
      return {
        organizationId: data.organizationId,
        formAction: (data.formAction ?? "").slice(0, 2000),
        pagePath: (data.pagePath ?? "").slice(0, 2000),
        mode: data.mode,
        label: (data.label ?? "").slice(0, 300),
      };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; affected: number }> => {
    const access = await resolveWorkspaceAccess(context.db, data.organizationId);
    if (access.level !== "full") throw new Error("Forbidden");
    const orgId = access.organizationId;

    await context.db.sql(
      `INSERT INTO public.form_rules (organization_id, form_action, page_path, mode, label)
       VALUES ($1, $2, $3, $4::form_capture_mode, $5)
       ON CONFLICT (organization_id, form_action, page_path)
       DO UPDATE SET mode = EXCLUDED.mode,
                     label = CASE WHEN EXCLUDED.label <> '' THEN EXCLUDED.label ELSE public.form_rules.label END,
                     updated_at = now()`,
      [orgId, data.formAction, data.pagePath, data.mode, data.label],
    );

    const affected = await context.db.sql<{ id: string }>(
      `UPDATE public.leads l
          SET excluded = $4
        WHERE l.organization_id = $1
          AND COALESCE(l.custom_fields->>'form_action', l.raw_payload->>'form_action', '') = $2
          AND COALESCE(l.page_path, '') = $3
          AND l.excluded <> $4
      RETURNING l.id`,
      [orgId, data.formAction, data.pagePath, data.mode !== "collect"],
    );

    return { ok: true, affected: affected.length };
  });
