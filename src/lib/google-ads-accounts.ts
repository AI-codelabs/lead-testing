import type { GoogleAdsCustomer } from "./integrations.functions";

/**
 * How the account picker is built.
 *
 * Pulled out of the component so it can be tested: what ends up in this
 * dropdown is exactly what left a partner stuck — he connected successfully,
 * opened it, and found seven entries, none of them the client he had just
 * connected.
 */

/**
 * Only accounts that can actually receive a conversion.
 *
 * A manager (MCC) cannot, so offering one is offering a dead end. They become
 * group headings instead, which is also the only thing that makes a list of
 * numeric IDs readable to the person choosing.
 */
export function selectableAccounts(all: GoogleAdsCustomer[]): GoogleAdsCustomer[] {
  return all.filter((a) => !a.manager);
}

/**
 * Client accounts grouped under the manager they were reached through.
 *
 * The empty key holds accounts the connected user is named on directly; they
 * need no manager and are rendered ungrouped.
 */
export function groupByManager(
  selectable: GoogleAdsCustomer[],
): Array<[string, GoogleAdsCustomer[]]> {
  const groups = new Map<string, GoogleAdsCustomer[]>();
  for (const a of selectable) {
    const list = groups.get(a.via || "");
    if (list) list.push(a);
    else groups.set(a.via || "", [a]);
  }
  return [...groups.entries()];
}

/** The label shown for one option. */
export function accountLabel(a: GoogleAdsCustomer): string {
  const name = a.descriptiveName || "(unnamed)";
  return a.currencyCode ? `${name} · ${a.id} · ${a.currencyCode}` : `${name} · ${a.id}`;
}

/**
 * The reasons the server returns as codes rather than sentences.
 *
 * These travel as `error` on the server functions and were being rendered
 * straight into the page: a partner disconnected Google Ads and the only thing
 * the screen then told him was `not_connected`. A code is a thing for a log.
 */
const ERROR_SENTENCES: Record<string, string> = {
  not_connected: "Not connected to Google Ads yet.",
  list_failed: "Could not read your Google Ads accounts.",
  access_denied: "The Google sign-in was cancelled.",
};

/** A sentence for anything we hand to the reader; passes real messages through. */
export function humanError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ERROR_SENTENCES[raw] ?? raw;
}
