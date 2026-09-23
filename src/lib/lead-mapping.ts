import type {
  Lead,
  Priority,
  Qualification,
  Consent,
  LeadLabel,
  Source,
  FormAnswerValue,
} from "@/components/leadlogr/lead-types";

/**
 * Translation between the database's stable identifiers and the display names
 * the UI has always used.
 *
 * The UI keys leads by stage *name* ("Qualified"), while the database stores a
 * lowercase enum value ('qualified'). Keeping display strings out of the
 * database means renaming a stage in the UI never requires a migration.
 */

export type DbStage = "new" | "contacted" | "qualified" | "won" | "lost" | "disqualified";
export type DbPriority = "low" | "medium" | "high";
export type DbQualification = "unqualified" | "qualified" | "customer";
export type DbConsent = "unknown" | "accepted" | "declined";
export type DbLabel = "none" | "hot" | "spam" | "quotation_sent";

const STAGE_TO_UI: Record<DbStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
  disqualified: "Disqualified",
};

const PRIORITY_TO_UI: Record<DbPriority, Priority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const QUALIFICATION_TO_UI: Record<DbQualification, Qualification> = {
  unqualified: "Unqualified",
  qualified: "Qualified",
  customer: "Customer",
};

const CONSENT_TO_UI: Record<DbConsent, Consent> = {
  unknown: "Unknown",
  accepted: "Accepted",
  declined: "Declined",
};

const LABEL_TO_UI: Record<DbLabel, LeadLabel> = {
  none: "No label",
  hot: "Hot Lead",
  spam: "Spam Lead",
  quotation_sent: "Quotation Sent",
};

function invert<K extends string, V extends string>(map: Record<K, V>): Record<string, K> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [String(v).toLowerCase(), k])) as Record<string, K>;
}

const STAGE_FROM_UI = invert(STAGE_TO_UI);
const PRIORITY_FROM_UI = invert(PRIORITY_TO_UI);
const QUALIFICATION_FROM_UI = invert(QUALIFICATION_TO_UI);
const CONSENT_FROM_UI = invert(CONSENT_TO_UI);
const LABEL_FROM_UI = invert(LABEL_TO_UI);

/** Display name -> database enum. Falls back rather than throwing on unknowns. */
export const toDbStage = (v: string | null | undefined): DbStage =>
  STAGE_FROM_UI[String(v ?? "").toLowerCase()] ?? "new";
export const toDbPriority = (v: string | null | undefined): DbPriority =>
  PRIORITY_FROM_UI[String(v ?? "").toLowerCase()] ?? "medium";
export const toDbQualification = (v: string | null | undefined): DbQualification =>
  QUALIFICATION_FROM_UI[String(v ?? "").toLowerCase()] ?? "unqualified";
export const toDbConsent = (v: string | null | undefined): DbConsent =>
  CONSENT_FROM_UI[String(v ?? "").toLowerCase()] ?? "unknown";
export const toDbLabel = (v: string | null | undefined): DbLabel =>
  LABEL_FROM_UI[String(v ?? "").toLowerCase()] ?? "none";

/** A row as selected by the lead queries in leads.functions.ts. */
export type LeadRow = {
  id: string;
  stage: DbStage;
  stage_changed_at: string | null;
  qualification: DbQualification;
  qualified_at: string | null;
  priority: DbPriority;
  label: DbLabel;
  won_value: string | number | null;
  currency: string;
  lost_reason: string | null;
  expires_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
  description: string | null;
  notes: string | null;
  tags: string[] | null;
  source: string | null;
  campaign_name: string | null;
  website_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  li_fat_id: string | null;
  fbp: string | null;
  ga_client_id: string | null;
  ga_session_id: string | null;
  landing_page_url: string | null;
  page_path: string | null;
  referrer_url: string | null;
  consent: DbConsent;
  custom_fields: Record<string, FormAnswerValue> | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  history?: Array<{ id: string; kind: string; at: string; message: string; actor?: string }> | null;
};

const str = (v: string | null | undefined): string => v ?? "";

const KNOWN_SOURCES = ["Google", "Meta", "Direct", "LinkedIn", "Microsoft"] as const;

function toUiSource(v: string | null): Source {
  const found = KNOWN_SOURCES.find((s) => s.toLowerCase() === String(v ?? "").toLowerCase());
  return found ?? "Direct";
}

/**
 * Database row -> the Lead shape the UI components expect.
 *
 * Nullable columns collapse to empty strings here, because the UI's Lead type
 * has always used `string`. The distinction between absent and empty is
 * preserved where it matters — in the database and in the queries.
 */
export function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    stage: STAGE_TO_UI[row.stage] ?? "New",
    name: str(row.name),
    email: str(row.email),
    phone: str(row.phone),
    description: str(row.description) || str(row.message),
    priority: PRIORITY_TO_UI[row.priority] ?? "Medium",
    qualification: QUALIFICATION_TO_UI[row.qualification] ?? "Unqualified",
    value: row.won_value == null ? 0 : Number(row.won_value),
    campaignName: str(row.campaign_name) || str(row.utm_campaign),
    tags: row.tags ?? [],
    notes: str(row.notes),
    source: toUiSource(row.source),
    company: str(row.company),
    integrationId:
      typeof row.raw_payload?.integration_id === "string" ? row.raw_payload.integration_id : "",
    utmSource: str(row.utm_source),
    utmMedium: str(row.utm_medium),
    utmCampaign: str(row.utm_campaign),
    gclid: str(row.gclid),
    fbclid: str(row.fbclid),
    liTrackingId: str(row.li_fat_id),
    msclkid: str(row.msclkid),
    fbp: str(row.fbp),
    gaClientId: str(row.ga_client_id),
    gaSessionId: str(row.ga_session_id),
    currency: row.currency ?? "EUR",
    websiteUrl: str(row.website_url),
    landingPageUrl: str(row.landing_page_url),
    pagePath: str(row.page_path),
    referrerUrl: str(row.referrer_url),
    consent: CONSENT_TO_UI[row.consent] ?? "Unknown",
    // Whatever the customer's own form submitted beyond the known fields.
    formAnswers: row.custom_fields ?? {},
    label: LABEL_TO_UI[row.label] ?? "No label",
    expiresAt: row.expires_at ?? "",
    lossReason: row.lost_reason ?? undefined,
    qualifiedAt: row.qualified_at ?? undefined,
    history: (row.history ?? []).map((h) => ({
      id: h.id,
      kind: h.kind as Lead["history"][number]["kind"],
      at: h.at,
      message: h.message,
      actor: h.actor,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The column list every lead query selects, kept in one place. */
export const LEAD_COLUMNS = `
  l.id, l.stage, l.stage_changed_at, l.qualification, l.qualified_at, l.priority,
  l.label, l.won_value, l.currency, l.lost_reason, l.expires_at,
  l.name, l.email, l.phone, l.company, l.message, l.description, l.notes, l.tags,
  l.source, l.campaign_name, l.website_url,
  l.utm_source, l.utm_medium, l.utm_campaign,
  l.gclid, l.fbclid, l.msclkid, l.li_fat_id, l.fbp, l.ga_client_id, l.ga_session_id,
  l.landing_page_url, l.page_path, l.referrer_url,
  l.consent, l.custom_fields, l.raw_payload, l.created_at, l.updated_at
`;
