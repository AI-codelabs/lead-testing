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

    const [totals, sources, chart] = await Promise.all([
      context.db.sql<BucketRow>(
        `SELECT CASE WHEN created_at >= now() - ($2 || ' days')::interval
                     THEN 'curr' ELSE 'prev' END        AS period,
                ${BUCKET_SQL}                            AS bucket,
                count(*)                                 AS n,
                COALESCE(sum(won_value) FILTER (WHERE stage = 'won'), 0) AS won_value
           FROM public.leads
          WHERE organization_id = $1
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
            AND created_at >= now() - ($2 || ' days')::interval
       GROUP BY 1`,
        [organizationId, String(range), String(buckets)],
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
      },
      wonValue: c.wonValue,
      spend: 0,
      hasSpend: false,
      sources: sources.map((s) => ({
        name: s.name,
        leads: Number(s.leads),
        conv: Number(s.conv),
        wonValue: Number(s.won_value),
      })),
      chart: chartOut,
    };
  });
