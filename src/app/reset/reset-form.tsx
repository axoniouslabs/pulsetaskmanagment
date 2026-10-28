"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useQueryParam } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Logo } from "@/components/app/logo";

/** the page a reset email links to: choose a new password, then sign in with it */
export function ResetForm() {
  const token = useQueryParam("token");
  const failed = useQueryParam("error");
  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== again) return setError("The two passwords don't match.");
    if (!token) return;
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) return setError(error.status === 429 ? "Too many tries. Wait a while and try again." : "This link has expired or was already used. Ask for a new one from the sign-in page.");
    setDone(true);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Pulse</span>
        </div>
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-text">{done ? "Password changed" : "Choose a new password"}</h1>
        {done ? (
          <>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">You&apos;ve been signed out everywhere else. Sign in with your new password.</p>
            <Button asChild variant="primary" size="lg" className="mt-6 w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        ) : !token || failed ? (
          <>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">This link has expired or was already used. Ask for a new one from the sign-in page.</p>
            <Button asChild variant="secondary" size="lg" className="mt-6 w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="relative">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-text">New password</span>
                <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11 pr-11" autoFocus />
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
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-text">Type it again</span>
              <Input type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" className="h-11" />
            </label>
            {error && (
              <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Save new password
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
