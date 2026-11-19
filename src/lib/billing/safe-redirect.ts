/**
 * Only follow checkout / portal URLs that are absolute https.
 * Prevents javascript: or relative open-redirect style payloads if a processor
 * response is ever compromised or misconfigured.
 */
export function safeCheckoutUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
