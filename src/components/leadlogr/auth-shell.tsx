import type { ChangeEventHandler, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="flex flex-col px-6 py-8 md:px-12">
        <Logo />
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
            <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
            <div className="mt-10">{children}</div>
            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">← Back to home</Link>
        </div>
      </div>

      <div className="hidden md:flex bg-muted/50 border-l border-border items-center justify-center p-12">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card ring-1 ring-border mb-6">
            <div className="size-1.5 rounded-full bg-brand-accent animate-pulse" />
            <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
              Closed-loop attribution
            </span>
          </div>
          <p className="text-2xl font-medium tracking-tight leading-tight text-balance">
            "We finally have a system that proves our ads generate revenue, not just clicks."
          </p>
          <div className="flex items-center gap-3 mt-6">
            <div className="size-9 bg-card ring-1 ring-border rounded-full" />
            <div>
              <div className="text-sm font-semibold">Marcus Chen</div>
              <div className="text-xs text-muted-foreground">Director of Growth, Altria Media</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  type = "text",
  placeholder,
  autoComplete,
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-2 w-full bg-card ring-1 ring-border rounded-md px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
      />
    </label>
  );
}
