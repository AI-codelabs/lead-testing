import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "./logo";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Plug,
  Settings,
  LogOut,
  Send,
  BarChart3,
} from "lucide-react";
import { useAccount } from "@/lib/account-context";
import { WorkspaceSwitcher } from "@/components/agency/workspace-switcher";
import { OrganizationSwitcher } from "@/components/leadlogr/organization-switcher";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversionUploads } from "@/lib/integrations.functions";

const primaryNav = [
  { to: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/app/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/app/signals", label: "Signal log", icon: Send, badge: "failed" as const },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/integrations", label: "Integrations", icon: Plug },
] as const;

const secondaryNav = [
  { to: "/app/crm", label: "CRM", icon: Users },
  { to: "/app/account", label: "Account", icon: Settings },
] as const;

export function AppSidebar() {
  const { accountType, isAgencyViewing, ownWorkspace, activeWorkspace, signOut } = useAccount();
  const navigate = useNavigate();
  const isAgency = accountType === "agency";
  const listUploads = useServerFn(listConversionUploads);

  const failedQuery = useQuery({
    queryKey: ["signal-failed-count", activeWorkspace.key],
    enabled: !!activeWorkspace.key,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await listUploads({
        data: { organizationId: activeWorkspace.key, limit: 100 },
      });
      return res.uploads.filter((u) => u.status === "failed").length;
    },
  });
  const failedCount = failedQuery.data ?? 0;

  const secondary = isAgencyViewing
    ? secondaryNav.filter((n) => n.to !== "/app/account")
    : secondaryNav;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  const linkClass =
    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors";

  return (
    <aside className="w-[248px] shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col sticky top-[var(--agency-bar-height,0px)] h-[calc(100dvh-var(--agency-bar-height,0px))]">
      <div className="h-16 px-4 flex items-center border-b border-sidebar-border">
        <Logo to="/app/dashboard" onDark />
      </div>

      <div className="px-3 pt-3">
        <div className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
            {isAgencyViewing ? "Client workspace" : "Workspace"}
          </div>
          <div className="text-sm font-bold text-white truncate mt-0.5">
            {isAgencyViewing ? activeWorkspace.name : ownWorkspace.name || "Workspace"}
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {primaryNav.map(({ to, label, icon: Icon, ...rest }) => (
          <Link
            key={to}
            to={to}
            activeProps={{ className: "bg-white/12 text-white" }}
            inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
            className={linkClass}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {"badge" in rest && failedCount > 0 ? (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#c4462f] text-[11px] font-bold text-white grid place-items-center">
                {failedCount}
              </span>
            ) : null}
          </Link>
        ))}

        <div className="pt-3 mt-2 border-t border-white/10 space-y-0.5">
          {secondary.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeProps={{ className: "bg-white/12 text-white" }}
              inactiveProps={{ className: "text-white/65 hover:bg-white/8 hover:text-white" }}
              className={linkClass}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="shrink-0 p-3 border-t border-sidebar-border space-y-1">
        {isAgency && <WorkspaceSwitcher />}
        <OrganizationSwitcher />
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={`${linkClass} w-full text-white/65 hover:bg-white/8 hover:text-white`}
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
