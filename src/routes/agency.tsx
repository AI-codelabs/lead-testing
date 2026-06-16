import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, LogOut, Mail, Settings } from "lucide-react";
import { Logo } from "@/components/leadlogr/logo";
import { useAccount } from "@/lib/account-context";
import { WorkspaceSwitcher } from "@/components/agency/workspace-switcher";

export const Route = createFileRoute("/agency")({
  ssr: false,
  component: AgencyLayout,
});

function AgencyLayout() {
  const { accountType, signOut } = useAccount();
  const navigate = useNavigate();

  // Soft guard: if not an agency, send them back to the app.
  if (accountType !== "agency") {
    if (typeof window !== "undefined") {
      throw redirect({ to: "/app/account" });
    }
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0">
        <div className="h-16 px-5 flex items-center border-b border-sidebar-border">
          <Logo to="/agency" />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <Link
            to="/agency"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground" }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <LayoutGrid className="size-4" />
            Clients overview
          </Link>
          <Link
            to="/agency/invites"
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground" }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Mail className="size-4" />
            Invites
          </Link>
          <Link
            to="/agency/account"
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground" }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Settings className="size-4" />
            Account
          </Link>
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <WorkspaceSwitcher />
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Agency · Overview
          </div>
        </div>
        <div className="p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
