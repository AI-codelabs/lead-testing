import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAccount, ACCESS_LEVEL_META } from "@/lib/account-context";

/** Read by the sidebars so they can subtract this bar from their own height. */
const BAR_HEIGHT_VAR = "--agency-bar-height";

export function AgencyBar() {
  const { isAgencyViewing, viewingClientId, clientWorkspaces, exitClient, effectiveAccess } =
    useAccount();
  const ref = useRef<HTMLDivElement>(null);

  const ws = clientWorkspaces.find((c) => c.id === viewingClientId);
  const visible = isAgencyViewing && !!ws;

  // Publish the bar's real height rather than hardcoding one: the text wraps to
  // two lines on narrow viewports, and a stale constant would leave the
  // sidebar's footer clipped exactly as it was before this existed.
  useEffect(() => {
    const root = document.documentElement;

    if (!visible) {
      root.style.setProperty(BAR_HEIGHT_VAR, "0px");
      return;
    }

    const measure = () => {
      const height = ref.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty(BAR_HEIGHT_VAR, `${Math.round(height)}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);

    return () => {
      observer.disconnect();
      root.style.setProperty(BAR_HEIGHT_VAR, "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    // Sticky so the impersonation banner stays visible while scrolling, and so
    // the sidebar's offset below it never drifts.
    <div
      ref={ref}
      className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-foreground px-6 py-2 text-xs text-background"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Eye className="size-3.5 shrink-0" />
        <span className="font-medium">Viewing as agency</span>
        <span className="opacity-50">·</span>
        <span className="truncate font-semibold">{ws.name}</span>
        <span className="opacity-50">·</span>
        <span className="truncate opacity-70">{ACCESS_LEVEL_META[effectiveAccess].label}</span>
      </div>
      <Link
        to="/agency"
        onClick={exitClient}
        className="flex shrink-0 items-center gap-1.5 font-medium transition-opacity hover:opacity-80"
      >
        <ArrowLeft className="size-3.5" />
        Back to agency overview
      </Link>
    </div>
  );
}
