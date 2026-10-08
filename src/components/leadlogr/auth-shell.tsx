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

      {/*
        The product illustration, shared with the dashboard. Full strength
        behind a flat scrim rather than faded: nothing here has to be read
        through it except this one quote, and white copy over a dark scrim
        measures better than dark copy over a washed-out picture.

        The scrim is 55%, set by the smallest line rather than the quote —
        the attribution is 12px, so it needs 4.5:1, not the 3:1 that the
        24px quote would allow. Measured worst case over the crop is 5.7:1.
      */}
      <div className="relative isolate hidden md:flex items-center justify-center overflow-hidden p-12">
        <img
          src="/dashboard-bg-1920.webp"
          srcSet="/dashboard-bg-1280.webp 1280w, /dashboard-bg-1920.webp 1920w"
          sizes="50vw"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 -z-20 size-full object-cover object-center select-none"
        />
        <div className="absolute inset-0 -z-10 bg-slate-950/55" />

        <div className="max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-sm mb-6">
            <div className="size-1.5 rounded-full bg-brand-accent animate-pulse" />
            <span className="text-[11px] font-medium tracking-wide uppercase text-white/90">
              Closed-loop attribution
            </span>
          </div>
          <p className="text-2xl font-medium tracking-tight leading-tight text-balance text-white">
            "We finally have a system that proves our ads generate revenue, not just clicks."
          </p>
          <div className="flex items-center gap-3 mt-6">
            <div className="size-9 bg-white/15 ring-1 ring-white/30 rounded-full" />
            <div>
              <div className="text-sm font-semibold text-white">Marcus Chen</div>
              <div className="text-xs text-white/75">Director of Growth, Altria Media</div>
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
  readOnly,
  hint,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  required?: boolean;
  /** Fixed by an invitation: the value is the credential, not a choice. */
  readOnly?: boolean;
  hint?: string;
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
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        className={`mt-2 w-full bg-card ring-1 ring-border rounded-md px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow ${
          readOnly ? "text-muted-foreground cursor-not-allowed" : ""
        }`}
      />
      {hint ? <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
