"use client";

import * as React from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { changeMyPassword } from "@/components/pages/settings/actions";
import { Logo } from "./logo";
import { signOut } from "./account-menu";

/**
 * First sign-in with a temporary password: choose your own before anything else.
 * The password someone else typed is only ever a way in; the person's own is the
 * one that stays.
 */
export function PasswordGate() {
  const name = useApp((s) => s.people.find((p) => p.id === s.viewer?.personId)?.name ?? "");
  return <ChoosePassword name={name} />;
}

function ChoosePassword({ name }: { name: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("Use at least 8 characters.");
    if (next !== again) return setError("The two new passwords don't match.");
    setBusy(true);
    const r = await changeMyPassword(current, next).catch(() => ({
      ok: false as const,
      error: "Couldn't reach Pulse. Try again.",
    }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    await useApp.getState().load();
    toast.success("Password set", { description: "Only you know it now." });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="enter w-full max-w-[420px]" style={{ "--d": "60ms" } as React.CSSProperties}>
        <div className="flex items-center gap-2.5">
          <Logo size={32} trace="once" />
          <span className="font-display text-[20px] font-bold tracking-tight text-ink">Pulse</span>
        </div>
        <h1 className="mt-8 font-display text-[26px] font-semibold tracking-[-0.02em] text-text">Welcome, {name.split(" ")[0]}. Choose your password.</h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">The one you signed in with was typed by someone else. Pick your own before you start, so only you can sign in as you.</p>
        <form onSubmit={save} noValidate className="mt-7 space-y-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <Field label="Temporary password" hint="The one you just used.">
            <Input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className="h-11" autoFocus />
          </Field>
          <Field label="New password" hint="At least 8 characters. A short phrase works well.">
            <Input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className="h-11" />
          </Field>
          <Field label="New password again">
            <Input type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" className="h-11" />
          </Field>
          <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-text">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {show ? "Hide" : "Show"} passwords
          </button>
          {error && (
            <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13.5px] leading-snug text-heat-3">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !current || !next || !again}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Set my password
          </Button>
        </form>
        <button type="button" onClick={() => void signOut()} className="mt-4 block w-full text-center text-[13px] text-faint hover:text-muted">
          Not you? Sign out
        </button>
      </div>
    </main>
  );
}
