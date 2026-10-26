"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Tip } from "@/components/ui/primitives";
import Link from "next/link";
import { useApp } from "@/lib/store";

const STALE_MIN = 10;

/**
 * The "reminders stopped" alarm. Pulse's whole promise is that it follows up by
 * itself, so if the engine hasn't run recently the owner must know at once.
 */
/** nudges anyone still on a password someone else chose */
export function PasswordNudge() {
  const me = useApp((s) => s.people.find((p) => p.id === s.viewer?.personId));
  if (!me?.mustChangePassword) return null;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-ink/15 bg-ink-tint/60 px-4 py-3 text-[13.5px] sm:flex-row sm:items-center">
      <p className="flex-1 text-ink">
        <span className="font-semibold">You&apos;re using a temporary password.</span> Choose your own so only you can sign in.
      </p>
      <Link href="/settings#account" className="font-semibold text-ink underline underline-offset-4">
        Change password
      </Link>
    </div>
  );
}

export function EngineAlarm() {
  const role = useApp((s) => s.role);
  const last = useApp((s) => s.engineLastTickAt);
  const offset = useApp((s) => s.serverOffsetMs);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (role !== "owner") return null;
  const mins = last ? Math.floor((now + offset - new Date(last).getTime()) / 60000) : null;
  if (mins !== null && mins < STALE_MIN) return null;

  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-[var(--radius-lg)] border border-heat-3/30 bg-heat-3-tint px-4 py-3 text-heat-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-[13.5px] leading-snug">
        <p className="font-semibold">Reminders are not running</p>
        <p className="mt-0.5 text-heat-3/90">
          {mins === null
            ? "The reminder engine has never run for this company. Nobody is being reminded or escalated until it does."
            : `The reminder engine last ran ${mins >= 120 ? `${Math.round(mins / 60)} hours` : `${mins} minutes`} ago. Nobody is being reminded or escalated until it runs again.`}{" "}
          Check that the every-minute scheduler calling <code className="rounded bg-surface/60 px-1">/api/cron/tick</code> is switched on.
        </p>
      </div>
    </div>
  );
}

/** a quiet heartbeat in the top bar: the reminder engine is running */
export function EngineLive() {
  const role = useApp((s) => s.role);
  const last = useApp((s) => s.engineLastTickAt);
  const offset = useApp((s) => s.serverOffsetMs);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (role === "employee" || !last) return null;
  const secs = Math.max(0, Math.round((now + offset - new Date(last).getTime()) / 1000));
  if (secs >= STALE_MIN * 60) return null;
  const ago = secs < 60 ? "less than a minute ago" : `${Math.round(secs / 60)} min ago`;
  return (
    <Tip label={`Reminders are running. Last check ${ago}.`} side="bottom">
      <span className="mr-1 inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[12.5px] font-medium text-muted" tabIndex={0} aria-label={`Reminders are running. Last check ${ago}.`}>
        <span className="size-2 animate-pulse-dot rounded-full bg-ok" />
        <span className="hidden sm:inline">Live</span>
      </span>
    </Tip>
  );
}
