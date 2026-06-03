import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/leadlogr/page-header";
import { ACCESS_LEVEL_META, useAccount, type AccessLevel } from "@/lib/account-context";

export const Route = createFileRoute("/agency/new-client")({
  head: () => ({ meta: [{ title: "New client — Leadlogr Agency" }] }),
  component: NewClientPage,
});

const LEVELS: AccessLevel[] = ["full", "names_only", "metrics_only"];

function NewClientPage() {
  const { addClientWorkspace } = useAccount();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [fee, setFee] = useState("300");
  const [access, setAccess] = useState<AccessLevel>("full");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ownerEmail.trim()) return;
    addClientWorkspace({
      name: name.trim(),
      ownerName: ownerName.trim() || ownerEmail.trim(),
      ownerEmail: ownerEmail.trim(),
      monthlyReferralFee: Number(fee) || 0,
      currency: "EUR",
      agencyAccess: access,
    });
    navigate({ to: "/agency" });
  };

  return (
    <>
      <PageHeader
        eyebrow="Agency"
        title="Create a new client workspace"
        description="Set up a workspace on behalf of a client. You can adjust their access level later."
      />

      <form onSubmit={submit} className="bg-card ring-1 ring-border rounded-lg p-6 space-y-5 max-w-2xl">
        <Field label="Workspace name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" placeholder="Acme Media" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Owner name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="input" placeholder="Jane Doe" />
          </Field>
          <Field label="Owner email">
            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required className="input" placeholder="jane@acme.com" />
          </Field>
        </div>
        <Field label="Monthly referral fee (EUR)">
          <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className="input" />
        </Field>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Default access level
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {LEVELS.map((lvl) => {
              const active = access === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setAccess(lvl)}
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

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/agency" })}
            className="text-sm font-medium px-3 py-2 rounded-md ring-1 ring-border bg-card hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create workspace
          </button>
        </div>

        <style>{`.input{width:100%;background:hsl(var(--card));border-radius:0.375rem;font-size:0.875rem;padding:0.5rem 0.75rem;outline:none}.input:focus{box-shadow:0 0 0 2px hsl(var(--ring))}`}</style>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1.5 [&_input]:w-full [&_input]:bg-background [&_input]:ring-1 [&_input]:ring-border [&_input]:rounded-md [&_input]:text-sm [&_input]:px-3 [&_input]:py-2 [&_input]:focus:outline-none [&_input]:focus:ring-2 [&_input]:focus:ring-ring">
        {children}
      </div>
    </label>
  );
}
