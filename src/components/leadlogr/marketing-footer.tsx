import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";
import { COMPANY } from "@/lib/legal";

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
          {/* Previously six links, every one href="#". A dead link is worse than
              an absent one, so only the pages that exist are listed. */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-foreground">Company</span>
            <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground">
              Terms of Service
            </Link>
            <a
              href={`mailto:${COMPANY.contactEmail}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {COMPANY.contactEmail}
            </a>
          </div>
        </div>
        {/* Was "Leadlogr Systems Inc.", a company that does not exist. Google's
            brand verification checks the site against the company register, so
            an invented entity fails it — and misstates who users contract with. */}
        <div className="mt-16 flex flex-col gap-1 border-t border-border/60 pt-8">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {COMPANY.legalName}
          </span>
          <span className="text-xs text-muted-foreground">
            {COMPANY.address} · {COMPANY.country} · {COMPANY.registrationNumber}
          </span>
        </div>
      </div>
    </footer>
  );
}
