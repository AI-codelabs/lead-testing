import { createRemoteJWKSet, jwtVerify } from 'jose';

// Cached across requests: jose refetches the key set only when it sees an
// unknown `kid`, so key rotation is handled without a redeploy.
let _jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function jwks() {
  if (!_jwks) {
    const url = process.env.AUTH_JWKS_URL;
    if (!url) {
      throw new Error('Missing AUTH_JWKS_URL. Set it in .env.local (see neon/README.md).');
    }
    _jwks = createRemoteJWKSet(new URL(url));
  }
  return _jwks;
}

export type AuthClaims = {
  userId: string;
  email: string | null;
  /** Organization the session is currently acting in, when one is selected. */
  activeOrganizationId: string | null;
};

/**
 * Verify a Better Auth JWT issued by Neon.
 *
 * Signature, expiry and issuer are all checked against the remote JWKS —
 * nothing here trusts a claim the client asserted on its own.
 */
export async function verifyAuthToken(token: string): Promise<AuthClaims> {
  // Neon issues tokens with `iss` set to the auth server's ORIGIN, not the
  // full base URL that ends in /<database>/auth. Verifying against the base
  // URL rejects every otherwise-valid token, so this is configured separately.
  const issuer = process.env.AUTH_JWT_ISSUER;
  if (!issuer) {
    throw new Error('Missing AUTH_JWT_ISSUER. Set it in .env.local (see neon/README.md).');
  }

  const { payload } = await jwtVerify(token, jwks(), { issuer });

  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  if (!userId) {
    throw new Error('Unauthorized: token has no subject');
  }

  return {
    userId,
    email: typeof payload.email === 'string' ? payload.email : null,
    activeOrganizationId:
      typeof payload.activeOrganizationId === 'string' ? payload.activeOrganizationId : null,
  };
}
