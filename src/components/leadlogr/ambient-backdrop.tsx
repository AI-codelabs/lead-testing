/**
 * A faint wash of the landing page's illustration, behind the app shell.
 *
 * It is the hero image cropped to its sky, blurred and desaturated down to a
 * 3 KB tile, then stretched and faded out — so the app feels related to the
 * marketing page without putting a picture behind live data.
 *
 * Panels are opaque (`bg-card`), so this only ever sits behind the page
 * gutters and headings. It is fixed rather than scrolled: a wash that slides
 * around behind a table reads as a rendering glitch.
 *
 * The opacity is set by the headings that sit on it, not by taste. Muted text
 * only has 5.3:1 on the bare background, so the wash eats into a thin margin:
 * sampling the tile under the page header gives 4.7:1 at 0.08 and 4.2:1 at
 * 0.16, against the 4.5:1 AA floor. Raise it and small grey text fails.
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[url('/app-ambient.webp')] bg-cover bg-top bg-no-repeat opacity-[0.08] dark:opacity-[0.06] [mask-image:linear-gradient(to_bottom,black,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black,transparent)]"
    />
  );
}
