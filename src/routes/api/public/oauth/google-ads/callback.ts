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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Validate + consume the state row.
        const { data: stateRow } = await supabaseAdmin
          .from("google_ads_oauth_states" as never)
          .select("workspace_key, expires_at")
          .eq("state", state)
          .maybeSingle();
        if (!stateRow) return popupResult({ ok: false, error: "invalid_state" });
        const { workspace_key, expires_at } = stateRow as { workspace_key: string; expires_at: string };
        if (new Date(expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("google_ads_oauth_states" as never).delete().eq("state", state);
          return popupResult({ ok: false, error: "state_expired" });
        }
        await supabaseAdmin.from("google_ads_oauth_states" as never).delete().eq("state", state);

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

        // Upsert into google_ads_settings.
        const { error: upErr } = await supabaseAdmin
          .from("google_ads_settings")
          .upsert(
            {
              workspace_key,
              oauth_refresh_token: tok.refresh_token,
              oauth_email: email,
              connected_at: new Date().toISOString(),
              enabled: true,
            } as never,
            { onConflict: "workspace_key" },
          );
        if (upErr) return popupResult({ ok: false, error: `save_failed: ${upErr.message}` });

        return popupResult({ ok: true, email });
      },
    },
  },
});

function popupResult(payload: { ok: true; email: string } | { ok: false; error: string }): Response {
  const json = JSON.stringify(payload);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;text-align:center;color:#111}</style></head>
<body>
<p>${payload.ok ? "✓ Connected — you can close this window." : "Connection failed. You can close this window."}</p>
<script>
(function(){
  try {
    if (window.opener) {
      window.opener.postMessage({ source: "leadlogr-google-ads-oauth", payload: ${json} }, "*");
    }
  } catch(e){}
  setTimeout(function(){ window.close(); }, 400);
})();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
