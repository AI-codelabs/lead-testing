import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/leadlogr/page-header";
import { useAccount } from "@/lib/account-context";
import { PARTNER_TIERS } from "@/lib/billing/plans";
import { getPartnerCommission, openBillingPortal } from "@/lib/billing/billing.functions";
import { safeCheckoutUrl } from "@/lib/billing/safe-redirect";

export const Route = createFileRoute("/agency/commission")({
  staticData: { width: "wide" },
  head: () => ({ meta: [{ title: "Commission — Leadlogr Agency" }] }),
  ssr: false,
  component: CommissionPage,
});

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function CommissionPage() {
  const { activeOrganizationId, clientWorkspaces } = useAccount();
  const commissionFn = useServerFn(getPartnerCommission);
  const portalFn = useServerFn(openBillingPortal);

  const { data, isLoading, error } = useQuery({
    queryKey: ["partner-commission", activeOrganizationId],
    enabled: !!activeOrganizationId,
    queryFn: () => commissionFn({ data: { organizationId: activeOrganizationId } }),
  });

  const connectPayout = useMutation({
    mutationFn: () => portalFn({ data: { organizationId: activeOrganizationId } }),
    onSuccess: (res) => {
      if (res.ok) {
        const url = safeCheckoutUrl(res.checkoutUrl);
        if (!url) {
          toast.error("Payout setup returned an unsafe URL");
          return;
        }
        window.location.assign(url);
        return;
      }
      toast.message(
        "Payout destination setup opens here once the payment processor is connected. We’ll collect your bank or Stripe Connect details then.",
      );
    },
  });

  const nextTierAt = data ? (data.tier === 0 ? 5 : data.tier === 1 ? 15 : null) : null;

  return (
    <>
      <PageHeader
        eyebrow="Partner program"
        title="Commission"
        description="Track your partner tier, estimated earnings, and payouts. Amounts stay empty until client billing is live."
        actions={
          <Link
            to="/agency/invites"
            className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted"
          >
            Invite a client
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Commission this month"
          value={
            data?.estimatedMonthlyEur != null ? money.format(data.estimatedMonthlyEur) : "—"
          }
          hint={
            data?.billingEnabled
              ? data.nextPayoutDate
                ? `Next payout ${new Date(data.nextPayoutDate).toLocaleDateString("en-GB")}`
                : "Awaiting first paid invoices"
              : "Unlocks when billing goes live"
          }
        />
        <Stat
          label="Paying clients"
          value={isLoading ? "…" : String(data?.payingClients ?? 0)}
          hint={`${clientWorkspaces.length} workspaces linked`}
        />
        <Stat
          label="Your rate"
          value={data ? `${Math.round(data.rate * 100)}%` : "—"}
          hint={data ? `${data.tierLabel} partner tier` : undefined}
        />
        <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>Tier progress</span>
            <span>
              {data?.payingClients ?? 0}
              {nextTierAt ? ` / ${nextTierAt}` : ""}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{
                width: `${Math.min(
                  100,
                  nextTierAt && data ? (data.payingClients / nextTierAt) * 100 : 100,
                )}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {nextTierAt && data
              ? `${Math.max(0, nextTierAt - data.payingClients)} more claimed clients to the next tier.`
              : "Top partner tier."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {PARTNER_TIERS.map((t) => {
          const active = data?.tier === t.tier;
          return (
            <div
              key={t.tier}
              className={`rounded-xl p-4 ring-1 ${
                active ? "bg-accent ring-primary" : "bg-card ring-border shadow-xs"
              }`}
            >
              <div className="text-sm font-bold">
                {t.label} · {Math.round(t.rate * 100)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t.maxClients
                  ? `${t.minClients}–${t.maxClients} paying clients`
                  : `${t.minClients}+ paying clients`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-3">
          <div className="size-10 rounded-full bg-muted grid place-items-center ring-1 ring-border">
            <Wallet className="size-4 text-muted-foreground" />
          </div>
          <div>
            <div className="font-semibold">Payout destination</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.payoutDestination.status === "ready"
                ? data.payoutDestination.label
                : "Not connected yet. Add a bank account or Connect profile before the first payout."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => connectPayout.mutate()}
          className="text-sm font-semibold px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Set up payouts
        </button>
      </div>

      <h2 className="text-lg font-semibold tracking-tight mb-3">Clients</h2>
      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Who pays</th>
              <th className="px-5 py-3 text-right">Monthly fee</th>
              <th className="px-5 py-3 text-right">Your commission</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-destructive">
                  {error instanceof Error ? error.message : "Could not load commission"}
                </td>
              </tr>
            )}
            {!isLoading && (data?.clients.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                  <Building2 className="size-5 mx-auto mb-2 opacity-50" />
                  No client workspaces yet.
                </td>
              </tr>
            )}
            {data?.clients.map((c) => (
              <tr key={c.clientOrgId} className="border-b border-border last:border-0">
                <td className="px-5 py-3.5 font-medium">{c.clientName}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{c.planName ?? "—"}</td>
                <td className="px-5 py-3.5 text-muted-foreground capitalize">
                  {c.billingOwner === "unknown" ? "—" : c.billingOwner}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">
                  {c.monthlyFeeEur != null ? money.format(c.monthlyFeeEur) : "—"}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums font-semibold">
                  {c.commissionEur != null ? money.format(c.commissionEur) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold tracking-tight mb-3">Payout history</h2>
      <div className="rounded-xl bg-card shadow-xs ring-1 ring-border overflow-hidden">
        {(data?.payouts.length ?? 0) === 0 ? (
          <p className="px-5 py-10 text-sm text-center text-muted-foreground">
            No payouts yet. On the first of each month we’ll list paid partner transfers here.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {data!.payouts.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 font-medium">{p.periodLabel}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {money.format(p.amountEur)}
                  </td>
                  <td className="px-5 py-3.5 capitalize">{p.status.replace("_", " ")}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-GB") : "—"}
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

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-card shadow-xs ring-1 ring-border p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-3xl font-semibold tracking-tight mt-3">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}
