import { createServerFn } from "@tanstack/react-start";
import { requireAuth, resolveWorkspaceAccess } from "@/auth/middleware";

/**
 * One enquiry that was recorded more than once.
 *
 * These exist because de-duplication is a guess made in the moment: the
 * tracker sees a submit, the server sees a payload, and neither can be certain
 * a second one is the same person finishing rather than a new enquiry. When
 * the guess goes wrong it goes wrong silently, and the last time it did the
 * only reason anybody noticed was a partner recording his screen.
 *
 * So the leftovers are shown rather than cleaned up behind the scenes: a
 * workspace can see its own double-counting, and merging stays a decision a
 * person makes about their own pipeline.
 */

export type DuplicateGroup = {
  /** Stable id for the group — the lead that would be kept. */
  keepId: string;
  duplicateIds: string[];
  /** Email, phone or name, whichever identifies them. Masked for an agency
   *  the workspace has limited to names only. */
  who: string;
  pagePath: string;
  copies: number;
  firstSeen: string;
  lastSeen: string;
  /** False once someone has staged, tagged or annotated one of the copies —
   *  then merging would throw away a person's work, so we do not offer it. */
  safeToMerge: boolean;
};

/** Leads arriving more than once within this many minutes of each other. */
const WINDOW_MINUTES = 60;

export const listDuplicateLeads = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<DuplicateGroup[]> => {
    const access = await resolveWorkspaceAccess(context.db, data.organizationId);
    // Same rule as the pipeline itself: an agency held to metrics sees no rows.
    if (access.level === "metrics_only" && !access.viaMembership) return [];

    const rows = await context.db.sql<{
      keep_id: string;
      duplicate_ids: string[];
      who: string;
      page_path: string;
      copies: string;
      first_seen: string;
      last_seen: string;
      safe_to_collapse: boolean;
    }>(
      `SELECT keep_id, duplicate_ids, who, page_path, copies,
              first_seen, last_seen, safe_to_collapse
         FROM app.find_duplicate_leads($1::uuid, $2)`,
      [access.organizationId, WINDOW_MINUTES],
    );

    const masked = !access.viaMembership && access.level !== "full";
    return rows.map((r) => ({
      keepId: r.keep_id,
      duplicateIds: r.duplicate_ids ?? [],
      // The identifier is an email or a phone number, which is exactly what
      // "names only" exists to withhold.
      who: masked ? "Hidden" : r.who,
      pagePath: r.page_path,
      copies: Number(r.copies),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      safeToMerge: r.safe_to_collapse,
    }));
  });

/**
 * Merges every group that is still safe to merge.
 *
 * Deliberately not per-group: the database decides what is safe at the moment
 * the merge runs, so a group someone edited in another tab is skipped rather
 * than merged on the strength of a list that was already stale.
 */
export const mergeDuplicateLeads = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ merged: number; removed: number }> => {
    const access = await resolveWorkspaceAccess(context.db, data.organizationId);
    // Merging deletes leads, so it needs the same standing as changing them.
    if (access.level !== "full") throw new Error("Forbidden");

    const rows = await context.db.sql<{ kept: string; removed: number }>(
      `SELECT kept, removed FROM app.collapse_duplicate_leads($1::uuid, $2, false)`,
      [access.organizationId, WINDOW_MINUTES],
    );

    return {
      merged: rows.length,
      removed: rows.reduce((n, r) => n + Number(r.removed ?? 0), 0),
    };
  });
