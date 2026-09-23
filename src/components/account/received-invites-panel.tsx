import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { acceptInvite, declineInvite, listReceivedInvites } from "@/lib/invitations.functions";
import { EmptyState } from "@/components/leadlogr/empty-state";

/**
 * Invitations addressed to the signed-in user.
 *
 * Previously only the agency section could see these, so a client invited to
 * be managed by an agency had no way to act on it unless they still had the
 * original link — the invite existed but was unreachable from the product.
 */
export function ReceivedInvitesPanel() {
  const listFn = useServerFn(listReceivedInvites);
  const acceptFn = useServerFn(acceptInvite);
  const declineFn = useServerFn(declineInvite);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["received-invites"],
    queryFn: () => listFn({ data: {} }),
  });

  const invites = data?.invites ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["received-invites"] });
    void qc.invalidateQueries({ queryKey: ["agency-clients"] });
  };

  const accept = useMutation({
    mutationFn: (token: string) => acceptFn({ data: { token } }),
    onSuccess: () => {
      toast.success("Invite accepted");
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not accept the invite"),
  });

  const decline = useMutation({
    mutationFn: (id: string) => declineFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite declined");
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not decline the invite"),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Checking for invitations…</p>;
  }

  if (invites.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={Mail}
        title="No pending invitations"
        description="When an agency invites you to manage this workspace, it appears here."
      />
    );
  }

  const busy = accept.isPending || decline.isPending;

  return (
    <ul className="divide-y divide-border">
      {invites.map((invite) => (
        <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stage-blue-soft text-stage-blue-ink ring-1 ring-inset ring-stage-blue-line">
              <Building2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {invite.organization_name ?? "An agency"}
              </p>
              <p className="text-xs text-muted-foreground">
                {invite.kind === "client"
                  ? `Wants to manage your workspace · ${invite.role.replace("_", " ")} access`
                  : `Invited you to join as ${invite.role}`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decline.mutate(invite.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-50"
            >
              <X className="size-4" />
              Decline
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => accept.mutate(invite.token)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="size-4" />
              Accept
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
