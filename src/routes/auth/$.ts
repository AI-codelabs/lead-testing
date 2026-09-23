import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxies Better Auth, which Neon hosts on its own domain, through this one.
 *
 * Better Auth sets its session cookie with `SameSite=None; Secure; Partitioned`
 * and no `Domain` attribute. Called straight at its Neon origin that cookie is
 * third-party to leadlogr.com, so the browser discards it: sign-in returns 200,
 * a session really is created server-side, and the user still lands back on the
 * login page with nothing to show for it. Because the cookie carries no
 * `Domain`, serving the auth server from this origin is enough — the browser
 * then scopes the cookie to leadlogr.com and keeps it.
 *
 * A `vercel.json` rewrite cannot do this: it forwards the incoming Host, and
 * the Neon endpoint answers `INVALID_HOSTNAME` to anything but its own. fetch()
 * sets Host from the destination, which is the whole point of proxying here.
 *
 * Only the browser-facing base URL moves. AUTH_JWKS_URL and AUTH_JWT_ISSUER
 * still point at Neon: those are server-to-server, and the `iss` claim on a
 * token is still Neon's origin.
 */

function upstreamBase(): string {
  const base = process.env.AUTH_BASE_URL;
  if (!base) {
    throw new Error("Missing AUTH_BASE_URL. Set it in .env.local (see neon/README.md).");
  }
  return base.replace(/\/+$/, "");
}

/**
 * Headers that describe this hop rather than the request, plus the ones fetch
 * must own. Forwarding `host` is what the rewrite got wrong; forwarding a
 * content-length that no longer matches the body we pass on breaks the upstream
 * parse, and an accept-encoding we cannot honour breaks the response.
 */
const HOP_BY_HOP = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "content-length", "accept-encoding",
]);

/**
 * Neon checks the forwarded host as strictly as it checks Host, so passing
 * these on reproduces the rewrite's INVALID_HOSTNAME exactly — and only in
 * production, since nothing sets them locally. The x-vercel-* headers describe
 * this deployment and mean nothing upstream.
 */
const isForwardingHeader = (name: string) =>
  name.startsWith("x-forwarded-") || name.startsWith("x-vercel-") || name === "forwarded";

/** Set by the platform on the way out; re-sending ours corrupts the body. */
const STRIP_FROM_RESPONSE = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection",
]);

async function proxy(request: Request, splat: string): Promise<Response> {
  const incoming = new URL(request.url);
  const target = `${upstreamBase()}/${splat}${incoming.search}`;

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    const name = k.toLowerCase();
    if (!HOP_BY_HOP.has(name) && !isForwardingHeader(name)) headers.set(k, v);
  }

  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    // Better Auth answers OAuth callbacks with a 302 the browser must follow
    // itself, so the redirect has to reach it rather than being chased here.
    redirect: "manual",
  });

  const out = new Headers();
  for (const [k, v] of upstream.headers) {
    if (!STRIP_FROM_RESPONSE.has(k.toLowerCase()) && k.toLowerCase() !== "set-cookie") {
      out.set(k, v);
    }
  }
  // Every Set-Cookie must survive as its own header; Headers collapses them.
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookie);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const Route = createFileRoute("/auth/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => proxy(request, params._splat ?? ""),
      POST: ({ request, params }) => proxy(request, params._splat ?? ""),
      PUT: ({ request, params }) => proxy(request, params._splat ?? ""),
      PATCH: ({ request, params }) => proxy(request, params._splat ?? ""),
      DELETE: ({ request, params }) => proxy(request, params._splat ?? ""),
      OPTIONS: ({ request, params }) => proxy(request, params._splat ?? ""),
    },
  },
});
