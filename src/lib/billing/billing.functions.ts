import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";
import { partnerTierForClientCount, PLANS, type BillingInterval, type PlanId } from "./plans";
import type {
  CheckoutResult,
  PartnerCommissionSnapshot,
  StartCheckoutInput,
  WorkspaceBillingSnapshot,
} from "./types";

/**
 * Billing server surface.
 *
 * Today every read returns an empty, honest "processor not connected" snapshot.
 * Checkout / portal actions refuse rather than pretend. When Stripe (or another
 * processor) is wired, replace the bodies of these handlers — keep the input
 * and return shapes so the UI does not need a rewrite.
 */

const emptySubscription = {
  status: "none" as const,
  planId: null,
  interval: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  processorCustomerId: null,
  processorSubscriptionId: null,
};

export const getWorkspaceBilling = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<WorkspaceBillingSnapshot> => {
    await requireOrganization(context.db, data.organizationId);
    // Future: SELECT from billing_subscriptions / billing_customers for this org.
    return {
      billingEnabled: false,
      processor: null,
      subscription: emptySubscription,
      paymentMethod: null,
      invoices: [],
    };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: StartCheckoutInput) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    if (!PLANS.some((p) => p.id === data.planId)) throw new Error("Invalid plan");
    if (data.interval !== "month" && data.interval !== "year") {
      throw new Error("Invalid interval");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    await requireOrganization(context.db, data.organizationId);
    // Future: create Checkout Session and return { ok: true, checkoutUrl }.
    void data.planId;
    void data.interval;
    return {
      ok: false,
      reason: "billing_not_configured",
      message:
        "A payment processor is not connected yet. Plan selection is saved in the product catalog; checkout will open here once billing is live.",
    };
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    await requireOrganization(context.db, data.organizationId);
    return {
      ok: false,
      reason: "billing_not_configured",
      message:
        "The customer portal opens once a payment processor is connected and this workspace has a customer record.",
    };
  });

export const getPartnerCommission = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<PartnerCommissionSnapshot> => {
    const agencyOrgId = await requireOrganization(context.db, data.organizationId);

    // Claimed clients under this agency — same source as the clients overview.
    const clients = await context.db.sql<{
      id: string;
      name: string;
      claimed: boolean;
    }>(
      `SELECT ac.client_org_id AS id,
              app.organization_name(ac.client_org_id) AS name,
              (ac.claimed_at IS NOT NULL) AS claimed
         FROM public.agency_clients ac
        WHERE ac.agency_org_id = $1
     ORDER BY 2`,
      [agencyOrgId],
    );

    const payingClients = clients.filter((c) => c.claimed).length;
    const tier = partnerTierForClientCount(Math.max(payingClients, 1));

    return {
      billingEnabled: false,
      processor: null,
      tier: tier.tier,
      tierLabel: tier.label,
      rate: tier.rate,
      payingClients,
      estimatedMonthlyEur: null,
      nextPayoutDate: null,
      payouts: [],
      clients: clients.map((c) => ({
        clientOrgId: c.id,
        clientName: c.name,
        planId: null,
        planName: null,
        monthlyFeeEur: null,
        commissionEur: null,
        billingOwner: "unknown",
      })),
      payoutDestination: {
        status: "missing",
        label: null,
      },
    };
  });

/** Exported for UI forms that need to validate before calling startCheckout. */
export type { PlanId, BillingInterval };
