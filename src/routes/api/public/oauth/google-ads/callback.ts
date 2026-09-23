import { createFileRoute } from "@tanstack/react-router";

/**
 * Google Ads OAuth callback. Exchanges the auth code for tokens, stores the
 * refresh_token against the workspace, then returns a tiny HTML page that
 * posts a message to the opener window and closes the popup.
 */
export const Route = createFileRoute("/api/public/oauth/google-ads/callback")({
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
        if (!clientId || !clientSecret) return popupResult({ ok: false, error: "server_not_configured" });

        const { withOwner } = await import("@/db");

        // Consume the state row in one statement: DELETE ... RETURNING means a
        // replayed callback finds nothing, so the state is single-use.
        const stateRow = await withOwner((db) =>
          db.one<{ organization_id: string; expired: boolean }>(
            `DELETE FROM public.oauth_states
              WHERE state = $1 AND network = 'google_ads'
          RETURNING organization_id, (expires_at < now()) AS expired`,
            [state],
          ),
        );
        if (!stateRow) return popupResult({ ok: false, error: "invalid_state" });
        if (stateRow.expired) return popupResult({ ok: false, error: "state_expired" });
        const organizationId = stateRow.organization_id;

        const redirectUri = `${url.origin}/api/public/oauth/google-ads/callback`;

        // Exchange code → tokens.
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
        const tok = (await tokenResp.json()) as { refresh_token?: string; access_token?: string };
        if (!tok.refresh_token) {
          return popupResult({ ok: false, error: "no_refresh_token (revoke app access in Google account → permissions, then reconnect)" });
        }

        // Look up the connected user's email for display.
        let email = "";
        try {
          const userResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tok.access_token}` },
          });
          if (userResp.ok) {
            const u = (await userResp.json()) as { email?: string };
            email = u.email ?? "";
          }
        } catch { /* non-fatal */ }

        // The refresh token goes to ad_platform_credentials, which the app's
        // user-scoped role cannot read; only the non-secret half lands in
        // ad_platform_settings where the UI can see it.
        try {
          await withOwner(async (db) => {
            await db.sql(
              `INSERT INTO public.ad_platform_settings AS s
                 (organization_id, network, enabled, connected_email, connected_at)
               VALUES ($1, 'google_ads', true, $2, now())
               ON CONFLICT (organization_id, network) DO UPDATE SET
                 enabled = true, connected_email = EXCLUDED.connected_email,
                 connected_at = EXCLUDED.connected_at`,
              [organizationId, email || null],
            );
            await db.sql(
              `INSERT INTO public.ad_platform_credentials AS c
                 (organization_id, network, refresh_token)
               VALUES ($1, 'google_ads', $2)
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

function popupResult(payload: { ok: true; email: string } | { ok: false; error: string }): Response {
  const json = JSON.stringify(payload);
  // If the OAuth round-trip was started as a popup, postMessage back to the
  // opener and close. If there is no opener (popup was blocked → top-window
  // redirect), navigate the user back to the integrations page with a query
  // param so the page can refresh its state and surface any error.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#111}</style></head>
<body>
<p>${payload.ok ? "✓ Connected — redirecting…" : "Connection failed — redirecting…"}</p>
<script>
(function(){
  var payload = ${json};
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ source: "leadlogr-google-ads-oauth", payload: payload }, "*"); } catch(e){}
    setTimeout(function(){ window.close(); }, 300);
    return;
  }
  var qs = payload.ok
    ? "?ga_connected=1&email=" + encodeURIComponent(payload.email || "")
    : "?ga_connected=0&error=" + encodeURIComponent(payload.error || "failed");
  var returnTo = "/app/integrations/google-ads";
  try {
    var saved = sessionStorage.getItem("leadlogr.googleads.returnTo");
    if (saved) returnTo = saved;
    sessionStorage.removeItem("leadlogr.googleads.returnTo");
  } catch(e){}
  window.location.replace(returnTo + qs);
})();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
