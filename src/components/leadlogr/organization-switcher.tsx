import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Building2, Check, ChevronsUpDown, LogOut } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listMyOrganizations } from "@/lib/organization.functions";
import { switchOrganization } from "@/auth/session";
import { useAccount } from "@/lib/account-context";

/**
 * Switches between the organizations the signed-in user belongs to.
 *
 * Distinct from the agency WorkspaceSwitcher, which moves between an agency's
 * CLIENTS. Without this, someone who owns both an agency and their own
 * workspace could only ever reach whichever one login happened to resolve
 * first — the other was unreachable through the UI entirely.
 */
export function OrganizationSwitcher() {
  const listFn = useServerFn(listMyOrganizations);
  const { activeOrganizationId, ownWorkspace, signOut } = useAccount();
  const [switching, setSwitching] = useState<string | null>(null);

  const { data: organizations = [] } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listFn(),
  });

  const active = organizations.find((o) => o.organizationId === activeOrganizationId);

  const onSelect = async (organizationId: string) => {
    if (organizationId === activeOrganizationId) return;
    setSwitching(organizationId);
    try {
      await switchOrganization(organizationId);
    } catch {
      setSwitching(null);
    }
  };

  // Only one organization: show it as a plain label rather than a dead control.
  const isSwitchable = organizations.length > 1;

  const Icon = active?.accountType === "agency" ? Briefcase : Building2;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={!isSwitchable}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/60 disabled:pointer-events-none"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-border">
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {active?.name ?? ownWorkspace.name ?? "Workspace"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {active?.accountType === "agency" ? "Agency" : "Workspace"}
            </span>
          </span>
          {isSwitchable && <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Your workspaces
          </DropdownMenuLabel>
          {organizations.map((org) => {
            const isActive = org.organizationId === activeOrganizationId;
            const OrgIcon = org.accountType === "agency" ? Briefcase : Building2;
            return (
              <DropdownMenuItem
                key={org.organizationId}
                onSelect={() => void onSelect(org.organizationId)}
                disabled={switching !== null}
                className="gap-2.5"
              >
                <OrgIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{org.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {org.accountType === "agency" ? "Agency" : "Workspace"} · {org.role}
                  </span>
                </span>
                {isActive && <Check className="size-4 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()} className="gap-2.5">
            <LogOut className="size-4 text-muted-foreground" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isSwitchable && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 px-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      )}
    </div>
  );
}
