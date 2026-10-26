"use client";

import * as React from "react";
import { ArrowRight, BellRing, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";
import { demoSignIn } from "./actions";

export interface DemoAccount {
  name: string;
  email: string;
  role: "owner" | "manager" | "employee";
  title: string;
  department: string;
  hue: number;
  initials: string;
}

const FEATURED: { email: string; label: string; hint: string }[] = [
  { email: "imran@crescent.pk", label: "Owner", hint: "Sees the whole company. Told only when something stalls." },
  { email: "saad@crescent.pk", label: "Manager", hint: "Runs Development. Assigns, reviews and unblocks." },
  { email: "ali@crescent.pk", label: "Employee", hint: "Gets the reminders. Works mostly from the phone." },
];

function nextPath() {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  // a path on this site only: not "//host" or "/\\host", which browsers treat as another site
  return n && /^\/(?![\/\\])/.test(n) && !/[\\\s]/.test(n) ? n : "/";
}

function Initials({ a, size = "md" }: { a: Pick<DemoAccount, "hue" | "initials" | "name">; size?: "md" | "lg" }) {
  return (
    <span
      className={cn("avatar-tint inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight", size === "lg" ? "size-10 text-[14px]" : "size-8 text-[12px]")}
      style={{ "--hue": a.hue } as React.CSSProperties}
      aria-hidden
    >
      {a.initials}
    </span>
  );
}

export function LoginForm({ demo, accounts }: { demo: boolean; accounts: DemoAccount[] }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const done = () => window.location.replace(nextPath());

  // a brand-new server has no company yet: the first visitor sets one up
  React.useEffect(() => {
    let live = true;
    fetch("/api/setup/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d?.needsSetup) window.location.replace("/setup");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Enter your work email and password.");
    setBusy("form");
    const { error } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password, rememberMe: true });
    if (error) {
      setBusy(null);
      setError(error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That email and password don't match. Check for typos, or ask your manager to reset your password.");
      return;
    }
    done();
  }

  async function quick(addr: string) {
    setError(null);
    setBusy(addr);
    const r = await demoSignIn(addr);
    if (!r.ok) {
      setBusy(null);
      setError(r.error);
      return;
    }
    done();
  }

  const byEmail = new Map(accounts.map((a) => [a.email, a]));
  const others = accounts.filter((a) => !FEATURED.some((f) => f.email === a.email));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* brand side */}
      <aside className="login-brand relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-56 -left-24 size-[560px] rounded-full bg-white/[0.03]" />
        <div className="relative flex items-center gap-3">
          <Logo size={36} inverse trace="once" />
          <span className="font-display text-[22px] font-bold tracking-tight">Pulse</span>
        </div>
        <div className="relative max-w-[460px]">
          <h1 className="enter font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.025em] xl:text-[52px]" style={{ "--d": "80ms" } as React.CSSProperties}>
            Assign once. Pulse follows up.
          </h1>
          <p className="enter mt-5 text-[16px] leading-relaxed text-white/70" style={{ "--d": "200ms" } as React.CSSProperties}>
            Reminders reach the right phone until someone responds. If they don&apos;t, the right manager hears about it. Every step is on the record.
          </p>
          {/* the one orchestrated moment: a reminder arrives, and Acknowledge glows once */}
          <div className="arrive mt-10 w-[340px] rounded-[var(--radius-lg)] bg-surface text-text shadow-[0_30px_60px_-20px_rgb(0_0_0/0.45)]" style={{ "--d": "700ms" } as React.CSSProperties}>
            <div className="flex gap-3 px-4 pb-3 pt-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
                <BellRing className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] text-faint">Pulse · reminder 2 · now</p>
                <p className="mt-0.5 text-[14px] font-semibold leading-snug">Dispatch 40 cartons to Multan</p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">Due 5:00 PM. Tap Acknowledge so Zain knows you&apos;ve seen it.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-line text-[13px]">
              <span className="glow-once flex h-10 items-center justify-center gap-1.5 rounded-bl-[var(--radius-lg)] font-semibold text-ink" style={{ "--d": "1500ms" } as React.CSSProperties}>
                <Check className="size-4" /> Acknowledge
              </span>
              <span className="flex h-10 items-center justify-center border-l border-line font-medium text-muted">Snooze 30</span>
            </div>
          </div>
        </div>
        <p className="enter relative flex items-center gap-2 text-[13px] text-white/55" style={{ "--d": "320ms" } as React.CSSProperties}>
          <ShieldCheck className="size-4" /> Each person sees only their own work and their team&apos;s.
        </p>
      </aside>

      {/* form side */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="enter w-full max-w-[420px]" style={{ "--d": "120ms" } as React.CSSProperties}>
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={32} trace="once" />
            <span className="font-display text-[20px] font-bold tracking-tight text-ink">Pulse</span>
          </div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text">Sign in</h2>
          <p className="mt-1.5 text-[14.5px] text-muted">Use the work email your company added you with.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-text">Work email</span>
              <Input type="email" autoComplete="username" inputMode="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoFocus />
            </label>
            <div className="relative">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">Password</span>
                <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" />
              </label>
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-faint transition-colors duration-150 hover:text-muted" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!!busy}>
              {busy === "form" ? <Loader2 className="animate-spin" /> : null}
              Sign in
            </Button>
            <p className="text-center text-[13px] text-faint">Forgot your password? Ask your manager or the owner to reset it.</p>
          </form>

          {demo && accounts.length > 0 && (
            <section className="mt-10">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[13px] font-medium text-faint">Or try the demo company</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="mt-4 space-y-2">
                {FEATURED.map((f) => {
                  const a = byEmail.get(f.email);
                  if (!a) return null;
                  return (
                    <button
                      key={f.email}
                      type="button"
                      disabled={!!busy}
                      onClick={() => quick(f.email)}
                      className="press group flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3 text-left shadow-[var(--shadow-card)] hover:border-ink/40 hover:bg-ink-tint/40 disabled:opacity-60"
                    >
                      <Initials a={a} size="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[14px] font-semibold text-text">{f.label}</span>
                          <span className="truncate text-[13px] text-muted">{a.name}</span>
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-faint">{f.hint}</span>
                      </span>
                      {busy === f.email ? <Loader2 className="size-4 animate-spin text-ink" /> : <ArrowRight className="size-4 text-faint transition-transform duration-200 ease-[var(--ease-settle)] group-hover:translate-x-0.5 group-hover:text-ink" />}
                    </button>
                  );
                })}
              </div>
              <details className="group mt-3">
                <summary className="cursor-pointer list-none text-center text-[13px] font-medium text-ink hover:underline">Sign in as someone else ({others.length} more)</summary>
                <div className="thin-scrollbar mt-3 max-h-72 space-y-0.5 overflow-y-auto rounded-[var(--radius-md)] border border-line bg-surface p-1.5">
                  {others.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      disabled={!!busy}
                      onClick={() => quick(a.email)}
                      className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-sunken disabled:opacity-60"
                    >
                      <Initials a={a} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-text">{a.name}</span>
                        <span className="block truncate text-[12px] text-faint">
                          {a.title}
                          {a.department ? ` · ${a.department}` : ""}
                        </span>
                      </span>
                      {busy === a.email && <Loader2 className="size-4 animate-spin text-ink" />}
                    </button>
                  ))}
                </div>
              </details>
              <p className="mt-4 text-center text-[12.5px] leading-relaxed text-faint">
                Crescent Distributors is a sample company with 20 staff in 5 departments. Changes you make are saved for everyone using the demo.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
