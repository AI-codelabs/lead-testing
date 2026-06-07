import { createFileRoute } from "@tanstack/react-router";

/**
 * Kicks off Google Ads OAuth for a workspace.
 *
 * Flow:
 *   GET /api/public/oauth/google-ads/start?workspace_key=...
 *     → 302 to https://accounts.google.com/o/oauth2/v2/auth?...
 *     → user consents
 *     → Google → /api/public/oauth/google-ads/callback?code=...&state=...
 *
 * The redirect_uri sent to Google is derived from this request's origin so
 * preview, production, and any custom domain all work with the SAME OAuth
 * client (provided each URL is listed as an authorized redirect URI in
 * Google Cloud Console).
 */
export const Route = createFileRoute("/api/public/oauth/google-ads/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const workspaceKey = url.searchParams.get("workspace_key");
        if (!workspaceKey || workspaceKey.length > 128) {
          return new Response("Missing workspace_key", { status: 400 });
        }

        const clientId = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID;
        if (!clientId) return new Response("Server not configured", { status: 500 });

        // CSRF state + workspace binding, stored server-side (10-min TTL).
        const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("google_ads_oauth_states" as never)
          .insert({ state, workspace_key: workspaceKey } as never);
        if (error) return new Response(`State persist failed: ${error.message}`, { status: 500 });

        const redirectUri = `${url.origin}/api/public/oauth/google-ads/callback`;

        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.searchParams.set("client_id", clientId);
        auth.searchParams.set("redirect_uri", redirectUri);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
        auth.searchParams.set("access_type", "offline");
        auth.searchParams.set("prompt", "consent"); // force refresh_token issuance
        auth.searchParams.set("include_granted_scopes", "true");
        auth.searchParams.set("state", state);

        return new Response(null, { status: 302, headers: { Location: auth.toString() } });
      },
    },
  },
});
