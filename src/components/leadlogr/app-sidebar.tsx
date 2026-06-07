import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "./logo";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Plug,
  Settings,
  LogOut,
} from "lucide-react";
import { useAccount } from "@/lib/account-context";
import { WorkspaceSwitcher } from "@/components/agency/workspace-switcher";

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
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0">
      <div className="h-16 px-5 flex items-center border-b border-sidebar-border">
        <Logo to="/app/dashboard" />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
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
      <div className="p-3 border-t border-sidebar-border">
        {isAgency ? (
          <WorkspaceSwitcher />
        ) : (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="size-8 rounded-full bg-muted ring-1 ring-border" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{ownWorkspace.ownerName}</div>
              <div className="text-xs text-muted-foreground truncate">{ownWorkspace.name}</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
