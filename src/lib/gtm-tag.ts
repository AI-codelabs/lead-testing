/**
 * The Leadlogr tracker as a Google Tag Manager tag.
 *
 * One builder for both places the snippet appears: the copy-paste block on the
 * tracking page and the tag Leadlogr installs through the Tag Manager API. They
 * used to be able to drift; now an auto-installed tag is byte-for-byte what a
 * customer would have pasted by hand.
 *
 * Pure and isomorphic: no server imports, so the page and the unit test can
 * load it directly.
 */

/** The tag and trigger are matched by these names, so re-installing updates rather than duplicates. */
export const LEADLOGR_GTM_TAG_NAME = "Leadlogr tracker";
export const LEADLOGR_GTM_TRIGGER_NAME = "Leadlogr - All Pages";
export const LEADLOGR_GTM_WORKSPACE_PREFIX = "Leadlogr install";

export type TrackerSnippetInput = {
  ingestKey: string;
  /** Absolute ingest URL, e.g. https://www.leadlogr.com/api/public/leads/collect */
  endpoint: string;
  /** Absolute tracker URL, e.g. https://www.leadlogr.com/api/public/tracker/v1 */
  trackerSrc: string;
  integrationId: string;
  debug: boolean;
  featureFlags: { allowDynamicForms: boolean };
};

/** The Custom HTML a customer pastes into GTM, and what Leadlogr installs for them. */
export function buildGtmSnippet(i: TrackerSnippetInput): string {
  const flagsJson = JSON.stringify({ allowDynamicForms: i.featureFlags.allowDynamicForms });
  return `<!-- Leadlogr Tracker — Paste in GTM › Tags › New › Custom HTML
     Trigger: All Pages (Page View) -->
<script>
(function () {
  if (window.__LEADLOGR_LOADED__) return;
  window.__LEADLOGR_LOADED__ = true;
  window.LEADLOGR_CONFIG = {
    ingestKey: ${JSON.stringify(i.ingestKey)},
    endpoint:    ${JSON.stringify(i.endpoint)},
    integrationId: ${JSON.stringify(i.integrationId)},
    debug:       ${i.debug ? "true" : "false"},
    featureFlags: ${flagsJson}
  };
  var s = document.createElement('script');
  s.async = true;
  s.src = ${JSON.stringify(i.trackerSrc)};
  document.head.appendChild(s);
})();
</script>`;
}

/** Tag Manager API v2 Parameter. */
export type GtmParameter = { type: string; key: string; value: string };

/** The body of a Tag Manager API v2 `tags.create` / `tags.update` call. */
export type GtmTagPayload = {
  name: string;
  type: "html";
  parameter: GtmParameter[];
  firingTriggerId: string[];
  tagFiringOption: "oncePerEvent";
  notes: string;
};

/** The body of a Tag Manager API v2 `triggers.create` call: every page view, no filters. */
export type GtmTriggerPayload = {
  name: string;
  type: "pageview";
  notes: string;
};

export function buildGtmTriggerPayload(): GtmTriggerPayload {
  return {
    name: LEADLOGR_GTM_TRIGGER_NAME,
    type: "pageview",
    notes: "Created by Leadlogr. Fires the Leadlogr tracker on every page.",
  };
}

export function buildGtmTagPayload(input: TrackerSnippetInput, triggerId: string): GtmTagPayload {
  if (!/^[a-f0-9]{32,}$/.test(input.ingestKey)) {
    throw new Error("Refusing to build a GTM tag without a real workspace ingest key");
  }
  for (const [label, url] of [
    ["endpoint", input.endpoint],
    ["trackerSrc", input.trackerSrc],
  ] as const) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${label} must be an absolute URL`);
    }
    // A published tag runs on the customer's live https site; an http or
    // localhost endpoint would be blocked as mixed content or reach nothing.
    if (parsed.protocol !== "https:") throw new Error(`${label} must use https`);
  }
  if (!triggerId) throw new Error("triggerId is required");

  return {
    name: LEADLOGR_GTM_TAG_NAME,
    type: "html",
    parameter: [
      { type: "template", key: "html", value: buildGtmSnippet(input) },
      { type: "boolean", key: "supportDocumentWrite", value: "false" },
    ],
    firingTriggerId: [triggerId],
    tagFiringOption: "oncePerEvent",
    notes:
      "Created by Leadlogr. Records form submissions as leads. Managed from Leadlogr › Tracking.",
  };
}

/** The HTML parameter of an existing tag, for deciding whether anything changed. */
export function tagHtml(tag: { parameter?: GtmParameter[] } | null | undefined): string | null {
  return tag?.parameter?.find((p) => p.key === "html")?.value ?? null;
}

/** Whether an existing tag already matches the desired one, so nothing needs publishing. */
export function tagIsCurrent(
  existing: {
    type?: string;
    parameter?: GtmParameter[];
    firingTriggerId?: string[];
    paused?: boolean;
  } | null,
  desired: GtmTagPayload,
): boolean {
  if (!existing || existing.paused) return false;
  if (existing.type !== desired.type) return false;
  if (tagHtml(existing) !== tagHtml(desired)) return false;
  const a = [...(existing.firingTriggerId ?? [])].sort().join(",");
  const b = [...desired.firingTriggerId].sort().join(",");
  return a === b;
}
