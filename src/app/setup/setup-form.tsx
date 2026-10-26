"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";
import { setupCompany, type SetupInput } from "./actions";

const EMPTY: SetupInput = { company: "", name: "", email: "", password: "", key: "" };

export function SetupForm() {
  const [v, setV] = React.useState<SetupInput>(EMPTY);
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ text: string; field?: keyof SetupInput } | null>(null);
  const set = (k: keyof SetupInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const bad = (k: keyof SetupInput) => error?.field === k;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await setupCompany(v);
    if (!r.ok) {
      setBusy(false);
      setError({ text: r.error, field: r.field });
      return;
    }
    window.location.replace("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <div className="enter w-full max-w-[440px]" style={{ "--d": "60ms" } as React.CSSProperties}>
        <div className="flex items-center gap-2.5">
          <Logo size={32} trace="once" />
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Pulse</span>
        </div>
        <h1 className="mt-8 font-display text-[28px] font-semibold tracking-[-0.02em] text-text">Set up your company</h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">This creates your own company and makes you the Pulse administrator, so you can add client companies and their subscriptions afterwards.</p>

        <form onSubmit={onSubmit} noValidate className="mt-7 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="space-y-4">
            <Field label="Company name" invalid={bad("company")}>
              <Input value={v.company} onChange={set("company")} autoComplete="organization" className="h-11" autoFocus />
            </Field>
            <Field label="Your name" invalid={bad("name")}>
              <Input value={v.name} onChange={set("name")} placeholder="Full name" autoComplete="name" className="h-11" />
            </Field>
            <Field label="Work email" hint="You'll sign in with this." invalid={bad("email")}>
              <Input type="email" inputMode="email" value={v.email} onChange={set("email")} placeholder="you@company.com" autoComplete="username" className="h-11" />
            </Field>
            <Field
              label="Password"
              hint="At least 8 characters."
              invalid={bad("password")}
              after={
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-0 top-[26px] flex h-11 w-11 items-center justify-center text-faint transition-colors duration-150 hover:text-muted" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              }
            >
              <Input type={show ? "text" : "password"} value={v.password} onChange={set("password")} autoComplete="new-password" className="h-11 pr-11" />
            </Field>

            <div className="border-t border-line pt-4">
              <Field label="Setup key" hint="The CRON_SECRET value from your Vercel project's environment variables. It proves you run this server." invalid={bad("key")}>
                <span className="relative block">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input value={v.key} onChange={set("key")} autoComplete="off" spellCheck={false} className="h-11 pl-9 font-mono text-[13px]" />
                </span>
              </Field>
            </div>

            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error.text}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Create company
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-[12.5px] text-faint">This page only works once. After that, everyone signs in as usual.</p>
      </div>
    </main>
  );
}

function Field({ label, hint, invalid, after, children }: { label: string; hint?: string; invalid?: boolean; after?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("relative", invalid && "[&_input]:border-heat-3 [&_input]:ring-heat-3/20")}>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium leading-5 text-text">{label}</span>
        {children}
      </label>
      {after}
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}
