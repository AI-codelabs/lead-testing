import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { useAccount, ACCESS_LEVEL_META } from "@/lib/account-context";

export function AgencyBar() {
  const { isAgencyViewing, viewingClientId, clientWorkspaces, exitClient, effectiveAccess } = useAccount();
  if (!isAgencyViewing) return null;
  const ws = clientWorkspaces.find((c) => c.id === viewingClientId);
  if (!ws) return null;
  return (
    <div className="bg-foreground text-background px-6 py-2 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <Eye className="size-3.5" />
        <span className="font-medium">Viewing as agency</span>
        <span className="opacity-50">·</span>
        <span className="font-semibold">{ws.name}</span>
        <span className="opacity-50">·</span>
        <span className="opacity-70">{ACCESS_LEVEL_META[effectiveAccess].label}</span>
      </div>
      <Link
        to="/agency"
        onClick={exitClient}
        className="flex items-center gap-1.5 font-medium hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="size-3.5" />
        Back to agency overview
      </Link>
    </div>
  );
}
