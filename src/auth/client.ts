import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

// Better Auth runs on Neon, not in this app. VITE_AUTH_URL is the base URL
// Neon returned when auth was provisioned (see neon/README.md).
const baseURL = import.meta.env.VITE_AUTH_URL;

if (!baseURL) {
  throw new Error('Missing VITE_AUTH_URL. Set it in .env.local (see neon/README.md).');
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [organizationClient()],
  fetchOptions: {
    // Better Auth runs on a different origin to this app, so its session
    // cookie is cross-site: it is issued SameSite=None; Secure; Partitioned.
    // Without credentials: "include" the browser withholds it and every call
    // comes back 401, including /token.
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession, organization } = authClient;

/**
 * Short-lived JWT for calling this app's own server functions.
 *
 * The session itself lives in a cookie on the Neon auth origin. Our server
 * cannot read that cookie, so it verifies this JWT against Neon's JWKS
 * instead.
 *
 * Cached in memory. Tokens last 15 minutes, and this is called on EVERY
 * server function — with a polling hook running, fetching a fresh one each
 * time rate-limits the auth server (429), which then surfaces to the user as
 * a spurious "Unauthorized".
 */
let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string | null> | null = null;

/** Refresh this long before expiry, so a request in flight cannot age out. */
const REFRESH_MARGIN_MS = 60_000;

function expiryOf(token: string): number {
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function getAuthToken(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) {
    return cached.token;
  }

  // Collapse concurrent callers onto one request: a page load fires several
  // server functions at once, and each would otherwise start its own fetch.
  if (inFlight) return inFlight;

  inFlight = authClient
    .$fetch<{ token: string }>('/token', { method: 'GET' })
    .then(({ data }) => {
      const token = data?.token ?? null;
      cached = token ? { token, expiresAt: expiryOf(token) } : null;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drops the cached token. Call on sign-out so the next call re-authenticates. */
export function clearAuthToken(): void {
  cached = null;
  inFlight = null;
}
