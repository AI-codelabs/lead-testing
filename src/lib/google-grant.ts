/**
 * Whether disconnecting one Google integration may revoke the grant at Google.
 *
 * Google keeps one authorization per Google account per OAuth client. Google
 * Ads and Tag Manager use the same client, so revoking the token from one of
 * them also kills every other Leadlogr connection made with that Google
 * account -- the other integration in this workspace, or either integration in
 * another workspace. Pure, so the rule is testable without a database.
 */

export type RevokeDecision = { revoke: boolean; note: string | null };

const LABEL = { google_ads: "Google Ads", google_tag_manager: "Google Tag Manager" } as const;
export type GoogleGrantNetwork = keyof typeof LABEL;

export function decideGoogleRevoke(input: {
  network: GoogleGrantNetwork;
  /** Whether we held a refresh token at all. */
  held: boolean;
  /** Other stored Leadlogr connections made with the same Google account. */
  otherHolders: GoogleGrantNetwork[];
}): RevokeDecision {
  if (!input.held) return { revoke: false, note: null };
  if (input.otherHolders.length === 0) return { revoke: true, note: null };
  const others = [...new Set(input.otherHolders)].map((n) => LABEL[n]).join(" and ");
  return {
    revoke: false,
    note: `Leadlogr deleted its ${LABEL[input.network]} authorization. The same Google account is still connected to ${others} in Leadlogr, so the grant was not revoked at Google (that would disconnect ${others} too).`,
  };
}
