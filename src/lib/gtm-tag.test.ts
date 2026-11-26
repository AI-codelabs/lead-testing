/**
 * The Tag Manager tag payload, and the install sequence against a stubbed
 * Tag Manager API. Proves our logic -- what we send, in what order, and that
 * a second run is idempotent -- not Google's behaviour.
 */
export {};

const {
  buildGtmSnippet,
  buildGtmTagPayload,
  buildGtmTriggerPayload,
  tagIsCurrent,
  tagHtml,
  LEADLOGR_GTM_TAG_NAME,
  LEADLOGR_GTM_TRIGGER_NAME,
} = await import("./gtm-tag");
const { TagManagerClient, installAndPublishTracker, tagManagerScopes, humanGtmError } =
  await import("./google-tag-manager.server");

let pass = 0,
  fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
};
const throws = (name: string, fn: () => unknown) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(name, threw, true);
};

const KEY = "a".repeat(32);
const input = {
  ingestKey: KEY,
  endpoint: "https://www.leadlogr.com/api/public/leads/collect",
  trackerSrc: "https://www.leadlogr.com/api/public/tracker/v1",
  integrationId: "gtm",
  debug: false,
  featureFlags: { allowDynamicForms: true },
};

// --- snippet ---------------------------------------------------------------
console.log("\nSnippet");
const html = buildGtmSnippet(input);
check("contains the ingest key", html.includes(`ingestKey: "${KEY}"`), true);
check("contains the tracker src", html.includes(`s.src = "${input.trackerSrc}"`), true);
check("debug rendered as a literal", html.includes("debug:       false"), true);
check("feature flags as JSON", html.includes(`featureFlags: {"allowDynamicForms":true}`), true);
const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
let parses = true;
try {
  new Function(script);
} catch {
  parses = false;
}
check("script body parses as JavaScript", parses, true);
const hostile = buildGtmSnippet({ ...input, integrationId: '"};alert(1);//' });
check("values are JSON-escaped", hostile.includes('integrationId: "\\"};alert(1);//"'), true);

// --- payloads --------------------------------------------------------------
console.log("\nPayloads");
const tag = buildGtmTagPayload(input, "42");
check("tag name", tag.name, LEADLOGR_GTM_TAG_NAME);
check("tag type is Custom HTML", tag.type, "html");
check("html parameter is the snippet", tagHtml(tag), html);
check(
  "document.write off",
  tag.parameter.find((p) => p.key === "supportDocumentWrite")?.value,
  "false",
);
check("fires on the given trigger", tag.firingTriggerId, ["42"]);
check("trigger is an unfiltered page view", buildGtmTriggerPayload(), {
  name: LEADLOGR_GTM_TRIGGER_NAME,
  type: "pageview",
  notes: "Created by Leadlogr. Fires the Leadlogr tracker on every page.",
});
throws("refuses a placeholder ingest key", () =>
  buildGtmTagPayload({ ...input, ingestKey: "ws_acme" }, "1"),
);
throws("refuses an http endpoint", () =>
  buildGtmTagPayload({ ...input, endpoint: "http://localhost:3000/api/public/leads/collect" }, "1"),
);
throws("refuses a relative tracker src", () =>
  buildGtmTagPayload({ ...input, trackerSrc: "/tracker" }, "1"),
);
throws("refuses a missing trigger", () => buildGtmTagPayload(input, ""));

check("identical tag is current", tagIsCurrent({ ...tag }, tag), true);
check("paused tag is not current", tagIsCurrent({ ...tag, paused: true }, tag), false);
check(
  "different html is not current",
  tagIsCurrent(
    { ...tag, parameter: [{ type: "template", key: "html", value: "<script></script>" }] },
    tag,
  ),
  false,
);
check(
  "different trigger is not current",
  tagIsCurrent({ ...tag, firingTriggerId: ["7"] }, tag),
  false,
);

// --- scopes ----------------------------------------------------------------
console.log("\nScopes");
const scopes = tagManagerScopes().split(" ");
check("exactly the four Tag Manager scopes plus openid email", scopes, [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "openid",
  "email",
]);
check(
  "never asks for adwords",
  scopes.some((s) => s.includes("adwords")),
  false,
);
check(
  "403 insufficient explains Publish permission",
  humanGtmError(403, "insufficient permissions").includes("Publish permission"),
  true,
);

// --- install sequence against a fake API -----------------------------------
console.log("\nInstall");
const C = "accounts/1/containers/2";
function fakeApi() {
  const calls: string[] = [];
  const state = {
    tags: [] as Array<Record<string, unknown>>,
    triggers: [] as Array<Record<string, unknown>>,
    workspaces: 0,
  };
  const fetcher = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = url.replace("https://tagmanager.googleapis.com/tagmanager/v2/", "");
    calls.push(`${method} ${path}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    const ws = `${C}/workspaces/${state.workspaces}`;
    if (method === "GET" && path === C) {
      return json({
        accountId: "1",
        containerId: "2",
        name: "Site",
        publicId: "GTM-ABC",
        path: C,
        usageContext: ["web"],
        tagManagerUrl: "https://tagmanager.google.com/#/container/accounts/1/containers/2",
      });
    }
    if (method === "POST" && path === `${C}/workspaces`) {
      state.workspaces++;
      return json({
        path: `${C}/workspaces/${state.workspaces}`,
        workspaceId: String(state.workspaces),
        name: body.name,
      });
    }
    if (method === "GET" && path === `${ws}/triggers`) return json({ trigger: state.triggers });
    if (method === "POST" && path === `${ws}/triggers`) {
      const t = { ...body, triggerId: "9", path: `${ws}/triggers/9` };
      state.triggers.push(t);
      return json(t);
    }
    if (method === "GET" && path === `${ws}/tags`) return json({ tag: state.tags });
    if (method === "POST" && path === `${ws}/tags`) {
      const t = { ...body, tagId: "5", path: `${ws}/tags/5` };
      state.tags.push(t);
      return json(t);
    }
    if (method === "PUT" && path.includes("/tags/")) {
      Object.assign(state.tags[0], body);
      return json(state.tags[0]);
    }
    if (method === "POST" && path === `${ws}:create_version`) {
      return json({
        containerVersion: {
          path: `${C}/versions/${state.workspaces}`,
          containerVersionId: String(state.workspaces),
        },
      });
    }
    if (method === "POST" && path.endsWith(":publish")) {
      return json({
        containerVersion: {
          path: `${C}/versions/${state.workspaces}`,
          containerVersionId: String(state.workspaces),
          tagManagerUrl: "https://tagmanager.google.com/v",
        },
      });
    }
    if (method === "DELETE") return new Response("", { status: 200 });
    return new Response(`unexpected ${method} ${path}`, { status: 500 });
  }) as unknown as typeof fetch;
  return { calls, state, fetcher };
}

const creds = { clientId: "c", clientSecret: "s", refreshToken: "r" };
const api = fakeApi();
const client = new TagManagerClient(creds, api.fetcher, async () => "token");
const first = await installAndPublishTracker(client, {
  accountId: "1",
  containerId: "2",
  snippet: input,
  now: new Date("2026-11-26T10:00:00Z"),
});
check("first run publishes", first.status, "published");
check(
  "first run creates tag and trigger",
  [first.tagAction, first.triggerAction],
  ["created", "created"],
);
check("first run version", first.versionId, "1");
check("first run call order", api.calls, [
  `GET ${C}`,
  `POST ${C}/workspaces`,
  `GET ${C}/workspaces/1/triggers`,
  `POST ${C}/workspaces/1/triggers`,
  `GET ${C}/workspaces/1/tags`,
  `POST ${C}/workspaces/1/tags`,
  `POST ${C}/workspaces/1:create_version`,
  `POST ${C}/versions/1:publish`,
]);

api.calls.length = 0;
const second = await installAndPublishTracker(client, {
  accountId: "1",
  containerId: "2",
  snippet: input,
});
check("second identical run publishes nothing", second.status, "unchanged");
check("second run cleans up its workspace", api.calls.at(-1), `DELETE ${C}/workspaces/2`);
check(
  "second run never versions",
  api.calls.some((c) => c.includes("create_version")),
  false,
);

api.calls.length = 0;
const third = await installAndPublishTracker(client, {
  accountId: "1",
  containerId: "2",
  snippet: { ...input, debug: true },
});
check(
  "changed snippet updates in place",
  [third.status, third.tagAction, third.triggerAction],
  ["published", "updated", "reused"],
);
check("still exactly one tag", api.state.tags.length, 1);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
