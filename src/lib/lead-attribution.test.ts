import { inferLeadSource, isGoogleMyBusinessReferrer, resolveCampaignName } from "./lead-attribution";

function check(name: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(ok ? `  PASS  ${name}` : `  FAIL  ${name}\n        expected ${JSON.stringify(expected)}\n        got  ${JSON.stringify(got)}`);
  if (!ok) process.exitCode = 1;
}

console.log("lead attribution — source inference");
check("gclid is Google Ads", inferLeadSource({ gclid: "abc" }), "Google");
check("gbraid is Google Ads", inferLeadSource({ gbraid: "abc" }), "Google");
check("fbclid is Meta", inferLeadSource({ fbclid: "abc" }), "Meta");
check(
  "maps referrer is GMB",
  inferLeadSource({ referrerUrl: "https://www.google.com/maps/place/Foo" }),
  "Google My Business",
);
check(
  "g.page referrer is GMB",
  inferLeadSource({ referrerUrl: "https://g.page/r/abc" }),
  "Google My Business",
);
check(
  "utm google+local is GMB",
  inferLeadSource({ utmSource: "google", utmMedium: "local" }),
  "Google My Business",
);
check("empty is Direct", inferLeadSource({}), "Direct");
check(
  "paid beats GMB referrer",
  inferLeadSource({ gclid: "x", referrerUrl: "https://www.google.com/maps" }),
  "Google",
);

console.log("lead attribution — helpers");
check("maps host detected", isGoogleMyBusinessReferrer("https://maps.google.nl/maps?q=1"), true);
check("campaign prefers explicit name", resolveCampaignName("Named", "utm"), "Named");
check("campaign falls back to utm", resolveCampaignName("", "utm-camp"), "utm-camp");

if (!process.exitCode) console.log("\nAll lead-attribution checks passed.");
