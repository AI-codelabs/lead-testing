import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutGrid, Mail, Settings, Percent, Palette } from "lucide-react";
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

const linkClass =
  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors";

function AgencyLayout() {
  const pageWidth = usePageWidth();
  const { accountType, workspaceReady, authReady, isAuthenticated, ownWorkspace } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
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
      <aside className="w-[248px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col sticky top-[var(--agency-bar-height,0px)] h-[calc(100dvh-var(--agency-bar-height,0px))]">
        <div className="h-16 px-4 flex items-center border-b border-sidebar-border">
          <Logo to="/agency" onDark />
        </div>
        <div className="px-3 pt-3">
          <div className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Agency
            </div>
            <div className="text-sm font-bold text-white truncate mt-0.5">
              {ownWorkspace.name || "Agency"}
            </div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          <Link
            to="/agency"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-white/12 text-white" }}
            inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
            className={linkClass}
          >
            <LayoutGrid className="size-4" />
            Clients
          </Link>
          <Link
            to="/agency/commission"
            activeProps={{ className: "bg-white/12 text-white" }}
            inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
            className={linkClass}
          >
            <Percent className="size-4" />
            Commission
          </Link>
          <Link
            to="/agency/invites"
            activeProps={{ className: "bg-white/12 text-white" }}
            inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
            className={linkClass}
          >
            <Mail className="size-4" />
            Invite and referral
          </Link>
          <Link
            to="/agency/white-label"
            activeProps={{ className: "bg-white/12 text-white" }}
            inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
            className={linkClass}
          >
            <Palette className="size-4" />
            White label
          </Link>
          <div className="pt-3 mt-2 border-t border-white/10">
            <Link
              to="/agency/account"
              activeProps={{ className: "bg-white/12 text-white" }}
              inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
              className={linkClass}
            >
              <Settings className="size-4" />
              Account
            </Link>
          </div>
        </nav>
        <div className="shrink-0 p-3 border-t border-sidebar-border space-y-2">
          <WorkspaceSwitcher />
          <OrganizationSwitcher />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <PageContainer width={pageWidth}>
          <Outlet />
        </PageContainer>
      </main>
    </div>
  );
}
