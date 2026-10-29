import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

export type DashboardRange = 7 | 30 | 90;

export type DashboardSource = {
  name: string;
  leads: number;
  conv: number;
  wonValue: number;
};

export type DashboardMetrics = {
  range: DashboardRange;
  totals: { total: number; open: number; qualified: number; won: number; expired: number };
  deltas: {
    total: number;
    open: number;
    qualified: number;
    won: number;
    expired: number;
    wonValue: number;
    spend: number;
  };
  wonValue: number;
  spend: number;
  hasSpend: boolean;
  sources: DashboardSource[];
  chart: { won: number; conv: number }[];
};

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

// Groups the six stages into the four buckets the dashboard displays.
const BUCKET_SQL = `
  CASE stage
    WHEN 'new'          THEN 'open'
    WHEN 'contacted'    THEN 'open'
    WHEN 'qualified'    THEN 'qualified'
    WHEN 'won'          THEN 'won'
    WHEN 'lost'         THEN 'expired'
    WHEN 'disqualified' THEN 'expired'
  END`;

type BucketRow = {
  period: "curr" | "prev";
  bucket: "open" | "qualified" | "won" | "expired";
  n: string;
  won_value: string;
};

/**
 * Dashboard figures for one organization.
 *
 * All aggregation happens in Postgres. The Supabase version selected every row
 * in the window and counted them in JavaScript, which grew linearly with the
 * lead table and shipped the whole dataset over the wire to do it.
 */
export const getDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; range: DashboardRange }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (![7, 30, 90].includes(data.range)) throw new Error("Invalid range");
    return data;
  })
  .handler(async ({ data, context }): Promise<DashboardMetrics> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);
    const { range } = data;
    const buckets = range === 7 ? 7 : range === 30 ? 12 : 18;

    const [totals, sources, chart, spendRows] = await Promise.all([
      context.db.sql<BucketRow>(
        `SELECT CASE WHEN created_at >= now() - ($2 || ' days')::interval
                     THEN 'curr' ELSE 'prev' END        AS period,
                ${BUCKET_SQL}                            AS bucket,
                count(*)                                 AS n,
                COALESCE(sum(won_value) FILTER (WHERE stage = 'won'), 0) AS won_value
           FROM public.leads
          WHERE organization_id = $1
            AND NOT excluded
            AND created_at >= now() - ($3 || ' days')::interval
       GROUP BY 1, 2`,
        [organizationId, String(range), String(range * 2)],
      ),

      context.db.sql<{ name: string; leads: string; conv: string; won_value: string }>(
        `SELECT COALESCE(NULLIF(trim(source), ''), 'Direct') AS name,
                count(*)                                     AS leads,
                count(*) FILTER (WHERE stage IN ('qualified', 'won')) AS conv,
                COALESCE(sum(won_value) FILTER (WHERE stage = 'won'), 0) AS won_value
           FROM public.leads
          WHERE organization_id = $1
            AND NOT excluded
            AND created_at >= now() - ($2 || ' days')::interval
       GROUP BY 1
       ORDER BY leads DESC
          LIMIT 5`,
        [organizationId, String(range)],
      ),

      // width_bucket puts each lead in its slot without a round trip per bucket.
      context.db.sql<{ idx: string; won: string; conv: string }>(
        `SELECT width_bucket(
                  extract(epoch FROM created_at),
                  extract(epoch FROM now() - ($2 || ' days')::interval),
                  extract(epoch FROM now()),
                  $3
                )                                                      AS idx,
                count(*) FILTER (WHERE stage = 'won')                  AS won,
                count(*) FILTER (WHERE stage IN ('qualified', 'won'))  AS conv
           FROM public.leads
          WHERE organization_id = $1
            AND NOT excluded
            AND created_at >= now() - ($2 || ' days')::interval
       GROUP BY 1`,
        [organizationId, String(range), String(buckets)],
      ),
      // Spend for the same window, and the one before it, from the cached day
      // rows. Read here rather than queried from Google so opening the
      // dashboard stays instant.
      context.db.sql<{ period: string; cost_micros: string; currency: string }>(
        `SELECT CASE WHEN day >= (current_date - ($2::int - 1))
                     THEN 'curr' ELSE 'prev' END AS period,
                sum(cost_micros)::text           AS cost_micros,
                min(currency)                    AS currency
           FROM public.ad_spend_daily
          WHERE organization_id = $1
            AND day >= (current_date - ($2::int * 2 - 1))
       GROUP BY 1`,
        [organizationId, range],
      ),
    ]);

    const pick = (period: "curr" | "prev") => {
      const rows = totals.filter((r) => r.period === period);
      const get = (bucket: string) => Number(rows.find((r) => r.bucket === bucket)?.n ?? 0);
      return {
        total: rows.reduce((sum, r) => sum + Number(r.n), 0),
        open: get("open"),
        qualified: get("qualified"),
        won: get("won"),
        expired: get("expired"),
        wonValue: rows.reduce((sum, r) => sum + Number(r.won_value), 0),
      };
    };

    const c = pick("curr");
    const p = pick("prev");

    const chartOut = Array.from({ length: buckets }, () => ({ won: 0, conv: 0 }));
    for (const row of chart) {
      // width_bucket is 1-based, and returns buckets+1 for the upper bound.
      const idx = Math.min(buckets, Math.max(1, Number(row.idx))) - 1;
      chartOut[idx].won += Number(row.won);
      chartOut[idx].conv += Number(row.conv);
    }

    // Micros are Google's unit: a millionth of the account currency.
    const spendFor = (period: string) =>
      Number(spendRows.find((r) => r.period === period)?.cost_micros ?? 0) / 1_000_000;
    const currSpend = spendFor("curr");
    const prevSpend = spendFor("prev");
    // Zero spend is a real answer; no rows at all means nothing has synced yet,
    // and the cards should keep saying so rather than claim a ROI of zero.
    const hasSpend = spendRows.length > 0;

    return {
      range,
      totals: {
        total: c.total,
        open: c.open,
        qualified: c.qualified,
        won: c.won,
        expired: c.expired,
      },
      deltas: {
        total: pctChange(c.total, p.total),
        open: pctChange(c.open, p.open),
        qualified: pctChange(c.qualified, p.qualified),
        won: pctChange(c.won, p.won),
        expired: pctChange(c.expired, p.expired),
        wonValue: pctChange(c.wonValue, p.wonValue),
        spend: pctChange(currSpend, prevSpend),
      },
      wonValue: c.wonValue,
      spend: currSpend,
      hasSpend,
      sources: sources.map((s) => ({
        name: s.name,
        leads: Number(s.leads),
        conv: Number(s.conv),
        wonValue: Number(s.won_value),
      })),
      chart: chartOut,
    };
  });

/** One week or month of performance, for the export. */
export type PerformancePeriod = {
  /** ISO date of the first day in the period. */
  start: string;
  /** How it should read in the file: "2026-W41" or "2026-10". */
  label: string;
  leads: number;
  qualified: number;
  won: number;
  wonValue: number;
  spend: number;
  currency: string;
};

/**
 * Performance broken down by week or month, for the dashboard export.
 *
 * Built as its own query rather than reshaped from getDashboardMetrics: that
 * one answers "how are we doing now" against a rolling window and keeps no
 * dates, which is the wrong shape for a table someone reads down in a meeting.
 *
 * Leads and spend are aggregated separately and joined on the period, because
 * a week can have spend with no leads and leads with no spend, and both of
 * those are worth seeing rather than silently dropping.
 */
export const getPerformanceBreakdown = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; period: "week" | "month"; periods?: number }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (data.period !== "week" && data.period !== "month") throw new Error("Invalid period");
    return {
      organizationId: data.organizationId,
      period: data.period,
      periods: Math.min(Math.max(data.periods ?? (data.period === "week" ? 12 : 12), 1), 52),
    };
  })
  .handler(async ({ data, context }): Promise<PerformancePeriod[]> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);
    const unit = data.period; // 'week' | 'month', both valid date_trunc units
    const back = `${data.periods} ${unit}s`;

    const [leadRows, spendRows] = await Promise.all([
      context.db.sql<{ start: string; leads: string; qualified: string; won: string; won_value: string }>(
        `SELECT date_trunc($2, created_at)::date::text              AS start,
                count(*)                                            AS leads,
                count(*) FILTER (WHERE stage IN ('qualified','won')) AS qualified,
                count(*) FILTER (WHERE stage = 'won')               AS won,
                COALESCE(sum(won_value) FILTER (WHERE stage = 'won'), 0) AS won_value
           FROM public.leads
          WHERE organization_id = $1
            AND NOT excluded
            AND created_at >= date_trunc($2, now()) - $3::interval
       GROUP BY 1`,
        [organizationId, unit, back],
      ),
      context.db.sql<{ start: string; cost_micros: string; currency: string }>(
        `SELECT date_trunc($2, day)::date::text AS start,
                COALESCE(sum(cost_micros), 0)   AS cost_micros,
                COALESCE(max(currency), 'EUR')  AS currency
           FROM public.ad_spend_daily
          WHERE organization_id = $1
            AND day >= (date_trunc($2, now()) - $3::interval)::date
       GROUP BY 1`,
        [organizationId, unit, back],
      ),
    ]);

    const spendBy = new Map(spendRows.map((r) => [r.start, r]));
    const leadsBy = new Map(leadRows.map((r) => [r.start, r]));

    // Every period in the window gets a row, including the empty ones: a gap
    // in a report reads as missing data, where a zero reads as a quiet week.
    const out: PerformancePeriod[] = [];
    const now = new Date();
    for (let i = data.periods - 1; i >= 0; i--) {
      const d = new Date(now);
      if (unit === "week") {
        const day = (d.getUTCDay() + 6) % 7; // Monday-based
        d.setUTCDate(d.getUTCDate() - day - i * 7);
      } else {
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - i);
      }
      d.setUTCHours(0, 0, 0, 0);
      const start = d.toISOString().slice(0, 10);
      const l = leadsBy.get(start);
      const sp = spendBy.get(start);
      out.push({
        start,
        label: unit === "week" ? `${d.getUTCFullYear()}-W${isoWeek(d)}` : start.slice(0, 7),
        leads: Number(l?.leads ?? 0),
        qualified: Number(l?.qualified ?? 0),
        won: Number(l?.won ?? 0),
        wonValue: Number(l?.won_value ?? 0),
        spend: Number(sp?.cost_micros ?? 0) / 1_000_000,
        currency: sp?.currency ?? "EUR",
      });
    }
    return out;
  });

/** ISO-8601 week number, zero padded. */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return String(week).padStart(2, "0");
}
