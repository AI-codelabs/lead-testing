import { formatConversionDateTime } from "./google-ads.server";

function check(name: string, got: unknown, expected: unknown) {
  const ok = got === expected;
  console.log(ok ? `  PASS  ${name}` : `  FAIL  ${name}\n        expected ${JSON.stringify(expected)}\n        got  ${JSON.stringify(got)}`);
  if (!ok) process.exitCode = 1;
}

const instant = new Date("2026-11-25T20:04:00.000Z");

console.log("formatConversionDateTime");
check("UTC default", formatConversionDateTime(instant), "2026-11-25 20:04:00+00:00");
check("UTC explicit", formatConversionDateTime(instant, "UTC"), "2026-11-25 20:04:00+00:00");
check("Amsterdam winter", formatConversionDateTime(instant, "Europe/Amsterdam"), "2026-11-25 21:04:00+01:00");
check("Pacific", formatConversionDateTime(instant, "America/Los_Angeles"), "2026-11-25 12:04:00-08:00");
check("numeric offset still works", formatConversionDateTime(instant, 60), "2026-11-25 21:04:00+01:00");
check("invalid zone falls back to UTC", formatConversionDateTime(instant, "Not/AZone"), "2026-11-25 20:04:00+00:00");

// DST: Amsterdam in July is +02:00
const summer = new Date("2026-07-15T12:00:00.000Z");
check("Amsterdam summer DST", formatConversionDateTime(summer, "Europe/Amsterdam"), "2026-07-15 14:00:00+02:00");

if (!process.exitCode) console.log("\nAll datetime checks passed.");
