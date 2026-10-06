import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/auth/middleware";
import { resolveWorkspaceAccess } from "@/auth/middleware";
import { withOwner } from "@/db";

/**
 * Ad spend, cached per day.
 *
 * The dashboard reported spend as a hardcoded 0, so the ROI and ROAS cards were
 * permanently empty — the single figure the product exists to produce.
 *
 * Spend is cached rather than queried live: the dashboard is opened constantly,
 * a Google Ads query takes about a second, and a past day's spend does not
 * change. Only the recent window is ever re-read, because today's figure is
 * still moving and Google restates the last couple of days.
 */

/** Days re-read on every sync, because their figures can still change. */
const VOLATILE_DAYS = 3;

/** How long a sync is considered fresh enough to skip. */
const FRESH_FOR_MS = 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pulls recent spend from Google and stores it.
 *
 * Runs on the owner connection: it needs the ad credentials, which app_user is
 * deliberately not granted, and it writes to a table app_user may only read.
 * Safe to call often — it returns early while the cache is fresh, and re-reads
 * only the days whose figures can still move.
 */
export const syncAdSpend = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; days?: number; force?: boolean }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return {
      organizationId: data.organizationId,
      days: Math.min(Math.max(data.days ?? 90, 1), 365),
      force: data.force === true,
    };
  })
  .handler(async ({ data, context }): Promise<{ synced: boolean; days: number; reason?: string }> => {
    // Membership or a managing agency, same reach as the dashboard figures.
    const access = await resolveWorkspaceAccess(context.db, data.organizationId);
    const orgId = access.organizationId;

    return withOwner(async (db) => {
      const settings = await db.one<{
        account_id: string | null;
        secondary_id: string | null;
        refresh_token: string | null;
      }>(
        `SELECT s.account_id, s.secondary_id, c.refresh_token
           FROM public.ad_platform_settings s
      LEFT JOIN public.ad_platform_credentials c
             ON c.organization_id = s.organization_id AND c.network = s.network
          WHERE s.organization_id = $1 AND s.network = 'google_ads'`,
        [orgId],
      );
      if (!settings?.account_id) return { synced: false, days: 0, reason: "no_account" };

      const { buildGoogleAdsCreds, fetchDailySpend } = await import("./google-ads.server");
      const creds = buildGoogleAdsCreds(settings.refresh_token);
      if (!creds) return { synced: false, days: 0, reason: "not_connected" };

      if (!data.force) {
        const fresh = await db.one<{ synced_at: string }>(
          `SELECT max(synced_at) AS synced_at FROM public.ad_spend_daily
            WHERE organization_id = $1 AND network = 'google_ads'`,
          [orgId],
        );
        const last = fresh?.synced_at ? new Date(fresh.synced_at).getTime() : 0;
        if (last && Date.now() - last < FRESH_FOR_MS) {
          return { synced: false, days: 0, reason: "fresh" };
        }
      }

      // Everything already stored stays; only the window that can still change
      // is re-read, unless this is the first sync or a forced one.
      const stored = await db.one<{ n: string }>(
        `SELECT count(*) AS n FROM public.ad_spend_daily
          WHERE organization_id = $1 AND network = 'google_ads'`,
        [orgId],
      );
      const firstRun = Number(stored?.n ?? 0) === 0;
      const lookback = firstRun || data.force ? data.days : VOLATILE_DAYS;

      const to = new Date();
      const from = new Date(to.getTime() - (lookback - 1) * 86_400_000);

      const rows = await fetchDailySpend(
        creds,
        settings.account_id,
        isoDay(from),
        isoDay(to),
        settings.secondary_id ?? undefined,
      );

      for (const r of rows) {
        await db.sql(
          `INSERT INTO public.ad_spend_daily
             (organization_id, network, day, cost_micros, currency, synced_at)
           VALUES ($1, 'google_ads', $2::date, $3, $4, now())
           ON CONFLICT (organization_id, network, day) DO UPDATE SET
             cost_micros = EXCLUDED.cost_micros,
             currency    = EXCLUDED.currency,
             synced_at   = now()`,
          [orgId, r.day, r.costMicros, r.currency],
        );
      }

      return { synced: true, days: rows.length };
    });
  });
