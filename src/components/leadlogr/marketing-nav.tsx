import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

const links = [
  { href: "#product", label: "Product" },
  { href: "#loop", label: "How it works" },
  { href: "#integrations", label: "Integrations" },
];

/**
 * The marketing header.
 *
 * `overlay` is for the landing page, where the hero illustration runs behind
 * the bar: the nav floats transparent over the image and fades to the solid
 * background once the hero has scrolled past, so the light text is never left
 * sitting on a white section.
 */
export function MarketingNav({ overlay = false }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overlay) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay]);

  // Transparent only while the bar is still over the illustration.
  const onImage = overlay && !scrolled;

  const shell = overlay
    ? `fixed inset-x-0 top-0 transition-colors duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-md border-b border-border/60" : "border-b border-transparent"
      }`
    : "sticky top-0 bg-background/80 backdrop-blur-md border-b border-border/60";

  const quiet = onImage
    ? "text-white/75 hover:text-white drop-shadow-sm"
    : "text-muted-foreground hover:text-foreground";

  return (
    <nav className={`z-50 ${shell}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo onDark={onImage} />
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors ${quiet}`}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className={`text-sm font-medium px-4 py-2 transition-colors ${quiet}`}
          >
            Sign in
          </Link>
          <Link
            to="/signup"
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
