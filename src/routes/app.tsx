import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/leadlogr/app-sidebar";
import { useAccount } from "@/lib/account-context";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { accountType, isAgencyViewing, viewingClientId, clientWorkspaces, ownWorkspace } = useAccount();
  const navigate = useNavigate();

  // Agencies that aren't currently inside a client workspace get bounced to /agency.
  useEffect(() => {
    if (accountType === "agency" && !isAgencyViewing) {
      navigate({ to: "/agency", replace: true });
    }
  }, [accountType, isAgencyViewing, navigate]);

  const workspaceName = isAgencyViewing
    ? clientWorkspaces.find((c) => c.id === viewingClientId)?.name ?? "Client"
    : ownWorkspace.name;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        <div className="h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Workspace · {workspaceName}
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">All systems synced</span>
          </div>
        </div>
        <div className="p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
