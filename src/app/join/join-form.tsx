"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";

interface Invite {
  code: string;
  company: string;
  logoUrl: string | null;
  email: string | null;
  role: string;
  team: string | null;
  title: string;
}

const lookup = (c: string): Promise<{ ok: boolean; error?: string; invite?: Invite }> =>
  fetch(`/api/join?code=${encodeURIComponent(c)}`, { cache: "no-store" })
    .then((x) => x.json())
    .catch(() => ({ ok: false, error: "Couldn't reach Pulse. Check your connection." }));

/** someone joins their company with an invite link or code, and chooses their own password */
export function JoinForm({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = React.useState(initialCode ?? "");
  const [invite, setInvite] = React.useState<Invite | null>(null);
  const [checking, setChecking] = React.useState(!!initialCode);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", title: "", password: "" });

  const apply = React.useCallback((r: { ok: boolean; error?: string; invite?: Invite }) => {
    setChecking(false);
    if (!r.ok || !r.invite) return setError(r.error ?? "That code isn't valid.");
    const inv = r.invite;
    setInvite(inv);
    setForm((f) => ({ ...f, email: inv.email ?? f.email, title: inv.title || f.title }));
  }, []);
  const check = (c: string) => {
    setChecking(true);
    setError(null);
    void lookup(c).then(apply);
  };

  React.useEffect(() => {
    if (initialCode) void lookup(initialCode).then(apply);
  }, [initialCode, apply]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setError(null);
    if (form.name.trim().length < 2) return setError("Write your full name.");
    if (form.password.length < 8) return setError("Choose a password of at least 8 characters.");
    setBusy(true);
    const r = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: invite.code, ...form }) })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "Couldn't reach Pulse. Check your connection." }));
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    window.location.replace("/");
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center gap-2.5">
          {invite?.logoUrl ? <img src={invite.logoUrl} alt="" className="size-8 rounded-[8px] object-contain" /> : <Logo size={32} />}
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">{invite?.company ?? "Pulse"}</span>
        </div>

        {!invite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) check(code);
            }}
            className="space-y-4"
          >
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text">Join your company</h1>
            <p className="text-[14.5px] leading-relaxed text-muted">Enter the invite code you were given. It&apos;s 8 letters and numbers.</p>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-text">Invite code</span>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="one-time-code"
                placeholder="K7M2QX9P"
                className="h-11 font-mono tracking-[0.2em]"
                autoFocus
                maxLength={12}
              />
            </label>
            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={checking || !code.trim()}>
              {checking ? <Loader2 className="animate-spin" /> : <ArrowRight />} Continue
            </Button>
            <p className="text-center text-[13px] text-faint">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-ink hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={join} className="space-y-4" noValidate>
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text">Welcome to {invite.company}</h1>
            <p className="text-[14.5px] leading-relaxed text-muted">
              You&apos;re joining as {invite.role === "manager" ? "a manager" : "a team member"}
              {invite.team ? ` in ${invite.team}` : ""}. Choose the password you&apos;ll sign in with.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-text">Full name</span>
              <Input value={form.name} onChange={set("name")} autoComplete="name" className="h-11" autoFocus />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-text">Work email</span>
              <Input type="email" value={form.email} onChange={set("email")} autoComplete="username" inputMode="email" className="h-11" readOnly={!!invite.email} />
              {invite.email && <span className="mt-1 block text-[12.5px] text-faint">This invite is for this address.</span>}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">Job title</span>
                <Input value={form.title} onChange={set("title")} autoComplete="organization-title" className="h-11" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">Phone (optional)</span>
                <Input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" className="h-11" />
              </label>
            </div>
            <div className="relative">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">Password</span>
                <Input type={show ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="new-password" className="h-11 pr-11" />
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
            <p className="text-[12.5px] text-faint">At least 8 characters.</p>
            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Create my account
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
