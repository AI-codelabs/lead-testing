import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 group">
      <div className="size-6 bg-foreground rounded-sm grid place-items-center">
        <div className="size-2 bg-brand-accent rounded-[1px]" />
      </div>
      <span className="text-sm font-semibold tracking-tight uppercase">
        Leadlogr
      </span>
    </Link>
  );
}
