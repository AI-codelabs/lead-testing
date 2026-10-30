/**
 * The four steps of the Google Ads wizard, exercised against the real modules.
 * Google's own responses are stubbed because our Cloud project cannot reach
 * production accounts -- so this proves OUR logic, not Google's behaviour.
 * The error bodies in step 4 are verbatim captures from the live API today.
 */
export {};

process.env.GOOGLE_ADS_OAUTH_CLIENT_ID = "test-client";
process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET = "test-secret";

const { buildGoogleAdsCreds, listAdsAccounts, listConversionActions, googleAdsScopes, DATA_MANAGER_SCOPE } =
  await import("./google-ads.server");
const { selectableAccounts, groupByManager, accountLabel, humanError, shouldLoadAccounts } =
  await import("./google-ads-accounts");

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
};

// A realistic agency shape: one MCC, a sub-MCC, clients at level 1 and 2, and
// one account reachable BOTH directly and through the manager.
const HIERARCHY: Record<string, any[]> = {
  "1111111111": [
    { id: "1111111111", descriptiveName: "VKOM MCC",      manager: true,  level: 0, currencyCode: "EUR", timeZone: "Europe/Amsterdam" },
    { id: "2222222222", descriptiveName: "Sub MCC",       manager: true,  level: 1, currencyCode: "EUR", timeZone: "Europe/Amsterdam" },
    { id: "3333333333", descriptiveName: "Holland Huurt", manager: false, level: 1, currencyCode: "EUR", timeZone: "Europe/Amsterdam" },
    { id: "4444444444", descriptiveName: "MKG Koeriers",  manager: false, level: 2, currencyCode: "EUR", timeZone: "Europe/Amsterdam" },
    { id: "5555555555", descriptiveName: "Shared Client", manager: false, level: 2, currencyCode: "USD", timeZone: "Europe/Amsterdam" },
  ],
  "5555555555": [
    { id: "5555555555", descriptiveName: "Shared Client", manager: false, level: 0, currencyCode: "USD", timeZone: "Europe/Amsterdam" },
  ],
};

const realFetch = globalThis.fetch;
function stub(handler: (url: string, init: any) => { status: number; body: string }) {
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
    }
    const r = handler(u, init);
    return new Response(r.body, { status: r.status });
  }) as any;
}
const creds = buildGoogleAdsCreds("refresh")!;

// ---- Step 2: hierarchy walk + manager-id resolution -----------------------
console.log("\nStep 2 — hierarchy walk and manager-id resolution");
stub((u, init) => {
  if (u.includes("listAccessibleCustomers"))
    return { status: 200, body: JSON.stringify({ resourceNames: ["customers/1111111111", "customers/5555555555"] }) };
  const m = u.match(/customers\/(\d+)\/googleAds:search/)!;
  return { status: 200, body: JSON.stringify({ results: (HIERARCHY[m[1]] ?? []).map((c) => ({ customerClient: c })) }) };
});
const { accounts, errors } = await listAdsAccounts(creds);
check("no errors", errors, []);
check("every account found once", accounts.length, 5);
const byId = Object.fromEntries(accounts.map((a: any) => [a.id, a]));
check("client 2 levels down is reachable", byId["4444444444"].id, "4444444444");
check("…and routes via the MCC", byId["4444444444"].loginCustomerId, "1111111111");
check("…labelled with the manager", byId["4444444444"].via, "VKOM MCC");
check("direct access beats via-manager", byId["5555555555"].loginCustomerId, "");
check("…so it is shown ungrouped", byId["5555555555"].via, "");
check("the root needs no login id", byId["1111111111"].loginCustomerId, "");

// ---- Step 3: the picker ---------------------------------------------------
console.log("\nStep 3 — the picker with multi-level data");
const sel = selectableAccounts(accounts);
check("managers are not selectable", sel.map((a: any) => a.id).sort(), ["3333333333", "4444444444", "5555555555"]);
check("no MCC leaked in", sel.some((a: any) => a.manager), false);
const groups = groupByManager(sel);
check("grouped by the manager reached through", groups.map(([k, v]: any) => [k, v.length]), [["", 1], ["VKOM MCC", 2]]);
check("…directly-held accounts listed before manager groups", groups[0][0], "");
check("label carries name, id, currency", accountLabel(byId["4444444444"]), "MKG Koeriers · 4444444444 · EUR");

// ---- Step 4: conversion actions ------------------------------------------
console.log("\nStep 4 — conversion-action listing (never once reached in production)");
stub(() => ({ status: 200, body: JSON.stringify({ results: [
  { conversionAction: { id: "900", name: "Website lead",  type: "WEBPAGE",       status: "ENABLED" } },
  { conversionAction: { id: "901", name: "Leadlogr lead", type: "UPLOAD_CLICKS", status: "ENABLED" } },
] }) }));
const actions = await listConversionActions(creds, "4444444444", "1111111111");
check("both actions returned", actions.length, 2);
check("only UPLOAD_CLICKS is uploadable", actions.filter((a: any) => a.uploadable).map((a: any) => a.id), ["901"]);

// ---- Step 5: error mapping against REAL captured bodies -------------------
console.log("\nStep 5 — error mapping against bodies captured from the live API today");
const REAL_403 = JSON.stringify({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED",
  details: [{ "@type": "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure", errors: [{
    errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" },
    message: "The Google Cloud project is only approved for use with test accounts. To access non-test accounts, apply for Explorer, Basic or Standard access." }] }] } });
const REAL_SCOPE_403 = JSON.stringify({ error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED",
  details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } });

stub(() => ({ status: 403, body: REAL_403 }));
let msg = "";
try { await listAdsAccounts(creds); } catch (e: any) { msg = e.message; }
check("platform block becomes the neutral sentence",
  msg.startsWith("Google is not accepting conversions for this workspace yet."), true);
check("…and never leaks the tier name to the customer", /Explorer|Basic|Standard|Cloud project/.test(msg), false);

stub(() => ({ status: 403, body: REAL_SCOPE_403 }));
msg = "";
try { await listConversionActions(creds, "1", undefined); } catch (e: any) { msg = e.message; }
check("a scope error still surfaces its own text", msg.includes("insufficient authentication scopes"), true);

const HTML = "<!DOCTYPE html><html><body>Not Found</body></html>";
stub(() => ({ status: 404, body: HTML }));
msg = "";
try { await listConversionActions(creds, "1", undefined); } catch (e: any) { msg = e.message; }
check("a retired API version is named, not pasted", msg.includes("has almost certainly been retired"), true);
check("…and no markup reaches the reader", msg.includes("<html"), false);

// ---- Explorer: the two failures that only start happening once we are in ----
console.log("\nExplorer readiness — failures that cannot occur until access is granted");
const QUOTA_429 = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded",
  details: [{ errors: [{ errorCode: { quotaError: "RESOURCE_EXHAUSTED" },
    message: "Too many requests. Retry in 3600 seconds." }] }] } });
const NOT_ALLOWLISTED = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "Not allowlisted",
  details: [{ errors: [{ errorCode: { notAllowlistedError: "CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE" },
    message: "Customer is not allowlisted for this feature." }] }] } });

stub(() => ({ status: 429, body: QUOTA_429 }));
msg = "";
try { await listConversionActions(creds, "1", undefined); } catch (e: any) { msg = e.message; }
check("daily quota says it clears itself", msg.includes("clears automatically within 24 hours"), true);
check("…and never shows Google's retry seconds", /Retry in|seconds/.test(msg), false);

stub(() => ({ status: 403, body: NOT_ALLOWLISTED }));
msg = "";
try { await listConversionActions(creds, "1", undefined); } catch (e: any) { msg = e.message; }
check("the allowlist wall is explained, not echoed", msg.includes("not yet accepting uploaded conversions"), true);
check("…and says leads are still collected", msg.includes("leads keep being collected"), true);
check("…without the raw enum", msg.includes("CUSTOMER_NOT_ALLOWLISTED"), false);

// ---- Explorer: 2,880 operations a day, shared across every customer -------
console.log("\nExplorer readiness — the hierarchy walk stays off the shared quota");
const walk = (o: any) => shouldLoadAccounts({ connected: true, settingsLoaded: true, hasSavedAccount: false, requested: false, ...o });
check("a configured workspace costs nothing on arrival", walk({ hasSavedAccount: true }), false);
check("…until someone asks", walk({ hasSavedAccount: true, requested: true }), true);
check("setup still loads the list", walk({}), true);
check("nothing runs before settings arrive", walk({ settingsLoaded: false }), false);
check("…and nothing runs while disconnected", walk({ connected: false, requested: true }), false);

// ---- The Data Manager scope stays off until a real consent proves it -----
console.log("\nData Manager scope — opt-in, because a bad scope fails the whole consent");
check("off by default", googleAdsScopes({}).includes(DATA_MANAGER_SCOPE), false);
check("…so consent keeps working untouched", googleAdsScopes({}),
  "https://www.googleapis.com/auth/adwords openid email profile");
for (const on of ["1", "true", "yes", "TRUE"]) {
  check(`on for ${JSON.stringify(on)}`,
    googleAdsScopes({ GOOGLE_DATA_MANAGER_SCOPE: on }).includes(DATA_MANAGER_SCOPE), true);
}
for (const off of ["0", "false", "", "no"]) {
  check(`still off for ${JSON.stringify(off)}`,
    googleAdsScopes({ GOOGLE_DATA_MANAGER_SCOPE: off }).includes(DATA_MANAGER_SCOPE), false);
}
check("adwords is never dropped when it is on",
  googleAdsScopes({ GOOGLE_DATA_MANAGER_SCOPE: "1" }).includes("https://www.googleapis.com/auth/adwords"), true);

console.log("\nUI codes:");
check("not_connected becomes a sentence", humanError("not_connected"), "Not connected to Google Ads yet.");
check("a real sentence passes through", humanError("Google is not accepting conversions"), "Google is not accepting conversions");

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
