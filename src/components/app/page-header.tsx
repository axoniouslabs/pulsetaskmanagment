import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[64ch] text-[14.5px] leading-snug text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ title, aside, className, id }: { title: React.ReactNode; aside?: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {aside && <div className="text-[13px] text-muted">{aside}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>{children}</section>;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: React.ElementType; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-sunken text-faint ring-8 ring-sunken/40">
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-text">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13.5px] leading-snug text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
