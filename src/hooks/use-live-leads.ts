import { useEffect, useMemo, useState } from "react";
import { getWorkspaceLeads, type WorkspaceLeadRow } from "@/lib/leads-read.functions";
import {
  addHistory,
  emptyLead,
  type Lead,
  type Source,
} from "@/components/leadlogr/lead-types";

export type LiveLeadRow = WorkspaceLeadRow;

const VALID_SOURCES: Source[] = ["Google", "Meta", "Direct", "LinkedIn", "Microsoft"];

function toLead(row: WorkspaceLeadRow): Lead {
  const base = emptyLead(row.stage || "New");
  const source = (VALID_SOURCES as string[]).includes(row.source)
    ? (row.source as Source)
    : "Direct";
  const integrationId =
    row.raw_payload && typeof row.raw_payload.integration_id === "string"
      ? (row.raw_payload.integration_id as string)
      : "gtm";
  const lead: Lead = {
    ...base,
    id: row.id,
    stage: row.stage || "New",
    name: row.name || row.email || "Anonymous lead",
    email: row.email || "",
    phone: row.phone || "",
    company: row.company || "",
    description: row.message || "",
    integrationId,
    source,
    utmSource: row.utm_source || "",
    utmMedium: row.utm_medium || "",
    utmCampaign: row.utm_campaign || "",
    gclid: row.gclid || "",
    fbclid: row.fbclid || "",
    msclkid: row.msclkid || "",
    liTrackingId: row.li_fat_id || "",
    fbp: row.fbp || "",
    gaClientId: row.ga_client_id || "",
    gaSessionId: row.ga_session_id || "",
    landingPageUrl: row.landing_page_url || "",
    pagePath: row.page_path || "",
    referrerUrl: row.referrer_url || "",
    consent:
      row.consent === "Accepted" || row.consent === "Declined" ? row.consent : "Unknown",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return addHistory(lead, {
    kind: "created",
    message: "Captured by website tracker",
    at: row.created_at,
  });
}

const POLL_INTERVAL_MS = 5000;

/**
 * Live leads for a workspace_key. Reads go through a server function using the
 * service role; we poll every few seconds instead of subscribing to Realtime so
 * lead PII is never broadcast to the browser-side Supabase client.
 */
export function useLiveLeads(workspaceKey: string | null | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);

  const key = useMemo(() => workspaceKey ?? "", [workspaceKey]);

  useEffect(() => {
    if (!key) {
      setLeads([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await getWorkspaceLeads({ data: { workspaceKey: key } });
        if (cancelled) return;
        setLeads(rows.map(toLead));
      } catch (err) {
        if (!cancelled) console.error("[useLiveLeads] fetch failed", err);
      }
    };

    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  return leads;
}

/** Deterministic workspace key derived from workspace name. Matches the tracking page. */
export function deriveWorkspaceKey(name: string): string {
  const slug = (name || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "workspace";
  return `ws_${slug}`;
}
