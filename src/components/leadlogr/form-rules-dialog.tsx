import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  listForms,
  setFormRule,
  type DiscoveredForm,
  type FormCaptureMode,
} from "@/lib/form-rules.functions";

/**
 * Which forms on this site count as leads.
 *
 * Deliberately a list of forms we have actually seen rather than a pattern
 * someone types: nobody can reliably write a URL rule for a site they are not
 * looking at, and a rule that matches nothing fails silently.
 *
 * The three modes are not degrees of the same thing. "Hidden" keeps the lead
 * and is reversible — the day a recruiter advertises the vacancies form, they
 * turn it back on and the history is already there. "Never collect" exists for
 * forms whose contents should not be held at all, which in practice means a
 * payment form, and it cannot restore what it did not keep.
 */

/**
 * The tick is the whole interaction for the common case: on means collected,
 * off means it is not. The two ways of being off are genuinely different —
 * one keeps the leads and one never stores them — so they live behind the
 * menu rather than as a third state of a checkbox that could not express it.
 */
const MODE_LABEL: Record<FormCaptureMode, string> = {
  collect: "Collected",
  hide: "Not collected for now",
  block: "Never collected",
};

function Row({
  form,
  organizationId,
  onChanged,
}: {
  form: DiscoveredForm;
  organizationId: string;
  onChanged: () => void;
}) {
  const save = useServerFn(setFormRule);
  const [busy, setBusy] = useState(false);

  const choose = async (mode: FormCaptureMode) => {
    if (mode === form.mode || busy) return;
    setBusy(true);
    try {
      const r = await save({
        data: {
          organizationId,
          formAction: form.formAction,
          pagePath: form.pagePath,
          mode,
          label: form.label,
        },
      });
      onChanged();
      toast.success(
        r.affected > 0
          ? `${MODE_LABEL[mode]} — ${r.affected} existing lead${r.affected === 1 ? "" : "s"} updated`
          : MODE_LABEL[mode],
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const collected = form.mode === "collect";

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={collected}
          disabled={busy}
          // Unticking means "not collected for now": the reversible one, never
          // the one that throws the data away. That stays a deliberate choice
          // in the menu.
          onCheckedChange={(v) => choose(v === true ? "collect" : "hide")}
          className="mt-0.5"
          aria-label={`Collect leads from ${form.label || form.pagePath || "this form"}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium truncate ${collected ? "" : "text-muted-foreground"}`}
            >
              {form.label || form.pagePath || form.formAction || "Unknown form"}
            </span>
            {form.unreviewed && form.leads > 0 && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stage-amber-soft text-stage-amber-ink ring-1 ring-stage-amber-line">
                New
              </span>
            )}
            {form.mode === "block" && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stage-red-soft text-stage-red-ink ring-1 ring-stage-red-line">
                Never
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {form.pagePath || "—"}
            {form.formAction ? ` · ${form.formAction.replace(/^https?:\/\/[^/]+/, "")}` : ""}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {form.leads} lead{form.leads === 1 ? "" : "s"}
            {form.hidden > 0 ? ` · ${form.hidden} not shown` : ""}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={busy}
              aria-label="More options"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => void choose("collect")}>
              <div>
                <div className="text-sm">Collect</div>
                <div className="text-xs text-muted-foreground">Counts as a lead</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void choose("hide")}>
              <div>
                <div className="text-sm">Do not collect for now</div>
                <div className="text-xs text-muted-foreground">
                  Kept and reversible — turn it back on and the leads return
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void choose("block")}
              className="text-destructive focus:text-destructive"
            >
              <div>
                <div className="text-sm">Never collect</div>
                <div className="text-xs text-muted-foreground">
                  Not stored at all. Cannot bring back what was not saved
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function FormRulesDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}) {
  const list = useServerFn(listForms);
  const qc = useQueryClient();

  const { data: forms, isLoading } = useQuery({
    queryKey: ["discovered-forms", organizationId],
    queryFn: () => list({ data: { organizationId } }),
    enabled: open && !!organizationId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["discovered-forms", organizationId] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Which forms count as leads</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Every form we have seen on this site. A new one is collected until you say otherwise, so
          nothing is ever lost by default — switch off what is not a lead for this client.
        </p>

        <div className="mt-2 max-h-[55vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6">Loading…</p>
          ) : !forms || forms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              No forms seen yet. They appear here as soon as the first lead arrives.
            </p>
          ) : (
            forms.map((f) => (
              <Row
                key={`${f.formAction}|${f.pagePath}`}
                form={f}
                organizationId={organizationId}
                onChanged={refresh}
              />
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Unticking a form stops it counting, but keeps its leads — tick it again and they return.
          Use the <strong className="text-foreground">⋯</strong> menu for{" "}
          <strong className="text-foreground">Never collect</strong>, which does not store the form
          at all and cannot bring back what was not saved.
        </p>
      </DialogContent>
    </Dialog>
  );
}
