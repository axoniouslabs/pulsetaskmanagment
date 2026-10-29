import { cn } from "@/lib/utils";
import type { AccessState } from "@/lib/access";

/** one calm pill: working normally, or paused by you */
export function StatusBadge({ access, className, trialEndsAt }: { access: AccessState; className?: string; trialEndsAt?: string | null }) {
  const left = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.parse(new Date().toISOString())) / 864e5)) : 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-medium",
        access === "paused" ? "bg-sunken text-muted" : access === "trial" ? "bg-info-tint text-info" : access === "trial_ended" ? "bg-heat-1-tint text-heat-1" : "bg-ok-tint text-ok",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {access === "paused" ? "Paused" : access === "trial" ? `Trial, ${left <= 1 ? "last day" : `${left} days left`}` : access === "trial_ended" ? "Trial ended" : "Paid"}
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
