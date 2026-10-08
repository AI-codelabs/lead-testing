import type { ReactNode } from "react";

/**
 * `tone` governs the eyebrow and description only.
 *
 * `strong` darkens them for pages that put something behind the header — a
 * background image costs contrast, and `muted` has little to spare. The title
 * is already `foreground` and needs no help.
 */
export type PageHeaderTone = "muted" | "strong";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  tone = "muted",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: PageHeaderTone;
}) {
  const secondary =
    tone === "strong" ? "text-muted-foreground-strong" : "text-muted-foreground";

  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <span className={`text-[10px] font-semibold tracking-widest uppercase ${secondary}`}>
            {eyebrow}
          </span>
        )}
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{title}</h1>
        {description && (
          <p className={`text-sm mt-1 max-w-[60ch] ${secondary}`}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
