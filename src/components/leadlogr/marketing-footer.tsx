import { Logo } from "./logo";

export function MarketingFooter() {
  return (
    <footer className="py-16 border-t border-border/60 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
          <div>
            <Logo />
            <p className="text-xs text-muted-foreground max-w-[30ch] mt-4">
              The performance standard for modern marketing agencies and their clients.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-16 md:gap-24">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-foreground">Platform</span>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">Features</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">API Docs</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">Security</a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-foreground">Company</span>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">Privacy</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">Terms</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground">Contact</a>
            </div>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-border/60 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">© 2026 Leadlogr Systems Inc.</span>
        </div>
      </div>
    </footer>
  );
}
