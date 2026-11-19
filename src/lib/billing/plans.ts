/**
 * Commercial catalog for Leadlogr.
 *
 * Prices and limits match the public homepage. When a payment processor is
 * connected, map each plan id to a Price id there — do not hardcode amounts in
 * checkout code.
 */

export type PlanId = "starter" | "growth" | "scale";
export type BillingInterval = "month" | "year";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  /** List price per month in EUR, excluding VAT. */
  monthlyPriceEur: number;
  /** Yearly list price in EUR (homepage: two months free = 10× monthly). */
  yearlyPriceEur: number;
  leadLimit: number;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "One location on Google Ads and Meta",
    monthlyPriceEur: 49,
    yearlyPriceEur: 490,
    leadLimit: 300,
    features: [
      "300 leads a month",
      "Pipeline and signal log",
      "Google Ads and Meta",
      "2 users",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Teams with a CRM or a sales desk",
    monthlyPriceEur: 99,
    yearlyPriceEur: 990,
    leadLimit: 1500,
    features: [
      "1,500 leads a month",
      "Every ad platform",
      "CRM sync and Zapier",
      "Revenue by campaign",
      "Unlimited users",
    ],
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "Several locations or brands",
    monthlyPriceEur: 199,
    yearlyPriceEur: 1990,
    leadLimit: 5000,
    features: [
      "5,000 leads a month",
      "Locations and brands apart",
      "BigQuery export and API",
      "Setup done with you",
    ],
  },
];

export function planById(id: PlanId): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function priceFor(plan: PlanDefinition, interval: BillingInterval): number {
  return interval === "year" ? plan.yearlyPriceEur : plan.monthlyPriceEur;
}

/** Partner commission tiers — same ladder as the marketing calculator. */
export const PARTNER_TIERS = [
  { tier: 0 as const, label: "Starter", rate: 0.2, minClients: 1, maxClients: 4 },
  { tier: 1 as const, label: "Pro", rate: 0.25, minClients: 5, maxClients: 14 },
  { tier: 2 as const, label: "Elite", rate: 0.3, minClients: 15, maxClients: null },
];

export function partnerTierForClientCount(payingClients: number) {
  if (payingClients >= 15) return PARTNER_TIERS[2];
  if (payingClients >= 5) return PARTNER_TIERS[1];
  return PARTNER_TIERS[0];
}
