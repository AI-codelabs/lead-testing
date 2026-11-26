/**
 * Finds other Leadlogr connections that share a Google grant. Server-only;
 * runs on the owner connection, since it must look across workspaces and at
 * ad_platform_credentials.
 */
import type { GoogleGrantNetwork } from "./google-grant";

type OwnerDb = {
  sql: <T>(t: string, p?: unknown[]) => Promise<T[]>;
};

export async function otherGoogleGrantHolders(
  db: OwnerDb,
  organizationId: string,
  network: GoogleGrantNetwork,
  email: string | null,
): Promise<GoogleGrantNetwork[]> {
  // Without the email we cannot tell; keep the old behaviour (revoke).
  if (!email) return [];
  const holders: GoogleGrantNetwork[] = [];

  const ads = await db.sql<{ n: number }>(
    `SELECT 1 AS n
       FROM public.ad_platform_credentials c
       JOIN public.ad_platform_settings s
         ON s.organization_id = c.organization_id AND s.network = c.network
      WHERE c.network = 'google_ads'
        AND c.refresh_token IS NOT NULL
        AND lower(s.connected_email) = lower($1)
        AND NOT (c.organization_id = $2 AND $3::text = 'google_ads')
      LIMIT 1`,
    [email, organizationId, network],
  );
  if (ads.length) holders.push("google_ads");

  // Until the Tag Manager migration has run neither the enum value nor the
  // table exists, and a Google Ads disconnect must keep working regardless.
  // Checked up front rather than caught: the caller is inside a transaction,
  // and a failed statement would abort the whole disconnect.
  const [migrated] = await db.sql<{ ok: boolean }>(
    `SELECT to_regclass('public.tag_manager_installs') IS NOT NULL AS ok`,
  );
  if (migrated?.ok) {
    const gtm = await db.sql<{ n: number }>(
      `SELECT 1 AS n
         FROM public.ad_platform_credentials c
         JOIN public.tag_manager_installs t ON t.organization_id = c.organization_id
        WHERE c.network::text = 'google_tag_manager'
          AND c.refresh_token IS NOT NULL
          AND lower(t.connected_email) = lower($1)
          AND NOT (c.organization_id = $2 AND $3::text = 'google_tag_manager')
        LIMIT 1`,
      [email, organizationId, network],
    );
    if (gtm.length) holders.push("google_tag_manager");
  }
  return holders;
}
