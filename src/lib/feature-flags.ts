/**
 * Google Tag Manager auto-install (connect, pick a container, publish).
 *
 * Off until Google has verified the Tag Manager scopes on the OAuth consent
 * screen. While they are unverified every customer who connects sees Google's
 * "unverified app" warning and uses up one of the app's 100 lifetime user-cap
 * slots, which cannot be reset. The copy-paste GTM snippet needs no Google
 * permission and stays available either way.
 *
 * Turn on by setting VITE_GTM_AUTO_INSTALL=1 in the deployment environment and
 * redeploying. Read at build time, so the client and the server agree.
 */
export const GTM_AUTO_INSTALL_ENABLED = import.meta.env.VITE_GTM_AUTO_INSTALL === "1";
