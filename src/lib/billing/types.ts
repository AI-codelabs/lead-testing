import type { BillingInterval, PlanId } from "./plans";

/**
 * Processor-agnostic billing types.
 *
 * Fields named `processor*` hold Stripe/Paddle/etc identifiers once connected.
 * Until then they stay null and `billingEnabled` is false on every read model.
 */

export type BillingProcessor = "stripe" | "paddle" | "mollie" | null;

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type WorkspaceSubscription = {
  status: SubscriptionStatus;
  planId: PlanId | null;
  interval: BillingInterval | null;
  /** ISO date — end of 14-day trial when status is trialing. */
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  processorCustomerId: string | null;
  processorSubscriptionId: string | null;
};

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

export type BillingInvoice = {
  id: string;
  number: string;
  amountEur: number;
  currency: "EUR";
  status: InvoiceStatus;
  createdAt: string;
  /** Hosted invoice / PDF once the processor exists. */
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
};

export type PaymentMethodSummary = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export type WorkspaceBillingSnapshot = {
  billingEnabled: boolean;
  processor: BillingProcessor;
  subscription: WorkspaceSubscription;
  paymentMethod: PaymentMethodSummary | null;
  invoices: BillingInvoice[];
};

export type PartnerPayoutStatus = "pending" | "in_transit" | "paid" | "failed";

export type PartnerPayout = {
  id: string;
  /** e.g. "November 2026" */
  periodLabel: string;
  amountEur: number;
  currency: "EUR";
  status: PartnerPayoutStatus;
  paidAt: string | null;
};

export type PartnerCommissionClientRow = {
  clientOrgId: string;
  clientName: string;
  planId: PlanId | null;
  planName: string | null;
  /** Monthly list price attributed to this client, if known. */
  monthlyFeeEur: number | null;
  /** Your cut for the current period estimate. */
  commissionEur: number | null;
  billingOwner: "client" | "agency" | "unknown";
};

export type PartnerCommissionSnapshot = {
  billingEnabled: boolean;
  processor: BillingProcessor;
  tier: 0 | 1 | 2;
  tierLabel: string;
  rate: number;
  payingClients: number;
  /** Null until billing is live and we can estimate from paid invoices. */
  estimatedMonthlyEur: number | null;
  nextPayoutDate: string | null;
  payouts: PartnerPayout[];
  clients: PartnerCommissionClientRow[];
  /** Where we would send money — collected before first payout. */
  payoutDestination: {
    status: "missing" | "pending_verification" | "ready";
    label: string | null;
  };
};

export type StartCheckoutInput = {
  organizationId: string;
  planId: PlanId;
  interval: BillingInterval;
};

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: "billing_not_configured" | "unauthorized" | "error"; message: string };
