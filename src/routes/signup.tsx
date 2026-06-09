import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell, Field } from "@/components/leadlogr/auth-shell";
import { useState, type FormEvent } from "react";
import { Briefcase, Building2, MailCheck } from "lucide-react";
import { useAccount, type AccountType } from "@/lib/account-context";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your Leadlogr account" },
      { name: "description", content: "Spin up a Leadlogr workspace as a standard account or an agency." },
    ],
  }),
  component: SignupPage,
});

const TYPES: { value: AccountType; label: string; hint: string; icon: typeof Building2 }[] = [
  {
    value: "standard",
    label: "Standard account",
    hint: "One workspace for your own business. Full pipeline, CRM, and integrations.",
    icon: Building2,
  },
  {
    value: "agency",
    label: "Agency account",
    hint: "Manage multiple client workspaces from a single overview.",
    icon: Briefcase,
  },
];

function SignupPage() {
  const navigate = useNavigate();
  const { createAccount } = useAccount();
  const [type, setType] = useState<AccountType>("standard");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ownerName = [firstName, lastName].filter(Boolean).join(" ");
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app/dashboard`,
          data: {
            account_type: type,
            workspace_name: workspaceName.trim(),
            owner_name: ownerName,
          },
        },
      });
      if (signUpError) throw signUpError;
      // Optimistic local hydration so the UI reflects the new workspace immediately.
      createAccount({
        accountType: type,
        workspaceName,
        ownerName,
        ownerEmail: email,
      });
      if (data.session) {
        navigate({ to: type === "agency" ? "/agency" : "/app/dashboard" });
      } else {
        // Email confirmation is enabled — show a friendly confirmation modal.
        setConfirmOpen(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  };

  const isAgency = type === "agency";

  return (
    <>
    <AuthShell
      title="Create your account"
      subtitle="Choose how you'll use Leadlogr — for your own workspace or to manage many."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-foreground font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Account type
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TYPES.map(({ value, label, hint, icon: Icon }) => {
              const active = type === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  aria-pressed={active}
                  className={`text-left rounded-md p-3 ring-1 transition-colors ${
                    active ? "ring-foreground bg-muted" : "ring-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4" />
                    <span className="text-sm font-semibold">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{hint}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" placeholder="Jane" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Field label="Last name" placeholder="Doe" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <Field label="Work email" type="email" placeholder="you@company.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          label={isAgency ? "Agency name" : "Workspace name"}
          placeholder={isAgency ? "Hive Hive" : "My business"}
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          required
        />
        <Field
          label="Password"
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? "Creating…" : isAgency ? "Create agency account" : "Create workspace"}
        </button>
        <p className="text-xs text-muted-foreground">
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthShell>
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
            <MailCheck className="size-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Check your inbox</DialogTitle>
          <DialogDescription className="text-center">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Click it to verify your email, then sign in to your new workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Link
            to="/login"
            className="w-full sm:w-auto inline-flex justify-center bg-primary text-primary-foreground text-sm font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity"
          >
            Go to sign in
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
