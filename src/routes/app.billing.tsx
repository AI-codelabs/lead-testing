import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { PLANS, priceFor, type BillingInterval, type PlanId } from "@/lib/billing/plans";
import {
  getWorkspaceBilling,
  openBillingPortal,
  startCheckout,
} from "@/lib/billing/billing.functions";
import { safeCheckoutUrl } from "@/lib/billing/safe-redirect";

export const Route = createFileRoute("/app/billing")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Billing — Leadlogr" }] }),
  ssr: false,
  component: BillingPage,
});

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function BillingPage() {
  const { activeWorkspace, isAgencyViewing } = useAccount();
  const organizationId = activeWorkspace.key;
  const [interval, setInterval] = useState<BillingInterval>("month");

  const billingFn = useServerFn(getWorkspaceBilling);
  const checkoutFn = useServerFn(startCheckout);
  const portalFn = useServerFn(openBillingPortal);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-billing", organizationId],
    enabled: !!organizationId && !isAgencyViewing,
    queryFn: () => billingFn({ data: { organizationId } }),
  });

  const checkout = useMutation({
    mutationFn: (planId: PlanId) =>
      checkoutFn({ data: { organizationId, planId, interval } }),
    onSuccess: (res) => {
      if (res.ok) {
        const url = safeCheckoutUrl(res.checkoutUrl);
        if (!url) {
          toast.error("Checkout returned an unsafe URL");
          return;
        }
        window.location.assign(url);
        return;
      }
      toast.message(res.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Checkout failed"),
  });

  const portal = useMutation({
    mutationFn: () => portalFn({ data: { organizationId } }),
    onSuccess: (res) => {
      if (res.ok) {
        const url = safeCheckoutUrl(res.checkoutUrl);
        if (!url) {
          toast.error("Portal returned an unsafe URL");
          return;
        }
        window.location.assign(url);
        return;
      }
      toast.message(res.message);
    },
  });

  const statusLabel = useMemo(() => {
    const s = data?.subscription.status ?? "none";
    if (s === "none") return "No plan yet";
    if (s === "trialing") return "14-day trial";
    if (s === "active") return "Active";
    if (s === "past_due") return "Past due";
    if (s === "canceled") return "Canceled";
    return s;
  }, [data?.subscription.status]);

  if (isAgencyViewing) {
    return (
      <div className="max-w-xl mx-auto mt-20 rounded-xl bg-card shadow-xs ring-1 ring-border p-8 text-center">
        <h2 className="font-semibold">Billing is private to the client</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Agencies cannot open or change a client’s plan. Manage partner payouts from your agency
          commission page.
        </p>
        <Link
          to="/agency/commission"
          className="inline-flex mt-5 text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted"
        >
          Go to commission
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Choose a plan for this workspace. Checkout opens here once a payment processor is connected — nothing is charged today."
        actions={
          <button
            type="button"
            onClick={() => portal.mutate()}
            disabled={portal.isPending || !data?.billingEnabled}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted disabled:opacity-50"
          >
            <CreditCard className="size-4" />
            Manage payment method
          </button>
        }
      />

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Current plan
            </div>
            <div className="text-xl font-semibold mt-1">
              {isLoading
                ? "…"
                : data?.subscription.planId
                  ? PLANS.find((p) => p.id === data.subscription.planId)?.name
                  : "None"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{statusLabel}</p>
          </div>
          <div className="text-sm text-muted-foreground max-w-md">
            {data?.billingEnabled
              ? "Invoices and card details sync from your payment processor."
              : "Payment processor not connected. Plan catalog and checkout UI are ready; connect Stripe (or another processor) to enable charges, trials and invoices."}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Plans</h2>
        <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-1">
          {([
            ["month", "Monthly"],
            ["year", "Yearly · 2 months free"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                interval === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {PLANS.map((plan) => {
          const amount = priceFor(plan, interval);
          const per = interval === "year" ? "/year" : "/month";
          return (
            <div
              key={plan.id}
              className={`rounded-xl bg-card p-5 flex flex-col ring-1 ${
                plan.highlighted ? "ring-primary shadow-sm" : "ring-border shadow-xs"
              }`}
            >
              {plan.highlighted ? (
                <span className="self-start text-[11px] font-bold uppercase tracking-wide text-primary bg-accent px-2 py-0.5 rounded-full mb-2">
                  Most teams pick this
                </span>
              ) : null}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.tagline}</p>
              <p className="text-3xl font-bold tracking-tight mt-4">
                {money.format(amount)}
                <span className="text-sm font-semibold text-muted-foreground"> {per}</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(plan.id)}
                className={`mt-5 w-full text-sm font-semibold px-3 py-2.5 rounded-md transition-colors ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card ring-1 ring-border hover:bg-muted"
                }`}
              >
                {data?.subscription.planId === plan.id ? "Current plan" : "Start 14-day trial"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Invoices</h2>
          <span className="text-xs text-muted-foreground">Excluding VAT</span>
        </div>
        {(data?.invoices.length ?? 0) === 0 ? (
          <p className="px-5 py-10 text-sm text-center text-muted-foreground">
            No invoices yet. They appear here after the first successful charge.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3">Number</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data!.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 font-medium">{inv.number}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {money.format(inv.amountEur)}
                  </td>
                  <td className="px-5 py-3.5 capitalize">{inv.status}</td>
                  <td className="px-5 py-3.5 text-right">
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
