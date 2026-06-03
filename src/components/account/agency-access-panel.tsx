import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { ACCESS_LEVEL_META, useAccount, type AccessLevel } from "@/lib/account-context";

const LEVELS: AccessLevel[] = ["full", "names_only", "metrics_only"];

export function AgencyAccessPanel() {
  const { ownWorkspace, setInvitedAgencyEmail, setGrantedAccess } = useAccount();
  const [email, setEmail] = useState("");

  const handleInvite = () => {
    const v = email.trim();
    if (!v) return;
    setInvitedAgencyEmail(v);
    setEmail("");
  };

  const invited = ownWorkspace.invitedAgencyEmail;

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
            </span>
          </div>
          <button
            onClick={() => setInvitedAgencyEmail(null)}
            className="text-xs font-medium text-destructive hover:bg-destructive/10 rounded px-2 py-1 flex items-center gap-1"
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
            className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Send invite
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
