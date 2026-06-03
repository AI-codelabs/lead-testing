export type Stage = "New" | "Contacted" | "Qualified" | "Closed-Won";
export type Priority = "Low" | "Medium" | "High";
export type Qualification = "Unqualified" | "Qualified" | "Customer";
export type Consent = "Unknown" | "Accepted" | "Declined";
export type Source = "Google" | "Meta" | "Direct" | "LinkedIn" | "Microsoft";

export interface Lead {
  id: string;
  stage: Stage;
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
  updatedAt: string;
}

export const STAGES: Stage[] = ["New", "Contacted", "Qualified", "Closed-Won"];

export const STAGE_META: Record<Stage, { dot: string }> = {
  New: { dot: "bg-muted-foreground/60" },
  Contacted: { dot: "bg-warning" },
  Qualified: { dot: "bg-brand-accent" },
  "Closed-Won": { dot: "bg-success" },
};

export function emptyLead(stage: Stage = "New"): Lead {
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
    updatedAt: new Date().toISOString(),
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
];
