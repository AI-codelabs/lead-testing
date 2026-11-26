/**
 * Disconnecting one Google integration must not revoke a grant another Leadlogr
 * connection still depends on: Google keeps one grant per Google account per
 * OAuth client, and Google Ads and Tag Manager share the client.
 */
export {};

const { decideGoogleRevoke } = await import("./google-grant");
const { otherGoogleGrantHolders } = await import("./google-grant.server");

let pass = 0,
  fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
};

console.log("\nDecision");
check(
  "nothing held: nothing to revoke",
  decideGoogleRevoke({ network: "google_ads", held: false, otherHolders: [] }),
  { revoke: false, note: null },
);
check(
  "sole holder: revoke at Google",
  decideGoogleRevoke({ network: "google_ads", held: true, otherHolders: [] }),
  { revoke: true, note: null },
);
const adsShared = decideGoogleRevoke({
  network: "google_ads",
  held: true,
  otherHolders: ["google_tag_manager"],
});
check("Ads disconnect while GTM shares the grant: keep it", adsShared.revoke, false);
check(
  "note names Tag Manager",
  adsShared.note?.includes("still connected to Google Tag Manager"),
  true,
);
const gtmShared = decideGoogleRevoke({
  network: "google_tag_manager",
  held: true,
  otherHolders: ["google_ads", "google_ads"],
});
check("GTM disconnect while Ads shares the grant: keep it", gtmShared.revoke, false);
check("note de-duplicates networks", gtmShared.note?.includes("Google Ads and"), false);

console.log("\nHolder lookup (stubbed database)");
function stubDb(opts: { ads: boolean; migrated: boolean; gtm: boolean }) {
  const seen: string[] = [];
  const db = {
    async sql<T>(text: string, params?: unknown[]): Promise<T[]> {
      seen.push(text.replace(/\s+/g, " ").trim().slice(0, 40));
      if (text.includes("to_regclass")) return [{ ok: opts.migrated }] as T[];
      if (text.includes("tag_manager_installs")) {
        if (!opts.migrated) throw new Error("relation does not exist");
        return (opts.gtm ? [{ n: 1 }] : []) as T[];
      }
      if (text.includes("'google_ads'")) {
        check("params are email, org, network", params?.length, 3);
        return (opts.ads ? [{ n: 1 }] : []) as T[];
      }
      return [] as T[];
    },
  };
  return { db, seen };
}

check(
  "no email: cannot tell, no holders (revoke as before)",
  await otherGoogleGrantHolders(
    stubDb({ ads: true, migrated: true, gtm: true }).db,
    "o",
    "google_ads",
    null,
  ),
  [],
);
check(
  "both found",
  await otherGoogleGrantHolders(
    stubDb({ ads: true, migrated: true, gtm: true }).db,
    "o",
    "google_ads",
    "a@b.c",
  ),
  ["google_ads", "google_tag_manager"],
);
const pre = stubDb({ ads: false, migrated: false, gtm: true });
check(
  "before the GTM migration the GTM table is never queried",
  await otherGoogleGrantHolders(pre.db, "o", "google_ads", "a@b.c"),
  [],
);
check("only two statements ran", pre.seen.length, 2);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
