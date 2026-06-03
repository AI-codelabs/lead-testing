export type Priority = "Low" | "Medium" | "High";
export type Qualification = "Unqualified" | "Qualified" | "Customer";
export type Consent = "Unknown" | "Accepted" | "Declined";
export type Source = "Google" | "Meta" | "Direct" | "LinkedIn" | "Microsoft";

export type PaletteKey =
  | "blue"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "purple"
  | "teal"
  | "pink"
  | "slate";

export interface Palette {
  key: PaletteKey;
  label: string;
  /** Bold dot / accent swatch utility */
  dot: string;
  /** Soft column background utility */
  soft: string;
  /** Ink color for stage labels */
  ink: string;
  /** Subtle ring / border utility */
  line: string;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  blue:   { key: "blue",   label: "Blue",   dot: "bg-stage-blue",   soft: "bg-stage-blue-soft",   ink: "text-stage-blue-ink",   line: "ring-stage-blue-line" },
  green:  { key: "green",  label: "Green",  dot: "bg-stage-green",  soft: "bg-stage-green-soft",  ink: "text-stage-green-ink",  line: "ring-stage-green-line" },
  amber:  { key: "amber",  label: "Amber",  dot: "bg-stage-amber",  soft: "bg-stage-amber-soft",  ink: "text-stage-amber-ink",  line: "ring-stage-amber-line" },
  orange: { key: "orange", label: "Orange", dot: "bg-stage-orange", soft: "bg-stage-orange-soft", ink: "text-stage-orange-ink", line: "ring-stage-orange-line" },
  red:    { key: "red",    label: "Red",    dot: "bg-stage-red",    soft: "bg-stage-red-soft",    ink: "text-stage-red-ink",    line: "ring-stage-red-line" },
  purple: { key: "purple", label: "Purple", dot: "bg-stage-purple", soft: "bg-stage-purple-soft", ink: "text-stage-purple-ink", line: "ring-stage-purple-line" },
  teal:   { key: "teal",   label: "Teal",   dot: "bg-stage-teal",   soft: "bg-stage-teal-soft",   ink: "text-stage-teal-ink",   line: "ring-stage-teal-line" },
  pink:   { key: "pink",   label: "Pink",   dot: "bg-stage-pink",   soft: "bg-stage-pink-soft",   ink: "text-stage-pink-ink",   line: "ring-stage-pink-line" },
  slate:  { key: "slate",  label: "Slate",  dot: "bg-stage-slate",  soft: "bg-stage-slate-soft",  ink: "text-stage-slate-ink",  line: "ring-stage-slate-line" },
};

export const PALETTE_ORDER: PaletteKey[] = [
  "blue", "green", "amber", "orange", "red", "purple", "teal", "pink", "slate",
];

export interface StageDef {
  id: string;
  name: string;
  /** Locked stages cannot be renamed, removed, or reordered, but their color is still editable. */
  locked: boolean;
  palette: PaletteKey;
}

/**
 * Fixed system stages. Always present. Cannot be removed or reordered.
 * Colors remain configurable. Used by Leadlogr to send conversion outcomes
 * back to Google Ads / Meta Ads.
 */
export const DEFAULT_STAGES: StageDef[] = [
  { id: "new",          name: "New",          locked: true, palette: "blue" },
  { id: "contacted",    name: "Contacted",    locked: true, palette: "green" },
  { id: "qualified",    name: "Qualified",    locked: true, palette: "amber" },
  { id: "won",          name: "Won",          locked: true, palette: "orange" },
  { id: "lost",         name: "Lost",         locked: true, palette: "red" },
  { id: "disqualified", name: "Disqualified", locked: true, palette: "purple" },
];

/** Index in DEFAULT_STAGES where custom stages should be inserted (before "Won"). */
export const CUSTOM_STAGE_INSERT_BEFORE = "Won";

export interface Lead {
  id: string;
  stage: string;
  // Contact
  name: string;
  email: string;
  phone: string;
  description: string;
  // Details
  priority: Priority;
  qualification: Qualification;
  value: number;
  campaignName: string;
  tags: string[];
  notes: string;
  source: Source;
  company?: string;
  // Tracking
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  gclid: string;
  fbclid: string;
  liTrackingId: string;
  msclkid: string;
  fbp: string;
  gaClientId: string;
  gaSessionId: string;
  currency: string;
  // URLs
  websiteUrl: string;
  landingPageUrl: string;
  pagePath: string;
  referrerUrl: string;
  // Consent
  consent: Consent;
  // Meta
  createdAt: string;
  updatedAt: string;
}

export function emptyLead(stage: string = "New"): Lead {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    stage,
    name: "",
    email: "",
    phone: "",
    description: "",
    priority: "Medium",
    qualification: "Unqualified",
    value: 0,
    campaignName: "",
    tags: [],
    notes: "",
    source: "Direct",
    company: "",
    createdAt: now,
    updatedAt: now,
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    gclid: "",
    fbclid: "",
    liTrackingId: "",
    msclkid: "",
    fbp: "",
    gaClientId: "",
    gaSessionId: "",
    currency: "EUR",
    websiteUrl: "",
    landingPageUrl: "",
    pagePath: "",
    referrerUrl: "",
    consent: "Unknown",
  };
}

export const SEED_LEADS: Lead[] = [
  {
    ...emptyLead("New"),
    id: "l1", name: "Marcus Thorne", email: "marcus@thornecap.com", phone: "+1 415 555 0182",
    company: "Thorne Capital", source: "Google", description: "Inbound from Search — enterprise SaaS evaluation.",
    priority: "High", campaignName: "Brand · Enterprise · Q2",
    utmSource: "google", utmMedium: "cpc", utmCampaign: "brand-enterprise-q2",
    gclid: "Cj0KCQjw...EALw_wcB", websiteUrl: "https://leadlogr.com",
    landingPageUrl: "https://leadlogr.com/enterprise", pagePath: "/enterprise",
    referrerUrl: "https://google.com", consent: "Accepted", tags: ["enterprise", "hot"],
  },
  {
    ...emptyLead("New"),
    id: "l2", name: "Elena Rodríguez", email: "elena@helio.studio", phone: "+34 611 22 33 44",
    company: "Helio Studio", source: "Meta", description: "Agency retainer inquiry from IG ad.",
    priority: "Medium", campaignName: "Agencies · LAL 2% · ES",
    utmSource: "meta", utmMedium: "paid-social", utmCampaign: "agencies-lal2-es",
    fbclid: "IwAR2x...abc", fbp: "fb.1.1717000000.1234567890",
    landingPageUrl: "https://leadlogr.com/agencies", pagePath: "/agencies",
    consent: "Accepted", tags: ["agency"],
  },
  {
    ...emptyLead("New"),
    id: "l3", name: "Liam O'Connor", email: "liam@apex.io", phone: "+353 1 555 0101",
    company: "Apex Solutions", source: "Direct", description: "Submitted contact form directly.",
    priority: "Low", consent: "Unknown",
  },
  {
    ...emptyLead("Contacted"),
    id: "l4", name: "Priya Shah", email: "priya@northwind.co", phone: "+44 20 7946 0958",
    company: "Northwind Co.", source: "Google", description: "Discovery call scheduled for Thursday.",
    priority: "Medium", campaignName: "Solutions · Mid-market",
    utmSource: "google", utmMedium: "cpc", utmCampaign: "solutions-mm",
    gclid: "Cj0KCQjw...XYZ", consent: "Accepted", tags: ["mid-market"],
  },
  {
    ...emptyLead("Contacted"),
    id: "l5", name: "Tom Becker", email: "tom@falcongroup.io", phone: "+49 30 1234 5678",
    company: "Falcon Group", source: "Meta", priority: "Medium",
    description: "Demo follow-up pending.", campaignName: "Retargeting · DE",
    fbclid: "IwAR1y...def", consent: "Accepted",
  },
  {
    ...emptyLead("Qualified"),
    id: "l6", name: "Ava Lin", email: "ava@brightholdings.com", phone: "+1 212 555 0199",
    company: "Bright Holdings", source: "Google", value: 8400,
    description: "Procurement review in progress. High intent.",
    priority: "High", qualification: "Qualified", campaignName: "Solutions · Enterprise · US",
    utmSource: "google", utmMedium: "cpc", utmCampaign: "solutions-ent-us",
    gclid: "Cj0KCQjw...HHH", consent: "Accepted", tags: ["high-intent", "enterprise"],
    notes: "CFO involved. Targeting close by EOQ.",
  },
  {
    ...emptyLead("Qualified"),
    id: "l7", name: "Noah Patel", email: "noah@vertexlabs.ai", phone: "+1 408 555 0143",
    company: "Vertex Labs", source: "Meta", value: 3100, priority: "Medium",
    qualification: "Qualified", description: "Trial active. Weekly check-ins.",
    fbclid: "IwAR3z...ghi", consent: "Accepted",
  },
  {
    ...emptyLead("Won"),
    id: "l8", name: "Project Zenith", email: "ops@zenith.co", phone: "+1 646 555 0124",
    company: "Zenith Co.", source: "Google", value: 12500, priority: "High",
    qualification: "Customer", description: "Synced to Google Ads via offline conversion (CAPI).",
    campaignName: "Solutions · Enterprise · US", utmSource: "google", utmMedium: "cpc",
    utmCampaign: "solutions-ent-us", gclid: "Cj0KCQjw...ZEN", consent: "Accepted",
    tags: ["closed", "google-capi"],
  },
  {
    ...emptyLead("Won"),
    id: "l9", name: "Falcon Group", email: "billing@falcongroup.io", phone: "+49 30 1234 5678",
    company: "Falcon Group", source: "Meta", value: 6200, priority: "High",
    qualification: "Customer", description: "Synced to Meta CAPI.",
    fbclid: "IwAR1y...def", consent: "Accepted", tags: ["closed", "meta-capi"],
  },
  {
    ...emptyLead("Lost"),
    id: "l10", name: "Karim Haddad", email: "karim@globex.io", phone: "+971 4 555 0177",
    company: "Globex", source: "Google", priority: "Low", qualification: "Unqualified",
    description: "Budget pulled — synced as negative signal to Google Ads.",
    utmSource: "google", utmMedium: "cpc", utmCampaign: "solutions-mm",
    gclid: "Cj0KCQjw...LST", consent: "Declined", tags: ["lost"],
  },
  {
    ...emptyLead("Disqualified"),
    id: "l11", name: "Fake User", email: "fake@example.com", phone: "+1 000 000 0000",
    company: "N/A", source: "Meta", priority: "Low", qualification: "Unqualified",
    description: "Invalid contact info and spam submission — synced as poor-quality signal to Meta.",
    fbclid: "IwAR0x...spam", consent: "Declined", tags: ["disqualified"],
  },
];
