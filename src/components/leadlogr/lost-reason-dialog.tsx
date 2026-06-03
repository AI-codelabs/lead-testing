import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DEFAULT_LOSS_REASONS, type LossReason } from "./lead-types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  onConfirm: (reason: string, note?: string) => void;
  onCancel?: () => void;
}

export function LostReasonDialog({ open, onOpenChange, leadName, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState<LossReason>(DEFAULT_LOSS_REASONS[0]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason(DEFAULT_LOSS_REASONS[0]);
      setNote("");
    }
  }, [open]);

  const cancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel?.();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Lost</DialogTitle>
          <DialogDescription>
            Capture why {leadName || "this lead"} didn't convert. This helps spot patterns and
            improves ad-platform signal quality.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {DEFAULT_LOSS_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`text-left text-sm px-3 py-2 rounded-md ring-1 transition-colors ${
                    reason === r
                      ? "bg-primary/10 ring-primary text-foreground"
                      : "bg-card ring-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loss-note">Note (optional)</Label>
            <Textarea
              id="loss-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for your team…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(reason, note.trim() || undefined);
              onOpenChange(false);
            }}
          >
            Mark as Lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
