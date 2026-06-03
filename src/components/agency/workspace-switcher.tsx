import { useNavigate } from "@tanstack/react-router";
import { Briefcase, Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { useAccount } from "@/lib/account-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Sidebar dropdown for agency accounts. Lets the agency switch between
 * client workspaces or return to the main agency dashboard.
 * Renders nothing for standard accounts.
 */
export function WorkspaceSwitcher() {
  const {
    accountType,
    clientWorkspaces,
    viewingClientId,
    enterClient,
    exitClient,
  } = useAccount();
  const navigate = useNavigate();

  if (accountType !== "agency") return null;

  const current = viewingClientId
    ? clientWorkspaces.find((c) => c.id === viewingClientId)
    : null;

  const goToAgency = () => {
    exitClient();
    navigate({ to: "/agency" });
  };

  const goToClient = (id: string) => {
    enterClient(id);
    navigate({ to: "/app/dashboard" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md ring-1 ring-sidebar-border bg-sidebar hover:bg-muted/60 transition-colors text-left"
        >
          <div className="size-8 rounded-full bg-muted ring-1 ring-border flex items-center justify-center shrink-0">
            {current ? (
              <span className="text-xs font-semibold">
                {current.name.slice(0, 1)}
              </span>
            ) : (
              <Briefcase className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {current ? "Viewing client" : "Agency"}
            </div>
            <div className="text-sm font-medium truncate">
              {current ? current.name : "All clients"}
            </div>
          </div>
          <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Agency
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={goToAgency} className="gap-2">
          <LayoutGrid className="size-4" />
          <span className="flex-1">Agency dashboard</span>
          {!current && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Client workspaces
        </DropdownMenuLabel>
        {clientWorkspaces.map((c) => {
          const disabled = !c.agencyAccess;
          const active = current?.id === c.id;
          return (
            <DropdownMenuItem
              key={c.id}
              disabled={disabled}
              onClick={() => goToClient(c.id)}
              className="gap-2"
            >
              <span className="size-5 rounded bg-muted ring-1 ring-border flex items-center justify-center text-[10px] font-semibold">
                {c.name.slice(0, 1)}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
              {active && <Check className="size-4" />}
            </DropdownMenuItem>
          );
        })}
        {clientWorkspaces.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No clients yet.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
