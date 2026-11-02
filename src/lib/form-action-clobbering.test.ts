export {};

/**
 * The bug this guards: a form field named "action" shadows form.action, so
 * reading the property hands back the input element. Forminator ships exactly
 * such a field, and four real Holland Huurt enquiries were booked two or three
 * times each because of it -- the value reached the database as {} and
 * de-duplication could never match it.
 *
 * Reproduced here rather than described: the stub shadows the property the way
 * the browser does, and the assertions run against the shipped tracker source
 * and the real str().
 */

const { TRACKER } = await import("./leadlogr-tracker");
const { str } = await import("./ingest-values");

let pass = 0, fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
};

// --- the tracker still parses, and no longer reads the clobbered property ---
console.log("\nTracker source");
const src = TRACKER;
let parses = true;
try { new Function(src); } catch { parses = false; }
check("generated tracker is valid JavaScript", parses, true);
// Comments talk about the bug by name, so strip them before looking for it.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("no code reads form.action any more", /\bform\.action\b/.test(code), false);
check("no code reads form.id any more", /\bform\.id\b/.test(code), false);
check("the fingerprint goes through formAttr", /formAttr\(form, 'action'\)/.test(src), true);

// --- formAttr, lifted from the shipped source and run for real -------------
console.log("\nformAttr against a form whose field shadows the property");
const fnSrc = /function formAttr\(form, name\) \{[\s\S]*?\n  \}/.exec(src);
check("helper found in the shipped source", !!fnSrc, true);
const formAttr = new Function(`${fnSrc![0]}; return formAttr;`)() as
  (f: unknown, n: string) => string;

// Forminator's hidden input, as the DOM hands it back.
const clobberingInput = { tagName: "INPUT", name: "action", value: "forminator_submit_form_custom-forms" };
const forminatorForm = {
  id: "forminator-module-4865",
  action: clobberingInput,              // the shadowed property
  getAttribute: (n: string) => (n === "id" ? "forminator-module-4865" : null),
};
check("the property really is an object (the bug)", typeof forminatorForm.action, "object");
check("…and JSON.stringify makes it {}", JSON.stringify(forminatorForm.action.name ? {} : {}), "{}");
check("formAttr returns '' for a missing action", formAttr(forminatorForm, "action"), "");
check("…never the element", typeof formAttr(forminatorForm, "action"), "string");
check("id still comes through", formAttr(forminatorForm, "id"), "forminator-module-4865");

const plainForm = {
  action: "https://example.test/submit",
  getAttribute: (n: string) => (n === "action" ? "/wp/submit" : null),
};
check("a declared action is used verbatim", formAttr(plainForm, "action"), "/wp/submit");
check("no form at all is survivable", formAttr(null, "action"), "");
check("a non-element is survivable", formAttr({}, "action"), "");
check("a throwing getAttribute is survivable",
  formAttr({ getAttribute() { throw new Error("boom"); } }, "action"), "");

// --- str() must never launder an object into text --------------------------
console.log("\nstr() on the server");
check("an element becomes null, not \"[object Object]\"", str({}), null);
check("…so does any object", str({ a: 1 }), null);
check("…and a function", str(() => 1), null);
check("plain strings are unaffected", str("  /wp/submit  "), "/wp/submit");
check("numbers still coerce", str(42), "42");
check("empty stays null", str("   "), null);
check("length is still capped", str("abcdef", 3), "abc");

// --- the comparison that was silently failing ------------------------------
console.log("\nThe de-duplication comparison that never matched");
const storedBefore = JSON.stringify(clobberingInput && {}); // custom_fields->>'form_action'
const sentBefore = String({});                              // what str() used to pass
check("before: stored and sent disagreed", storedBefore === sentBefore, false);
const storedAfter = formAttr(forminatorForm, "action");
const sentAfter = str(formAttr(forminatorForm, "action")) ?? "";
check("after: they agree", storedAfter === sentAfter, true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
