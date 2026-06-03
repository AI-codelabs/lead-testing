import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell, Field } from "@/components/leadlogr/auth-shell";
import type { FormEvent } from "react";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your Leadlogr account" },
      { name: "description", content: "Spin up a Leadlogr workspace for your agency." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/app/dashboard" });
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start tracking leads end-to-end in under two minutes."
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" placeholder="Jane" autoComplete="given-name" />
          <Field label="Last name" placeholder="Doe" autoComplete="family-name" />
        </div>
        <Field label="Work email" type="email" placeholder="you@agency.com" autoComplete="email" />
        <Field label="Agency name" placeholder="Acme Media" />
        <Field label="Password" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity"
        >
          Create workspace
        </button>
        <p className="text-xs text-muted-foreground">
          By creating an account you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthShell>
  );
}
