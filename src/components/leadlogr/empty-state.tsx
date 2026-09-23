import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * First-run and no-results state.
 *
 * shadcn/ui ships no equivalent, so this fills the gap using the app's own
 * tokens rather than introducing a second component kit. A lone muted
 * sentence in a table cell reads as a rendering failure; a featured icon plus
 * a next action reads as a deliberate state.
 */

type Size = "sm" | "md";

const ICON_BOX: Record<Size, string> = {
  sm: "size-10 rounded-lg",
  md: "size-12 rounded-xl",
};

const ICON: Record<Size, string> = {
  sm: "size-5",
  md: "size-6",
};

export type FeaturedIconColor = "gray" | "brand" | "success" | "warning" | "error";

// Soft fill + ink pair per tone, reusing the stage tokens already defined in
// styles.css so a featured icon can never drift from the badge palette.
const TONE: Record<FeaturedIconColor, string> = {
  gray: "bg-muted text-muted-foreground ring-border",
  brand: "bg-stage-blue-soft text-stage-blue-ink ring-stage-blue-line",
  success: "bg-stage-green-soft text-stage-green-ink ring-stage-green-line",
  warning: "bg-stage-amber-soft text-stage-amber-ink ring-stage-amber-line",
  error: "bg-stage-red-soft text-stage-red-ink ring-stage-red-line",
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  color = "gray",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: Size;
  color?: FeaturedIconColor;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "px-6 py-14" : "px-4 py-10",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center ring-1 ring-inset",
          ICON_BOX[size],
          TONE[color],
        )}
      >
        <Icon className={ICON[size]} />
      </div>

      <p className={cn("font-semibold text-foreground", size === "md" ? "mt-4 text-base" : "mt-3 text-sm")}>
        {title}
      </p>

      {description && (
        <p className="mt-1 max-w-[46ch] text-sm text-muted-foreground">{description}</p>
      )}

      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * The same state inside a table, spanning every column.
 *
 * Keeps the table's own borders intact instead of collapsing the layout, which
 * is what a bare <td> with centred text tends to do once the table is empty.
 */
export function TableEmptyState({
  colSpan,
  ...props
}: { colSpan: number } & Parameters<typeof EmptyState>[0]) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState size="sm" {...props} />
      </td>
    </tr>
  );
}
