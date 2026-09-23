import { FileQuestion } from "lucide-react";
import type { FormAnswerValue } from "./lead-types";
import { EmptyState } from "./empty-state";

/**
 * Renders whatever a workspace's intake form submitted.
 *
 * There is deliberately no field list here. Every workspace asks different
 * questions, so the collector stores unrecognised fields verbatim and this
 * reflects them back — a new question on someone's form shows up without any
 * change to this code.
 */

/** `how_did_you_hear` / `howDidYouHear` / `how-did-you-hear` -> "How did you hear". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const isEmpty = (v: FormAnswerValue): boolean =>
  v === null ||
  v === undefined ||
  (typeof v === "string" && v.trim() === "") ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

function AnswerValue({ value }: { value: FormAnswerValue }) {
  if (isEmpty(value)) {
    return <span className="text-sm text-muted-foreground italic">No answer</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={
          value
            ? "inline-flex items-center rounded-md bg-stage-green-soft px-2 py-0.5 text-xs font-medium text-stage-green-ink ring-1 ring-inset ring-stage-green-line"
            : "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
        }
      >
        {value ? "Yes" : "No"}
      </span>
    );
  }

  // Checkbox groups and multi-selects arrive as arrays.
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border"
          >
            {typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  }

  // Grouped fields (an address block, say) render as a nested definition list.
  // The explicit null check is for the type checker: `typeof null` is "object",
  // and it cannot see that isEmpty already ruled null out above.
  if (typeof value === "object" && value !== null) {
    return (
      <dl className="space-y-1 rounded-lg bg-muted/40 p-3 ring-1 ring-inset ring-border">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2 text-sm">
            <dt className="text-muted-foreground">{humanizeKey(k)}:</dt>
            <dd className="font-medium text-foreground">
              {isEmpty(v as FormAnswerValue) ? "—" : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const text = String(value);

  // A long free-text answer needs room to breathe and must wrap, not overflow.
  if (text.length > 120 || text.includes("\n")) {
    return (
      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm text-foreground ring-1 ring-inset ring-border">
        {text}
      </p>
    );
  }

  if (/^https?:\/\//i.test(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-sm font-medium text-foreground underline underline-offset-2 hover:opacity-80"
      >
        {text}
      </a>
    );
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return (
      <a
        href={`mailto:${text}`}
        className="break-all text-sm font-medium text-foreground underline underline-offset-2 hover:opacity-80"
      >
        {text}
      </a>
    );
  }

  return <span className="break-words text-sm font-medium text-foreground">{text}</span>;
}

export function FormAnswers({ answers }: { answers: Record<string, FormAnswerValue> }) {
  const entries = Object.entries(answers ?? {});

  if (entries.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={FileQuestion}
        title="No form answers"
        description="Any question this workspace's own form collects will appear here, exactly as it was submitted."
      />
    );
  }

  // Answered questions first: a long tail of blanks at the top buries the
  // answers that actually matter.
  const sorted = [...entries].sort(([, a], [, b]) => Number(isEmpty(a)) - Number(isEmpty(b)));

  return (
    <dl className="divide-y divide-border">
      {sorted.map(([key, value]) => (
        <div key={key} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
          <dt className="text-sm text-muted-foreground">{humanizeKey(key)}</dt>
          <dd className="min-w-0">
            <AnswerValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
