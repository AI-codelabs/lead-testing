import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/leadlogr/app-sidebar";
import { useAccount } from "@/lib/account-context";
import { PageContainer } from "@/components/leadlogr/page-container";
import { usePageWidth } from "@/lib/page-width";


export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const pageWidth = usePageWidth();
  const {
    accountType, isAgencyViewing, workspaceReady,
    authReady,
    isAuthenticated,
  } = useAccount();
  const navigate = useNavigate();

  // Agencies that aren't currently inside a client workspace get bounced to
  // /agency — but only once the active organization has actually been resolved.
  // accountType is restored from localStorage on mount, so acting on it before
  // then redirects using a value the server has not confirmed, and a user whose
  // account type has changed gets bounced to the wrong section.
  useEffect(() => {
    // See agency.tsx: a signed-out user must land on /login, not be shuffled
    // between authenticated sections by a stale account type.
    if (authReady && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!workspaceReady) return;
    if (accountType === "agency" && !isAgencyViewing) {
      navigate({ to: "/agency", replace: true });
    }
  }, [authReady, isAuthenticated, workspaceReady, accountType, isAgencyViewing, navigate]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="flex-1 min-w-0">
        <PageContainer width={pageWidth}>
          <Outlet />
        </PageContainer>
      </main>
    </div>
  );
}
