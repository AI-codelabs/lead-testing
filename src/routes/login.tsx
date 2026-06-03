import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthShell, Field } from "@/components/leadlogr/auth-shell";
import type { FormEvent } from "react";

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/app/dashboard" });
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
        <Field label="Email" type="email" placeholder="you@agency.com" autoComplete="email" />
        <Field label="Password" type="password" placeholder="••••••••" autoComplete="current-password" />
        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity"
        >
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}
