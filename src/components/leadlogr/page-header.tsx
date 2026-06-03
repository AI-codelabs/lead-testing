import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            {eyebrow}
          </span>
        )}
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-[60ch]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
