import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireOrganization } from "@/auth/middleware";

export type OrganizationContext = {
  organizationId: string;
  name: string;
  slug: string | null;
  accountType: "standard" | "agency";
  role: string;
  defaultCurrency: string;
  timezone: string;
};

/**
 * Organizations the signed-in user belongs to.
 *
 * Reads neon_auth directly rather than going back out to the Better Auth API,
 * so a page load costs one database round trip instead of a network hop.
 * Scoped to the caller by the membership join, not by a filter the caller
 * supplies.
 */
export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<OrganizationContext[]> => {
    return context.db.sql<OrganizationContext>(
      `SELECT o.id     AS "organizationId",
              o.name   AS name,
              o.slug   AS slug,
              COALESCE(s.account_type, 'standard') AS "accountType",
              o.my_role AS role,
              COALESCE(s.default_currency, 'EUR')  AS "defaultCurrency",
              COALESCE(s.timezone, 'Europe/Amsterdam') AS "timezone"
         FROM app.organizations o
    LEFT JOIN public.organization_settings s ON s.organization_id = o.id
     ORDER BY o.created_at ASC`,
      [],
    );
  });

/**
 * Settings for one organization.
 *
 * `requireOrganization` proves membership inside the database before the row
 * is read, so an id from client input cannot reach another tenant's settings.
 */
export const getOrganization = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<OrganizationContext | null> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    return context.db.one<OrganizationContext>(
      `SELECT o.id     AS "organizationId",
              o.name   AS name,
              o.slug   AS slug,
              COALESCE(s.account_type, 'standard') AS "accountType",
              o.my_role AS role,
              COALESCE(s.default_currency, 'EUR')  AS "defaultCurrency",
              COALESCE(s.timezone, 'Europe/Amsterdam') AS "timezone"
         FROM app.organizations o
    LEFT JOIN public.organization_settings s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [organizationId],
    );
  });

/**
 * Creates the application-side settings row for a newly created organization.
 *
 * Better Auth creates the organization and the owner membership; this adds the
 * parts it does not know about, including the rotatable ingest key used by the
 * public tracker. Idempotent, so a retried signup cannot produce two rows.
 */
export const initializeOrganization = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string; accountType?: "standard" | "agency" }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    const accountType = data.accountType === "agency" ? "agency" : "standard";
    return { organizationId: data.organizationId, accountType };
  })
  .handler(async ({ data, context }): Promise<{ organizationId: string }> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    // organization_settings is insert-protected from app_user, so this runs on
    // the owner connection — safe, because membership was just proven above.
    const { withOwner } = await import("@/db");
    await withOwner((db) =>
      db.sql(
        `INSERT INTO public.organization_settings (organization_id, account_type)
         VALUES ($1, $2)
         ON CONFLICT (organization_id) DO UPDATE SET account_type = EXCLUDED.account_type`,
        [organizationId, data.accountType],
      ),
    );

    return { organizationId };
  });

/** Currencies the product reports conversion values in. */
export const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK"] as const;

/**
 * Workspace defaults.
 *
 * No SECURITY DEFINER needed: app_user holds UPDATE on organization_settings
 * and the write policy already restricts it to owners and admins, so the
 * database refuses a member who should not be changing this.
 */
export const updateWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (data: { organizationId: string; defaultCurrency?: string; timezone?: string }) => {
      if (!data?.organizationId) throw new Error("organizationId is required");
      const currency = String(data.defaultCurrency ?? "").trim().toUpperCase();
      if (currency && !CURRENCIES.includes(currency as (typeof CURRENCIES)[number])) {
        throw new Error("Unsupported currency");
      }
      const timezone = String(data.timezone ?? "").trim();
      // Validated against the runtime's own zone database rather than a list we
      // would have to maintain.
      if (timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: timezone });
        } catch {
          throw new Error("Unknown timezone");
        }
      }
      return { organizationId: data.organizationId, currency, timezone };
    },
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);

    const rows = await context.db.sql<{ organization_id: string }>(
      `UPDATE public.organization_settings
          SET default_currency = COALESCE(NULLIF($2, ''), default_currency),
              timezone         = COALESCE(NULLIF($3, ''), timezone)
        WHERE organization_id = $1
        RETURNING organization_id`,
      [organizationId, data.currency, data.timezone],
    );
    // The policy, not the application, decides who may write here — so no rows
    // back means refused rather than missing.
    if (rows.length === 0) throw new Error("Only owners and admins can change workspace settings");

    return { ok: true };
  });

/** The tracker's ingest key. Owners and admins only, enforced by policy. */
export const getIngestKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) throw new Error("organizationId is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ ingestKey: string | null }> => {
    const organizationId = await requireOrganization(context.db, data.organizationId);
    const row = await context.db.one<{ ingest_key: string }>(
      `SELECT ingest_key FROM public.organization_settings WHERE organization_id = $1`,
      [organizationId],
    );
    return { ingestKey: row?.ingest_key ?? null };
  });
