/**
 * Coercion for values arriving from the tracker.
 *
 * Lives apart from the collect route so the rule can be tested: the route is a
 * file-based endpoint and exporting helpers from it is not free.
 */

/**
 * A trimmed, length-capped string, or null when there is nothing usable.
 *
 * Anything non-primitive is a mistake on the way in rather than a value, so it
 * becomes null instead of text. `String()` would render it "[object Object]"
 * and store that as though a visitor had typed it — which is exactly what
 * happened when a DOM element, read off a form property a field had shadowed,
 * arrived as a lead's form_action and silently broke the de-duplication that
 * compares it.
 */
export function str(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" || typeof v === "function") return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
