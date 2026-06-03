import { Briefcase, Building2 } from "lucide-react";
import { useAccount, type AccountType } from "@/lib/account-context";

const TYPES: { value: AccountType; label: string; hint: string; icon: typeof Briefcase }[] = [
  {
    value: "standard",
    label: "Standard account",
    hint: "Owns a single workspace. Full operational features (Pipeline, CRM, Integrations).",
    icon: Building2,
  },
  {
    value: "agency",
    label: "Agency account",
    hint: "Manages multiple client workspaces from one overview. Switches into clients as needed.",
    icon: Briefcase,
  },
];

export function AccountTypePanel() {
  const { accountType, setAccountType } = useAccount();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {TYPES.map(({ value, label, hint, icon: Icon }) => {
        const active = accountType === value;
        return (
          <button
            key={value}
            onClick={() => setAccountType(value)}
            aria-pressed={active}
            className={`text-left rounded-md p-3 ring-1 transition-colors ${
              active ? "ring-foreground bg-muted" : "ring-border bg-card hover:bg-muted/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4" />
              <span className="text-sm font-semibold">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          </button>
        );
      })}
    </div>
  );
}
