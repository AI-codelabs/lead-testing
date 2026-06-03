export type Priority = "Low" | "Medium" | "High";
export type Qualification = "Unqualified" | "Qualified" | "Customer";
export type Consent = "Unknown" | "Accepted" | "Declined";
export type Source = "Google" | "Meta" | "Direct" | "LinkedIn" | "Microsoft";

export interface StageDef {
  id: string;
  name: string;
  locked: boolean;
  /** Dot color utility, e.g. "bg-stage-new" */
  dot: string;
  /** Soft column background utility, e.g. "bg-stage-new-soft" */
  soft: string;
  /** Ink color for labels / badges, e.g. "text-stage-new-ink" */
  ink: string;
  /** Subtle line / ring utility, e.g. "ring-stage-new-line" */
  line: string;
}

/**
 * Stages flagged `locked: true` are system stages used by Leadlogr to send
 * conversion outcomes back to Google Ads / Meta Ads. They cannot be edited
 * or removed by users.
 */
export const DEFAULT_STAGES: StageDef[] = [
  { id: "new", name: "New", locked: false, dot: "bg-stage-new", soft: "bg-stage-new-soft", ink: "text-stage-new-ink", line: "ring-stage-new-line" },
  { id: "contacted", name: "Contacted", locked: false, dot: "bg-stage-contacted", soft: "bg-stage-contacted-soft", ink: "text-stage-contacted-ink", line: "ring-stage-contacted-line" },
  { id: "qualified", name: "Qualified", locked: true, dot: "bg-stage-qualified", soft: "bg-stage-qualified-soft", ink: "text-stage-qualified-ink", line: "ring-stage-qualified-line" },
  { id: "closed-won", name: "Closed-Won", locked: false, dot: "bg-stage-closed-won", soft: "bg-stage-closed-won-soft", ink: "text-stage-closed-won-ink", line: "ring-stage-closed-won-line" },
  { id: "lost", name: "Lost", locked: true, dot: "bg-stage-lost", soft: "bg-stage-lost-soft", ink: "text-stage-lost-ink", line: "ring-stage-lost-line" },
  { id: "disqualified", name: "Disqualified", locked: true, dot: "bg-stage-disqualified", soft: "bg-stage-disqualified-soft", ink: "text-stage-disqualified-ink", line: "ring-stage-disqualified-line" },
];

export const CUSTOM_STAGE_DOT = "bg-foreground/40";
export const CUSTOM_STAGE_SOFT = "bg-muted/40";
export const CUSTOM_STAGE_INK = "text-foreground";
export const CUSTOM_STAGE_LINE = "ring-border";


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
    ...emptyLead("Closed-Won"),
    id: "l8", name: "Project Zenith", email: "ops@zenith.co", phone: "+1 646 555 0124",
    company: "Zenith Co.", source: "Google", value: 12500, priority: "High",
    qualification: "Customer", description: "Synced to Google Ads via offline conversion (CAPI).",
    campaignName: "Solutions · Enterprise · US", utmSource: "google", utmMedium: "cpc",
    utmCampaign: "solutions-ent-us", gclid: "Cj0KCQjw...ZEN", consent: "Accepted",
    tags: ["closed", "google-capi"],
  },
  {
    ...emptyLead("Closed-Won"),
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
