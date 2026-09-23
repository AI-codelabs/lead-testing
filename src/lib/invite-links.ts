/**
 * Builds the signup URL for an invitation.
 *
 * The query parameter is not cosmetic: /signup reads it to decide what kind of
 * account the recipient is creating. `clientInvite` makes a standard company
 * workspace, `memberInvite` joins an existing one. A generic `invite` forces an
 * agency account, so handing a company that link signs them up as an agency.
 *
 * Built from the current origin rather than SITE_URL so a link copied from a
 * preview deployment points back at that deployment instead of production.
 */
export type InviteKind = "member" | "client";

export function inviteSignupUrl(token: string, kind: InviteKind, origin?: string): string {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const param = kind === "member" ? "memberInvite" : "clientInvite";
  return `${base}/signup?${param}=${token}`;
}
