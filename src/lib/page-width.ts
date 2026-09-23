import { useMatches } from "@tanstack/react-router";
import type { PageWidth } from "@/components/leadlogr/page-container";

/**
 * Lets a route choose how wide its shell is, while the shell itself stays in
 * the layout.
 *
 * A route declares `staticData: { width: "full" }` and the layout reads it.
 * Keeping PageContainer in the layout means routes never render their own
 * padding — which is what previously caused screens to drift apart — but a
 * 10-column table and a settings form still shouldn't get identical room.
 */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    width?: PageWidth;
  }
}

/** The deepest matched route that expresses a preference wins. */
export function usePageWidth(fallback: PageWidth = "wide"): PageWidth {
  const matches = useMatches();

  for (let i = matches.length - 1; i >= 0; i--) {
    const width = matches[i].staticData?.width;
    if (width) return width;
  }

  return fallback;
}
