import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-8">
          <a href="#product" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Product
          </a>
          <a href="#loop" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="#integrations" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Integrations
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="text-sm font-medium px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/signup" search={{}}
            className="bg-primary text-primary-foreground text-sm font-medium py-2 pl-2 pr-3 flex items-center gap-2 rounded-md ring-1 ring-primary shadow-sm hover:opacity-90 transition-opacity"
          >
            <span className="size-4 shrink-0 rounded-full bg-brand-accent/70" />
            <span>Start free</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
