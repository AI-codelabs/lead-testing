import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/leadlogr/page-header";
import { listInviteStatuses } from "@/lib/agency-invite-status.functions";
import { revokeInvite } from "@/lib/agency-invites.functions";

export const Route = createFileRoute("/agency/invites")({
  head: () => ({ meta: [{ title: "Invite status — Leadlogr Agency" }] }),
  component: InvitesPage,
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900 ring-amber-200",
    accepted: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    revoked: "bg-muted text-muted-foreground ring-border",
    expired: "bg-muted text-muted-foreground ring-border",
  };
  return map[status] ?? "bg-muted text-muted-foreground ring-border";
}

function emailBadge(status: string | null) {
  if (!status) return "bg-muted text-muted-foreground ring-border";
  const map: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    pending: "bg-amber-100 text-amber-900 ring-amber-200",
    dlq: "bg-red-100 text-red-900 ring-red-200",
    failed: "bg-red-100 text-red-900 ring-red-200",
    bounced: "bg-red-100 text-red-900 ring-red-200",
    suppressed: "bg-orange-100 text-orange-900 ring-orange-200",
    complained: "bg-orange-100 text-orange-900 ring-orange-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground ring-border";
}

function InvitesPage() {
  const listFn = useServerFn(listInviteStatuses);
  const revokeFn = useServerFn(revokeInvite);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["agency-invite-statuses"],
    queryFn: () => listFn(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["agency-invite-statuses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke"),
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/signup?clientInvite=${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Signup link copied"),
      () => toast.error("Could not copy link"),
    );
  };

  const invites = data?.invites ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Invite status"
        description="Every invite you've sent, with delivery status of the email and whether the recipient has accepted."
      />

      <div className="flex justify-end mb-3">
        <button
          onClick={() => refetch()}
          className="text-xs font-medium px-3 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="bg-card ring-1 ring-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Invite</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Sent</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-red-600">
                {error instanceof Error ? error.message : "Failed to load"}
              </td></tr>
            )}
            {!isLoading && invites.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                You haven't sent any invites yet.
              </td></tr>
            )}
            {invites.map((i: any) => (
              <tr key={i.id} className="border-b border-border last:border-0 align-top">
                <td className="px-5 py-3.5">
                  <div className="font-medium">{i.agency_email}</div>
                  {i.inviter_workspace_name && (
                    <div className="text-xs text-muted-foreground">{i.inviter_workspace_name}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">
                  {i.kind === "client_invite" ? "Client signup" : "Agency link"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${statusBadge(i.status)}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded ring-1 ${emailBadge(i.email_status)}`}>
                    {i.email_status ?? "no log"}
                  </span>
                  {i.email_error && (
                    <div className="text-[11px] text-red-600 mt-1 max-w-xs break-words">{i.email_error}</div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {new Date(i.created_at).toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap">
                  {i.kind === "client_invite" && i.status === "pending" && (
                    <button
                      onClick={() => copyLink(i.token)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors mr-2"
                    >
                      Copy link
                    </button>
                  )}
                  {i.status === "pending" && (
                    <button
                      onClick={() => revoke.mutate(i.id)}
                      disabled={revoke.isPending}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md ring-1 ring-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
