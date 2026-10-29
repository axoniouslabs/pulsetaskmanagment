"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, Check, Eye, EyeOff, Loader2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";

const post = (body: unknown) =>
  fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>)
    .catch(() => ({ ok: false, error: "Couldn't reach Pulse. Check your connection." }));

/** a company owner starts a 3-day free trial: their own company, ready to invite the team */
export function SignupForm() {
  const [f, setF] = React.useState({ name: "", company: "", email: "", phone: "", password: "" });
  const [needsCode, setNeedsCode] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  React.useEffect(() => {
    let live = true;
    fetch("/api/signup", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setNeedsCode(!!d.needsCode))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const check = () => {
    if (f.name.trim().length < 2) return "Write your full name.";
    if (f.company.trim().length < 2) return "Write your company's name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "That email doesn't look right.";
    if (f.password.length < 8) return "Choose a password of at least 8 characters.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = check();
    if (problem) return setError(problem);
    setBusy(true);
    if (needsCode && !codeSent) {
      const r = await post({ step: "code", email: f.email });
      setBusy(false);
      if (!r.ok) return setError(r.error ?? "Couldn't send the code.");
      setCodeSent(true);
      return;
    }
    const r = await post({ ...f, code });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error ?? "Couldn't create your company.");
    }
    window.location.replace("/overview");
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="login-brand relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="relative flex items-center gap-3">
          <Logo size={36} inverse />
          <span className="font-display text-[22px] font-bold tracking-tight">Pulse</span>
        </div>
        <div className="relative max-w-[460px]">
          <h1 className="font-display text-[42px] font-semibold leading-[1.05] tracking-[-0.025em]">Try Pulse with your team for 3 days.</h1>
          <ul className="mt-8 space-y-4 text-[15px] leading-snug text-white/80">
            <li className="flex gap-3">
              <BellRing className="mt-0.5 size-5 shrink-0" /> Assign a task once; Pulse reminds them until they respond, and tells the right manager if they don&apos;t.
            </li>
            <li className="flex gap-3">
              <Users className="mt-0.5 size-5 shrink-0" /> Invite up to 15 people with a link or a code. They install it on their phone and PC.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0" /> No card needed. When the trial ends, everything you added stays saved.
            </li>
          </ul>
        </div>
        <p className="relative text-[13px] text-white/55">Already using Pulse? Sign in instead.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={32} />
            <span className="font-display text-[20px] font-bold tracking-tight text-ink">Pulse</span>
          </div>
          <h2 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text">{codeSent ? "Check your email" : "Start your free trial"}</h2>
          <p className="mt-1.5 text-[14.5px] text-muted">
            {codeSent ? `We sent a 6-digit code to ${f.email.trim()}. It works for 15 minutes.` : "3 days, everything included. You'll be the owner of your company's Pulse."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            {codeSent ? (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">Code</span>
                <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-11 font-mono tracking-[0.3em]" autoFocus />
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-text">Your full name</span>
                  <Input value={f.name} onChange={set("name")} autoComplete="name" className="h-11" autoFocus />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-text">Company name</span>
                  <Input value={f.company} onChange={set("company")} autoComplete="organization" className="h-11" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-text">Work email</span>
                  <Input type="email" value={f.email} onChange={set("email")} autoComplete="username" inputMode="email" className="h-11" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-text">Phone or WhatsApp (optional)</span>
                  <Input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" className="h-11" />
                </label>
                <div className="relative">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-text">Password</span>
                    <Input type={show ? "text" : "password"} value={f.password} onChange={set("password")} autoComplete="new-password" className="h-11 pr-11" />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-faint hover:text-muted"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                  </button>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || (codeSent && code.trim().length < 6)}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />} {needsCode && !codeSent ? "Email me a code" : "Start my free trial"}
            </Button>
            {codeSent && (
              <button type="button" onClick={() => setCodeSent(false)} className="w-full text-center text-[13px] font-medium text-ink hover:underline">
                Change details or send a new code
              </button>
            )}
            <p className="text-center text-[13px] text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-ink hover:underline">
                Sign in
              </Link>
              {" · "}
              Got an invite?{" "}
              <Link href="/join" className="font-medium text-ink hover:underline">
                Join your company
              </Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
