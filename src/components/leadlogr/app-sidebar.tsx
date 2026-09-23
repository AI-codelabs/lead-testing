import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "./logo";
import { LayoutDashboard, KanbanSquare, Users, Plug, Settings, LogOut } from "lucide-react";
import { useAccount } from "@/lib/account-context";
import { WorkspaceSwitcher } from "@/components/agency/workspace-switcher";
import { OrganizationSwitcher } from "@/components/leadlogr/organization-switcher";

const nav = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/pipeline", label: "Lead Pipeline", icon: KanbanSquare },
  { to: "/app/crm", label: "CRM", icon: Users },
  { to: "/app/integrations", label: "Integrations", icon: Plug },
  { to: "/app/account", label: "Account", icon: Settings },
] as const;

export function AppSidebar() {
  const { accountType, isAgencyViewing, ownWorkspace, signOut } = useAccount();
  const navigate = useNavigate();
  const isAgency = accountType === "agency";
  // Agencies inside a client workspace cannot access the client's Account page.
  const visibleNav = isAgencyViewing ? nav.filter((n) => n.to !== "/app/account") : nav;
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };
  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col sticky top-[var(--agency-bar-height,0px)] h-[calc(100dvh-var(--agency-bar-height,0px))]">
      <div className="h-16 px-5 flex items-center border-b border-sidebar-border">
        <Logo to="/app/dashboard" />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleNav.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{
              className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
        {isAgency && <WorkspaceSwitcher />}
        <OrganizationSwitcher />
      </div>
    </aside>
  );
}
