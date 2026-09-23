import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutGrid, Mail, Settings } from "lucide-react";
import { PageContainer } from "@/components/leadlogr/page-container";
import { usePageWidth } from "@/lib/page-width";
import { Logo } from "@/components/leadlogr/logo";
import { useAccount } from "@/lib/account-context";
import { WorkspaceSwitcher } from "@/components/agency/workspace-switcher";
import { OrganizationSwitcher } from "@/components/leadlogr/organization-switcher";

export const Route = createFileRoute("/agency")({
  ssr: false,
  component: AgencyLayout,
});

function AgencyLayout() {
  const pageWidth = usePageWidth();
  const { accountType, workspaceReady, authReady, isAuthenticated } = useAccount();
  const navigate = useNavigate();

  // Soft guard: non-agency workspaces belong in the main app.
  //
  // This runs in an effect rather than `throw redirect()` in the render body.
  // A thrown redirect here is caught by the route's error boundary instead of
  // being handled by the router, which surfaced as "This page didn't load".
  // The account type is also only known once the active organization has
  // resolved, so acting earlier redirects on an unconfirmed default.
  useEffect(() => {
    // Signing out clears the account type, which would otherwise read as
    // "not an agency" and bounce the user into the authenticated app shell
    // instead of the login page.
    if (authReady && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!workspaceReady) return;
    if (accountType !== "agency") {
      navigate({ to: "/app/account", replace: true });
    }
  }, [authReady, isAuthenticated, workspaceReady, accountType, navigate]);

  if (!isAuthenticated || !workspaceReady || accountType !== "agency") return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col sticky top-[var(--agency-bar-height,0px)] h-[calc(100dvh-var(--agency-bar-height,0px))]">
        <div className="h-16 px-5 flex items-center border-b border-sidebar-border">
          <Logo to="/agency" />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <Link
            to="/agency"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{
              className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <LayoutGrid className="size-4" />
            Clients overview
          </Link>
          <Link
            to="/agency/invites"
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{
              className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Mail className="size-4" />
            Invites
          </Link>
          <Link
            to="/agency/account"
            activeProps={{ className: "bg-muted text-foreground ring-1 ring-border" }}
            inactiveProps={{
              className: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Settings className="size-4" />
            Account
          </Link>
        </nav>
        <div className="shrink-0 p-3 border-t border-sidebar-border space-y-2">
          <WorkspaceSwitcher />
          <OrganizationSwitcher />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Agency · Overview
          </div>
        </div>
        <PageContainer width={pageWidth}>
          <Outlet />
        </PageContainer>
      </main>
    </div>
  );
}
