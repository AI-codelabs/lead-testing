import { useEffect, useMemo, useState } from "react";
import { listLeads } from "@/lib/leads.functions";
import type { Lead } from "@/components/leadlogr/lead-types";

const POLL_INTERVAL_MS = 5000;

/**
 * Leads for an organization, refreshed on an interval.
 *
 * Polling rather than a realtime subscription: lead rows carry contact details,
 * and a subscription would push them to every connected browser session. The
 * server function reads on a tenant-scoped connection, so the rows that come
 * back are already limited to organizations the caller belongs to.
 *
 * Row mapping now lives in lib/lead-mapping.ts and happens server-side, so this
 * hook no longer reshapes rows itself.
 */
export function useLiveLeads(organizationId: string | null | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);

  const orgId = useMemo(() => organizationId ?? "", [organizationId]);

  useEffect(() => {
    if (!orgId) {
      setLeads([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const rows = await listLeads({ data: { organizationId: orgId } });
        if (!cancelled) setLeads(rows);
      } catch (err) {
        // A poll failing is not worth surfacing: the next tick retries, and
        // the previously loaded leads stay on screen.
        console.error("[useLiveLeads] refresh failed", err);
      }
    };

    void load();
    const timer = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orgId]);

  return leads;
}
