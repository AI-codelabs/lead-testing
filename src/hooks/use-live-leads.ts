import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  addHistory,
  emptyLead,
  type Lead,
  type Source,
} from "@/components/leadlogr/lead-types";

export type LiveLeadRow = {
  id: string;
  workspace_key: string;
  stage: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  gclid: string;
  fbclid: string;
  msclkid: string;
  li_fat_id: string;
  fbp: string;
  ga_client_id: string;
  ga_session_id: string;
  landing_page_url: string;
  page_path: string;
  referrer_url: string;
  consent: string;
  created_at: string;
  updated_at: string;
};

const VALID_SOURCES: Source[] = ["Google", "Meta", "Direct", "LinkedIn", "Microsoft"];

function toLead(row: LiveLeadRow): Lead {
  const base = emptyLead(row.stage || "New");
  const source = (VALID_SOURCES as string[]).includes(row.source)
    ? (row.source as Source)
    : "Direct";
  const lead: Lead = {
    ...base,
    id: row.id,
    stage: row.stage || "New",
    name: row.name || row.email || "Anonymous lead",
    email: row.email || "",
    phone: row.phone || "",
    company: row.company || "",
    description: row.message || "",
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
  return addHistory(lead, { kind: "created", message: "Captured by website tracker", at: row.created_at });
}

/** Live leads for a workspace_key, with Realtime updates. */
export function useLiveLeads(workspaceKey: string | null | undefined) {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    if (!workspaceKey) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_key", workspaceKey)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        console.error("[useLiveLeads] fetch failed", error);
        return;
      }
      setLeads((data as LiveLeadRow[]).map(toLead));
    })();

    const channel = supabase
      .channel(`leads:${workspaceKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter: `workspace_key=eq.${workspaceKey}` },
        (payload) => {
          const lead = toLead(payload.new as LiveLeadRow);
          setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [workspaceKey]);

  return leads;
}

/** Deterministic workspace key derived from workspace name. Matches the tracking page. */
export function deriveWorkspaceKey(name: string): string {
  const slug = (name || "workspace").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "workspace";
  return `ws_${slug}`;
}
