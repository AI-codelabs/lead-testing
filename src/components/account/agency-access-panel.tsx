import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ACCESS_LEVEL_META, useAccount, type AccessLevel } from "@/lib/account-context";
import {
  sendAgencyInvite,
  listSentInvites,
  revokeInvite,
} from "@/lib/agency-invites.functions";

const LEVELS: AccessLevel[] = ["full", "names_only", "metrics_only"];

export function AgencyAccessPanel() {
  const { ownWorkspace, setInvitedAgencyEmail, setGrantedAccess } = useAccount();
  const [email, setEmail] = useState("");
  const qc = useQueryClient();

  const sendFn = useServerFn(sendAgencyInvite);
  const listFn = useServerFn(listSentInvites);
  const revokeFn = useServerFn(revokeInvite);

  const { data: invitesData } = useQuery({
    queryKey: ["sent-agency-invites"],
    queryFn: () => listFn(),
  });

  const pendingInvite = invitesData?.invites?.find(
    (i: any) => i.status === "pending" || i.status === "accepted",
  );

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          agencyEmail: email.trim(),
          accessLevel: ownWorkspace.grantedAccess,
        },
      }),
    onSuccess: (res) => {
      setInvitedAgencyEmail(email.trim());
      setEmail("");
      toast.success(
        res.matched
          ? "Invite sent — agency account found, it'll appear in their dashboard."
          : "Invite sent — we emailed them a signup link.",
      );
      qc.invalidateQueries({ queryKey: ["sent-agency-invites"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      setInvitedAgencyEmail(null);
      toast.success("Invite revoked.");
      qc.invalidateQueries({ queryKey: ["sent-agency-invites"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke"),
  });

  const handleInvite = () => {
    if (!email.trim()) return;
    send.mutate();
  };

  const invited = pendingInvite?.agency_email ?? ownWorkspace.invitedAgencyEmail;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invite an agency to access this workspace. You stay the owner — you choose how much they can see.
      </p>

      {invited ? (
        <div className="flex items-center justify-between bg-muted/40 ring-1 ring-border rounded-md px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{invited}</span>
            <span className="text-xs text-muted-foreground">
              · {ACCESS_LEVEL_META[ownWorkspace.grantedAccess].label}
              {pendingInvite ? ` · ${pendingInvite.status}` : null}
            </span>
          </div>
          <button
            onClick={() => {
              if (pendingInvite) revoke.mutate(pendingInvite.id);
              else setInvitedAgencyEmail(null);
            }}
            disabled={revoke.isPending}
            className="text-xs font-medium text-destructive hover:bg-destructive/10 rounded px-2 py-1 flex items-center gap-1 disabled:opacity-50"
          >
            <Trash2 className="size-3" />
            Revoke
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="agency@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 bg-card ring-1 ring-border rounded-md text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleInvite}
            disabled={send.isPending}
            className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {send.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Permission level
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {LEVELS.map((lvl) => {
            const active = ownWorkspace.grantedAccess === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setGrantedAccess(lvl)}
                aria-pressed={active}
                className={`text-left rounded-md p-3 ring-1 transition-colors ${
                  active ? "ring-foreground bg-muted" : "ring-border bg-card hover:bg-muted/60"
                }`}
              >
                <div className="text-sm font-semibold">{ACCESS_LEVEL_META[lvl].label}</div>
                <p className="text-xs text-muted-foreground mt-1">{ACCESS_LEVEL_META[lvl].hint}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
