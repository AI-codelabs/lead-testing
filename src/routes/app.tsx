import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/leadlogr/app-sidebar";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        <div className="h-16 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-8">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Workspace · Acme Media
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
