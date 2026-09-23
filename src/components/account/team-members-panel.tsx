import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Copy, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { inviteOrganizationMember, listOrganizationMembers, removeOrganizationMember } from "@/lib/organization-members.functions";
import { listManagingAgencies, type AccessLevel } from "@/lib/agency-clients.functions";
import { inviteSignupUrl } from "@/lib/invite-links";
import { useAccount } from "@/lib/account-context";
import { EmptyState } from "@/components/leadlogr/empty-state";

/**
 * Teammates for the active workspace.
 *
 * Shared by the agency section and the standard account page. Membership was
 * never actually an agency feature — the underlying functions only ever take
 * an organization id and check the caller's role — but the UI only existed
 * under /agency, so an ordinary company had no way to add anyone.
 */
export function TeamMembersPanel() {
  const { activeOrganizationId } = useAccount();
  const qc = useQueryClient();
  const listFn = useServerFn(listOrganizationMembers);
  const inviteFn = useServerFn(inviteOrganizationMember);
  const removeFn = useServerFn(removeOrganizationMember);
  const agenciesFn = useServerFn(listManagingAgencies);
  const [email, setEmail] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["org-members", activeOrganizationId],
    queryFn: () => listFn({ data: { organizationId: activeOrganizationId } }),
    enabled: !!activeOrganizationId,
  });

  // An agency managing this workspace can read its leads, so it belongs in the
  // same list as the people who can — not hidden behind the invite that
  // created the relationship.
  const { data: agencyData } = useQuery({
    queryKey: ["managing-agencies", activeOrganizationId],
    queryFn: () => agenciesFn({ data: { organizationId: activeOrganizationId } }),
    enabled: !!activeOrganizationId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["org-members"] });
    void qc.invalidateQueries({ queryKey: ["agency-sent-invites"] });
    void qc.invalidateQueries({ queryKey: ["managing-agencies"] });
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(inviteSignupUrl(token, "member")).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy link"),
    );
  };

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({ data: { organizationId: activeOrganizationId, email: email.trim() } }),
    onSuccess: (res) => {
      setEmail("");
      // Nothing is emailed yet, so hand over the link rather than implying it was.
      if (res?.link) {
        navigator.clipboard?.writeText(res.link).catch(() => {});
        toast.success("Invite created — link copied to your clipboard.");
      } else {
        toast.success("Invite created.");
      }
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Teammate removed");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove teammate"),
  });

  const members = data?.members ?? [];
  const pending = data?.pendingInvites ?? [];
  const agencies = agencyData?.agencies ?? [];
  const canSubmit = email.trim().includes("@") && !invite.isPending;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) invite.mutate();
        }}
      >
        <input
          type="email"
          value={email}
          placeholder="teammate@company.com"
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <UserPlus className="size-4" />
          {invite.isPending ? "Inviting…" : "Invite teammate"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading team…</p>
      ) : members.length === 0 && pending.length === 0 && agencies.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Users}
          title="Just you so far"
          description="Invite colleagues to share this workspace's leads, pipeline and integrations."
        />
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2.5">Member</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{m.name || m.email}</div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="px-4 py-2.5 capitalize">{m.role}</td>
                  <td className="px-4 py-2.5 text-right">
                    {/* The owner cannot be removed — enforced in app.remove_member too. */}
                    {m.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(m.id)}
                        disabled={remove.isPending}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="size-3" /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {agencies.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted ring-1 ring-border">
                        <Building2 className="size-3.5 text-muted-foreground" />
                      </span>
                      <div>
                        <div className="font-medium">{a.name || "Agency"}</div>
                        <div className="text-xs text-muted-foreground">
                          {ACCESS_LABELS[a.accessLevel] ?? a.accessLevel}
                          {a.linkedAt ? ` · since ${formatLinkedAt(a.linkedAt)}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-border text-muted-foreground">
                      Agency
                    </span>
                  </td>
                  {/* Removing an agency is the agency's own action: the RLS
                      policy on agency_clients only lets its owners and admins
                      delete the link. */}
                  <td className="px-4 py-2.5" />
                </tr>
              ))}
              {pending.map((p) => (
                <tr key={p.id} className="border-b border-border bg-muted/20 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.email}</div>
                    <div className="text-xs text-muted-foreground">Invitation pending</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">Invited</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => copyLink(p.id)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ring-1 ring-border hover:bg-muted"
                    >
                      <Copy className="size-3" /> Copy link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ACCESS_LABELS: Record<AccessLevel, string> = {
  full: "Full access to this workspace",
  read_only: "Read-only access to this workspace",
};

function formatLinkedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
