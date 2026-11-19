-- Billing tables, ready for a payment processor.
--
-- Not wired into the app yet: getWorkspaceBilling / getPartnerCommission still
-- return empty snapshots until STRIPE_* (or another processor) is connected and
-- the handlers write into these tables. Applying this migration early means we
-- do not invent a second schema the day checkout goes live.
--
-- Apply with the usual neon tooling when you are ready; safe to run ahead of
-- the processor integration.

CREATE TABLE IF NOT EXISTS public.billing_customers (
  organization_id          uuid PRIMARY KEY
                           REFERENCES neon_auth.organization (id) ON DELETE CASCADE,
  processor                text NOT NULL CHECK (processor IN ('stripe', 'paddle', 'mollie')),
  processor_customer_id    text NOT NULL,
  email                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_processor_uidx
  ON public.billing_customers (processor, processor_customer_id);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL
                           REFERENCES neon_auth.organization (id) ON DELETE CASCADE,
  plan_id                  text NOT NULL CHECK (plan_id IN ('starter', 'growth', 'scale')),
  interval                 text NOT NULL CHECK (interval IN ('month', 'year')),
  status                   text NOT NULL
                           CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  trial_ends_at            timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  processor                text NOT NULL CHECK (processor IN ('stripe', 'paddle', 'mollie')),
  processor_subscription_id text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_org_uidx
  ON public.billing_subscriptions (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_processor_uidx
  ON public.billing_subscriptions (processor, processor_subscription_id);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL
                           REFERENCES neon_auth.organization (id) ON DELETE CASCADE,
  number                   text,
  amount_cents             integer NOT NULL,
  currency                 text NOT NULL DEFAULT 'EUR',
  status                   text NOT NULL
                           CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  hosted_invoice_url       text,
  pdf_url                  text,
  processor                text NOT NULL CHECK (processor IN ('stripe', 'paddle', 'mollie')),
  processor_invoice_id     text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_processor_uidx
  ON public.billing_invoices (processor, processor_invoice_id);

CREATE INDEX IF NOT EXISTS billing_invoices_org_idx
  ON public.billing_invoices (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_org_id            uuid NOT NULL
                           REFERENCES neon_auth.organization (id) ON DELETE CASCADE,
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  amount_cents             integer NOT NULL,
  currency                 text NOT NULL DEFAULT 'EUR',
  status                   text NOT NULL
                           CHECK (status IN ('pending', 'in_transit', 'paid', 'failed')),
  paid_at                  timestamptz,
  processor                text,
  processor_transfer_id    text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_payouts_agency_idx
  ON public.partner_payouts (agency_org_id, period_end DESC);

-- Owner-only for now: billing writes will come from webhook handlers on the
-- owner connection, not from end-user sessions.
GRANT SELECT ON public.billing_customers TO app_user;
GRANT SELECT ON public.billing_subscriptions TO app_user;
GRANT SELECT ON public.billing_invoices TO app_user;
GRANT SELECT ON public.partner_payouts TO app_user;

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_customers_read ON public.billing_customers
  FOR SELECT TO app_user
  USING (app.is_member(organization_id));

CREATE POLICY billing_subscriptions_read ON public.billing_subscriptions
  FOR SELECT TO app_user
  USING (app.is_member(organization_id));

CREATE POLICY billing_invoices_read ON public.billing_invoices
  FOR SELECT TO app_user
  USING (app.is_member(organization_id));

CREATE POLICY partner_payouts_read ON public.partner_payouts
  FOR SELECT TO app_user
  USING (app.is_member(agency_org_id));
