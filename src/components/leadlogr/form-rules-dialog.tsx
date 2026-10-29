import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const MODES: Array<{ value: FormCaptureMode; label: string; hint: string }> = [
  { value: "collect", label: "Collect", hint: "Counts as a lead" },
  {
    value: "hide",
    label: "Hidden",
    hint: "Kept, but out of the pipeline, dashboard and ad platforms",
  },
  { value: "block", label: "Never collect", hint: "Not stored at all" },
];

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
          ? `${MODES.find((m) => m.value === mode)?.label} — ${r.affected} existing lead${r.affected === 1 ? "" : "s"} updated`
          : (MODES.find((m) => m.value === mode)?.label ?? "Saved"),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {form.label || form.pagePath || form.formAction || "Unknown form"}
            </span>
            {form.unreviewed && form.leads > 0 && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-stage-amber-soft text-stage-amber-ink ring-1 ring-stage-amber-line">
                New
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {form.pagePath || "—"}
            {form.formAction ? ` · ${form.formAction.replace(/^https?:\/\/[^/]+/, "")}` : ""}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {form.leads} lead{form.leads === 1 ? "" : "s"}
            {form.hidden > 0 ? ` · ${form.hidden} hidden` : ""}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1 rounded-md ring-1 ring-border bg-card p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => choose(m.value)}
              disabled={busy}
              title={m.hint}
              className={`text-xs font-medium px-2.5 py-1.5 rounded transition-colors disabled:opacity-50 ${
                form.mode === m.value
                  ? m.value === "collect"
                    ? "bg-stage-green-soft text-stage-green-ink"
                    : m.value === "hide"
                      ? "bg-stage-amber-soft text-stage-amber-ink"
                      : "bg-stage-red-soft text-stage-red-ink"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
          <strong className="text-foreground">Hidden</strong> keeps the leads and can be undone —
          turn a form back on and its history returns.{" "}
          <strong className="text-foreground">Never collect</strong> stops them being stored at all,
          for forms whose contents should not be kept. It cannot bring back what was not saved.
        </p>
      </DialogContent>
    </Dialog>
  );
}
