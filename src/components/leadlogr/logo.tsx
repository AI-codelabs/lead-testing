import { Link } from "@tanstack/react-router";

export function Logo({ to = "/", onDark = false }: { to?: string; onDark?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2 group">
      <div
        className={`size-6 rounded-sm grid place-items-center ${onDark ? "bg-white" : "bg-foreground"}`}
      >
        <div className="size-2 bg-brand-accent rounded-[1px]" />
      </div>
      <span
        className={`text-sm font-semibold tracking-tight uppercase ${onDark ? "text-white" : ""}`}
      >
        Leadlogr
      </span>
    </Link>
  );
}
