import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell, Field } from "@/components/leadlogr/auth-shell";
import { useState, type FormEvent } from "react";
import { signIn } from "@/auth/client";
import { resolveActiveOrganization } from "@/auth/session";
import { useServerFn } from "@tanstack/react-start";
import { acceptInvite } from "@/lib/invitations.functions";

const PENDING_INVITE_KEY = "leadlogr.pending_invite_token";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Leadlogr" },
      { name: "description", content: "Sign in to your Leadlogr workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptInvite);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Leaves the login page after a successful sign-in.
   *
   * A full document load rather than a client-side navigate: the account
   * context, the active organization and every cached query are derived from
   * the session that has only just been created, and the router transition
   * raced that setup — sign-in succeeded but the user stayed on /login.
   */
  const enter = (path: string) => {
    if (typeof window === "undefined") return;
    window.location.assign(path);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn.email({
        email: email.trim(),
        password,
      });
      if (signInError) throw new Error(signInError.message ?? "Could not sign in");

      const active = await resolveActiveOrganization();
      if (!active) {
        // Signed in, but belongs to no workspace yet — finish signup.
        enter("/signup");
        return;
      }
      const accountType = active.accountType;

      const pendingToken =
        typeof window !== "undefined" ? window.localStorage.getItem(PENDING_INVITE_KEY) : null;
      if (pendingToken && accountType === "agency") {
        try {
          await acceptFn({ data: { token: pendingToken } });
        } catch (err) {
          console.error("Failed to accept pending invite", err);
        } finally {
          window.localStorage.removeItem(PENDING_INVITE_KEY);
        }
      }

      enter(accountType === "agency" ? "/agency" : "/app/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to Leadlogr"
      subtitle="Welcome back. Pick up where your pipeline left off."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="text-foreground font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Email" type="email" placeholder="you@agency.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" placeholder="••••••••" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
