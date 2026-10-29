/**
 * How a lead's timestamps read.
 *
 * Two different questions, so two different formats. Scanning a pipeline the
 * question is "is this fresh?", which a relative time answers at a glance.
 * Comparing two leads the question is "which came first, and how far apart?",
 * which only an exact stamp answers — and that was the case that mattered when
 * one submission arrived 97 times and the only way to see it was to open leads
 * one by one and read the minutes.
 */

/** "2 min ago", "3 h ago", "yesterday", then a plain date. */
export function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)} h ago`;
  const days = Math.round(secs / 86_400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "28 Oct 14:51" — date and time, for comparing rows against each other. */
export function dateAndTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Everything, including seconds, for the tooltip. */
export function exactTimestamp(iso: string): string | undefined {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
}

/** Date-range presets, as a number of days back. `null` means no limit. */
export const DATE_RANGES: Array<{ label: string; days: number | null }> = [
  { label: "Any time", days: null },
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/**
 * Is this lead inside the selected range?
 *
 * "Today" means since midnight rather than the last 24 hours, because that is
 * what someone looking at a pipeline in the afternoon means by it.
 */
export function withinRange(iso: string, days: number | null): boolean {
  if (days === null) return true;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  if (days === 1) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return d >= midnight.getTime();
  }
  return d >= Date.now() - days * 86_400_000;
}
