import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard document-page shell: PageContainer > PageHeader > panels.
 *
 * Split into an outer full-width element and an inner centred one so a page
 * can tint its whole width (status gradients, banners) without leaving white
 * gutters either side of the centred column on wide screens.
 */
/**
 * How much horizontal room a screen gets.
 *
 *   narrow — forms and settings. Long lines are harder to read, so these are
 *            deliberately tighter than the rest of the app.
 *   wide   — the default: dashboards, card grids, ordinary tables.
 *   full   — data-dense boards and wide tables (the CRM is 10 columns, the
 *            pipeline is a 6-column kanban). Uses the whole viewport with just
 *            enough gutter to not touch the edge.
 */
export type PageWidth = "narrow" | "wide" | "full";

const WIDTH: Record<PageWidth, string> = {
  narrow: "max-w-5xl px-4 md:px-8",
  wide: "max-w-7xl px-4 md:px-8",
  full: "max-w-none px-4 md:px-6",
};

export function PageContainer({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: PageWidth;
}) {
  return (
    <main className={cn("flex w-full flex-1 flex-col", className)}>
      <div className={cn("mx-auto flex w-full flex-1 flex-col py-8", WIDTH[width])}>
        {children}
      </div>
    </main>
  );
}

/**
 * The one panel recipe. Everything that holds a list, form or distinct group
 * of controls uses this, so surfaces never drift between screens.
 */
export function Panel({
  children,
  className,
  padding = "default",
}: {
  children: ReactNode;
  className?: string;
  /** `none` for panels whose child is a full-bleed table. */
  padding?: "default" | "tight" | "none";
}) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card shadow-xs ring-1 ring-border",
        padding === "default" && "p-4 sm:p-6",
        padding === "tight" && "p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Header row for a Panel that wraps a table or list. */
export function PanelHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
