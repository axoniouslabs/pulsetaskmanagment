import { cn } from "@/lib/utils";
import { accessLabel, type AccessState } from "@/lib/admin-shared";

type AccessLike = { state: AccessState; expiresAt: string | null; daysLeft: number | null };

const TONE: Record<AccessState | "open", string> = {
  active: "bg-ok-tint text-ok",
  open: "bg-ink-tint text-ink",
  expiring: "bg-heat-1-tint text-heat-1",
  expired: "bg-heat-3-tint text-heat-3",
  suspended: "bg-sunken text-muted",
};

/** one calm pill: paid until, ends soon, ended, paused or no end date */
export function AccessBadge({ access, className }: { access: AccessLike; className?: string }) {
  const tone = access.state === "active" && !access.expiresAt ? "open" : access.state;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", TONE[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {accessLabel(access)}
    </span>
  );
}

/** places used on the plan, with a slim bar that turns amber near the limit and red past it */
export function Seats({ used, max, className }: { used: number; max: number | null; className?: string }) {
  if (max === null) return <span className={cn("text-[13.5px] text-text tabular", className)}>{used} {used === 1 ? "person" : "people"}</span>;
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  const tone = used > max ? "bg-heat-3" : pct >= 90 ? "bg-heat-1" : "bg-ink";
  return (
    <span className={cn("block min-w-[96px]", className)}>
      <span className="text-[13.5px] tabular text-text">
        {used} <span className="text-faint">of {max}</span>
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
        <span className={cn("block h-full rounded-full transition-[width] duration-700 ease-[var(--ease-settle)]", tone)} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

export function AdminSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="skeleton h-4 w-40 rounded" />
      <div className="skeleton h-10 w-2/3 max-w-[520px] rounded" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="skeleton h-72 rounded-[var(--radius-lg)]" />
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[32px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
