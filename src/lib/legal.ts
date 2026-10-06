/**
 * The company behind Leadlogr, in one place.
 *
 * Every value marked TO FILL IN is a real-world fact nobody can invent: the
 * footer previously carried "Leadlogr Systems Inc.", which does not exist and
 * would fail Google's brand verification on its own. A visible placeholder is
 * better than a plausible fiction, so these render as-is until replaced.
 *
 * Google brand verification, the OAuth consent screen and the policies below
 * all have to agree with each other and with the company register, so they read
 * from here rather than being written out separately.
 */
export const COMPANY = {
  /** Registered company name, exactly as filed. */
  legalName: "[TO FILL IN — registered company name]",
  /** What customers see. */
  tradingName: "Leadlogr",
  /** Dutch Chamber of Commerce number. */
  registrationNumber: "[TO FILL IN — KvK number]",
  vatNumber: "[TO FILL IN — VAT number]",
  address: "[TO FILL IN — registered address]",
  country: "Netherlands",
  /** Must be a mailbox that is actually monitored. */
  contactEmail: "hello@leadlogr.com",
  /**
   * The same mailbox for now. Split it out only when someone is ready to watch
   * a second one — a privacy request bouncing is worse than it arriving beside
   * the sales mail.
   */
  privacyEmail: "hello@leadlogr.com",
  site: "leadlogr.com",
} as const;

/** Shown on the policies. Update when their wording changes, not on deploy. */
export const POLICY_LAST_UPDATED = "6 October 2026";

/**
 * Processors with access to customer data, named because a policy that says
 * "trusted third parties" tells a reader nothing and satisfies no regulator.
 * This list is the deployed stack; adding a service means adding a row.
 */
export const SUBPROCESSORS = [
  {
    name: "Neon",
    purpose: "Database hosting and authentication",
    region: "European Union (Frankfurt)",
  },
  {
    name: "Vercel",
    purpose: "Application hosting and delivery",
    region: "European Union, with global edge delivery",
  },
  {
    name: "Resend",
    purpose: "Sending invitation and notification email",
    region: "European Union (Ireland)",
  },
  {
    name: "Google",
    purpose: "Returning conversion results to Google Ads, where a workspace has connected it",
    region: "United States",
  },
  {
    name: "Meta",
    purpose: "Returning conversion results to Meta, where a workspace has connected it",
    region: "United States",
  },
] as const;
