import { createFileRoute } from "@tanstack/react-router";

/**
 * Google Tag Manager OAuth callback. Mirrors the Google Ads one: consumes the
 * single-use state, exchanges the code, checks every Tag Manager scope was
 * actually granted, stores the refresh token where app_user cannot read it,
 * and hands the result back to the opener window.
 */

// Kept in this file rather than imported so the route does not pull the
// server client into its bundle.
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
];

export const Route = createFileRoute("/api/public/oauth/google-tag-manager/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) return popupResult({ ok: false, error: oauthError });
        if (!code || !state) return popupResult({ ok: false, error: "missing_code_or_state" });

        const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return popupResult({ ok: false, error: "server_not_configured" });
        }

        const { withOwner } = await import("@/db");

        // DELETE ... RETURNING: a replayed callback finds nothing.
        const stateRow = await withOwner((db) =>
          db.one<{ organization_id: string; expired: boolean }>(
            `DELETE FROM public.oauth_states
              WHERE state = $1 AND network = 'google_tag_manager'
          RETURNING organization_id, (expires_at < now()) AS expired`,
            [state],
          ),
        );
        if (!stateRow) return popupResult({ ok: false, error: "invalid_state" });
        if (stateRow.expired) return popupResult({ ok: false, error: "state_expired" });
        const organizationId = stateRow.organization_id;

        const redirectUri = `${url.origin}/api/public/oauth/google-tag-manager/callback`;
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenResp.ok) {
          const text = await tokenResp.text();
          return popupResult({ ok: false, error: `token_exchange_failed: ${text.slice(0, 200)}` });
        }
        const tok = (await tokenResp.json()) as {
          refresh_token?: string;
          access_token?: string;
          scope?: string;
        };

        // Google's consent screen lets people untick individual scopes. Without
        // all four, installing and publishing fails half-way, so say so now.
        const granted = new Set((tok.scope ?? "").split(/\s+/).filter(Boolean));
        const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s));
        // Nothing is stored in that case. The partial grant is not revoked here:
        // Google keeps one grant per account per client, so revoking could also
        // end a Google Ads connection made with the same Google account.
        if (missing.length > 0) return popupResult({ ok: false, error: "missing_scopes" });
        if (!tok.refresh_token) {
          return popupResult({ ok: false, error: "no_refresh_token" });
        }

        let email = "";
        try {
          const userResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tok.access_token}` },
          });
          if (userResp.ok) {
            const u = (await userResp.json()) as { email?: string };
            email = u.email ?? "";
          }
        } catch {
          /* non-fatal */
        }

        try {
          await withOwner(async (db) => {
            await db.sql(
              `INSERT INTO public.tag_manager_installs AS t
                 (organization_id, connected_email, connected_at)
               VALUES ($1, $2, now())
               ON CONFLICT (organization_id) DO UPDATE SET
                 connected_email = EXCLUDED.connected_email,
                 connected_at = EXCLUDED.connected_at`,
              [organizationId, email || null],
            );
            await db.sql(
              `INSERT INTO public.ad_platform_credentials AS c
                 (organization_id, network, refresh_token)
               VALUES ($1, 'google_tag_manager', $2)
               ON CONFLICT (organization_id, network) DO UPDATE SET
                 refresh_token = EXCLUDED.refresh_token`,
              [organizationId, tok.refresh_token],
            );
          });
        } catch (err) {
          return popupResult({ ok: false, error: `save_failed: ${String(err).slice(0, 200)}` });
        }

        return popupResult({ ok: true, email });
      },
    },
  },
});

function popupResult(
  payload: { ok: true; email: string } | { ok: false; error: string },
): Response {
  // JSON inside a <script>: escape "<" so a value can never close the tag.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#111}</style></head>
<body>
<p>${payload.ok ? "✓ Tag Manager connected — redirecting…" : "Connection failed — redirecting…"}</p>
<script>
(function(){
  var payload = ${json};
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ source: "leadlogr-google-tag-manager-oauth", payload: payload }, window.location.origin); } catch(e){}
    setTimeout(function(){ window.close(); }, 300);
    return;
  }
  var qs = payload.ok
    ? "&gtm_connected=1"
    : "&gtm_connected=0&error=" + encodeURIComponent(payload.error || "failed");
  window.location.replace("/app/tracking?integration=gtm" + qs);
})();
</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
