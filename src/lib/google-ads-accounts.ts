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
