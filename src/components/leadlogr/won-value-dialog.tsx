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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  currency: string;
  initialValue: number;
  onConfirm: (value: number) => void;
  onCancel?: () => void;
}

export function WonValueDialog({
  open,
  onOpenChange,
  leadName,
  currency,
  initialValue,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState<string>(initialValue > 0 ? String(initialValue) : "");

  useEffect(() => {
    if (open) setValue(initialValue > 0 ? String(initialValue) : "");
  }, [open, initialValue]);

  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric > 0;

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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as Won</DialogTitle>
          <DialogDescription>
            Enter the revenue for {leadName || "this lead"}. We'll send a "won" conversion event
            with this value to your connected ad platforms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="won-value">Revenue ({currency})</Label>
          <Input
            id="won-value"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) {
                onConfirm(numeric);
                onOpenChange(false);
              }
            }}
            placeholder="0.00"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onConfirm(numeric);
              onOpenChange(false);
            }}
          >
            Mark as Won
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
