import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dateAndTime } from "@/lib/lead-dates";
import {
  listDuplicateLeads,
  mergeDuplicateLeads,
  type DuplicateGroup,
} from "@/lib/duplicates.functions";

/**
 * One enquiry counted twice, shown rather than quietly tidied away.
 *
 * Double-counting distorts the only numbers this product exists to report, and
 * it is invisible from the board — two cards with the same name look like two
 * people having a busy morning. The last round went unnoticed until a partner
 * filmed his screen, so the point of this dialog is that nobody has to.
 */

function Group({ g }: { g: DuplicateGroup }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stage-amber-soft text-stage-amber-ink ring-1 ring-stage-amber-line">
          {g.copies}×
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{g.who}</div>
          <div className="text-xs text-muted-foreground truncate">{g.pagePath}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {dateAndTime(g.firstSeen)} — {dateAndTime(g.lastSeen)}
          </div>
          {!g.safeToMerge && (
            <div className="text-[11px] text-muted-foreground mt-1">
              Left alone: these have been worked on, so merging them would throw that away.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DuplicatesDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}) {
  const list = useServerFn(listDuplicateLeads);
  const merge = useServerFn(mergeDuplicateLeads);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: groups, isLoading } = useQuery({
    queryKey: ["duplicate-leads", organizationId],
    queryFn: () => list({ data: { organizationId } }),
    enabled: open && !!organizationId,
  });

  const mergeable = (groups ?? []).filter((g) => g.safeToMerge);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await merge({ data: { organizationId } });
      void qc.invalidateQueries({ queryKey: ["duplicate-leads", organizationId] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        r.merged === 0
          ? "Nothing left to merge"
          : `${r.merged} enquir${r.merged === 1 ? "y" : "ies"} merged, ${r.removed} duplicate${r.removed === 1 ? "" : "s"} removed`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not merge");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enquiries counted more than once</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The same person, the same page, the same visit, recorded more than once — usually a form
          that submitted itself twice while a field reformatted. Merging keeps the earliest lead and
          folds the fullest answers into it.
        </p>

        <div className="mt-2 max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6">Loading…</p>
          ) : !groups || groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              Nothing double-counted. This is checked every time you open the pipeline.
            </p>
          ) : (
            groups.map((g) => <Group key={g.keepId} g={g} />)
          )}
        </div>

        {mergeable.length > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {mergeable.length} can be merged. Nothing else is touched.
            </p>
            <button
              onClick={() => void run()}
              disabled={busy}
              className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? "Merging…" : `Merge ${mergeable.length}`}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
