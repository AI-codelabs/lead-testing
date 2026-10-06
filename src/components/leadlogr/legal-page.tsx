import type { ReactNode } from "react";
import { MarketingNav } from "./marketing-nav";
import { MarketingFooter } from "./marketing-footer";
import { POLICY_LAST_UPDATED } from "@/lib/legal";

/**
 * Shared shell for the policy pages.
 *
 * Deliberately plain and readable: these are documents people skim for one
 * answer, and the marketing styling elsewhere would get in the way of that.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main className="mx-auto max-w-[68ch] px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Last updated {POLICY_LAST_UPDATED}
        </p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">{intro}</p>
        <div className="mt-10 space-y-10">{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}

/** One titled section of a policy. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

/** A plain list inside a section. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc marker:text-border">
          {item}
        </li>
      ))}
    </ul>
  );
}
