import { createServerFn } from "@tanstack/react-start";

export type DashboardRange = 7 | 30 | 90;

export type DashboardSource = {
  name: string;
  leads: number;
  conv: number;
  wonValue: number;
};

export type DashboardMetrics = {
  range: DashboardRange;
  totals: {
    total: number;
    open: number;
    qualified: number;
    won: number;
    expired: number;
  };
  deltas: {
    total: number; // percentage change vs previous period
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

function classifyStage(stage: string): "open" | "qualified" | "won" | "expired" | "other" {
  const s = (stage ?? "").toLowerCase();
  if (s === "new" || s === "contacted") return "open";
  if (s === "qualified") return "qualified";
  if (s === "won") return "won";
  if (s === "lost" || s === "disqualified") return "expired";
  return "other";
}

export const getDashboardMetrics = createServerFn({ method: "POST" })
  .inputValidator((data: { workspaceKey: string; range: DashboardRange }) => {
    if (!data?.workspaceKey || data.workspaceKey.length > 128) throw new Error("Invalid workspace");
    if (![7, 30, 90].includes(data.range)) throw new Error("Invalid range");
    return data;
  })
  .handler(async ({ data }): Promise<DashboardMetrics> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const dayMs = 86_400_000;
    const currStart = new Date(now - data.range * dayMs).toISOString();
    const prevStart = new Date(now - 2 * data.range * dayMs).toISOString();

    const { data: rows } = await supabaseAdmin
      .from("leads")
      .select("stage,source,won_value,created_at")
      .eq("workspace_key", data.workspaceKey)
      .gte("created_at", prevStart);

    const all = (rows ?? []) as Array<{
      stage: string;
      source: string;
      won_value: number | null;
      created_at: string;
    }>;

    const curr = all.filter((r) => r.created_at >= currStart);
    const prev = all.filter((r) => r.created_at < currStart);

    const bucket = (list: typeof all) => {
      const b = { total: list.length, open: 0, qualified: 0, won: 0, expired: 0, wonValue: 0 };
      for (const r of list) {
        const c = classifyStage(r.stage);
        if (c === "open") b.open++;
        else if (c === "qualified") b.qualified++;
        else if (c === "won") {
          b.won++;
          b.wonValue += Number(r.won_value ?? 0);
        } else if (c === "expired") b.expired++;
      }
      return b;
    };

    const c = bucket(curr);
    const p = bucket(prev);

    // Sources
    const sourceMap = new Map<string, DashboardSource>();
    for (const r of curr) {
      const name = r.source?.trim() || "Direct";
      const entry = sourceMap.get(name) ?? { name, leads: 0, conv: 0, wonValue: 0 };
      entry.leads++;
      const cls = classifyStage(r.stage);
      if (cls === "won") {
        entry.conv++;
        entry.wonValue += Number(r.won_value ?? 0);
      } else if (cls === "qualified") {
        entry.conv++;
      }
      sourceMap.set(name, entry);
    }
    const sources = [...sourceMap.values()]
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 5);

    // Chart buckets: split current range into ~12 buckets
    const buckets = data.range === 7 ? 7 : data.range === 30 ? 12 : 18;
    const bucketMs = (data.range * dayMs) / buckets;
    const chart = Array.from({ length: buckets }, () => ({ won: 0, conv: 0 }));
    const startMs = now - data.range * dayMs;
    for (const r of curr) {
      const idx = Math.min(
        buckets - 1,
        Math.max(0, Math.floor((new Date(r.created_at).getTime() - startMs) / bucketMs)),
      );
      const cls = classifyStage(r.stage);
      if (cls === "won") {
        chart[idx].won++;
        chart[idx].conv++;
      } else if (cls === "qualified") {
        chart[idx].conv++;
      }
    }

    return {
      range: data.range,
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
      sources,
      chart,
    };
  });
