# Why /auth is proxied

`vercel.json` rewrites `/auth/*` to the Better Auth server Neon hosts.

Better Auth sets its session cookie with `SameSite=None; Secure; Partitioned`
and **no `Domain` attribute**. Called directly at its Neon origin, that cookie
is third-party to leadlogr.com — Safari blocks those outright, and Chrome
blocks them in Incognito and progressively elsewhere. The symptom is nasty:
sign-in returns 200 and a session is created server-side, but the browser
never stores the cookie, so the user lands back on the login page with no
error shown.

Because the cookie carries no `Domain`, proxying the auth server through this
domain makes the browser scope it to leadlogr.com instead — first-party, and
unaffected by third-party cookie policy.

Only the browser-facing base URL changes (`VITE_AUTH_URL` -> `/auth`).
`AUTH_JWKS_URL` and `AUTH_JWT_ISSUER` stay pointed at Neon directly: those are
server-to-server, and the JWT `iss` claim is still Neon's origin.
