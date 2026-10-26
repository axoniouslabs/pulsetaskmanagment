"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Textarea } from "@/components/ui/primitives";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { ago, shortDate } from "@/lib/admin-shared";
import { cn } from "@/lib/utils";
import type { CompanyRow } from "@/server/admin-data";
import { resetOwnerPassword, saveCompanyDetails, setCompanyPaused } from "@/app/admin/actions";
import { StatusBadge } from "./bits";

type Person = { id: string; name: string; title: string; role: string; active: boolean; email: string };

interface Props {
  company: CompanyRow;
  people: Person[];
  weeks: { start: string; tasks: number }[];
  now: number;
  ownCompany: boolean;
}

export function CompanyView({ company: c, people, weeks, now, ownCompany }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"pause" | "password" | null>(null);
  const refresh = () => router.refresh();
  const paused = c.access === "paused";

  return (
    <>
      <Link href="/admin/companies" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted transition-colors hover:text-text">
        <ArrowLeft className="size-4" /> Companies
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[32px]">{c.name}</h1>
            <StatusBadge access={c.access} />
            {ownCompany && <span className="rounded-full bg-ink-tint px-2.5 py-0.5 text-[12.5px] font-medium text-ink">Your company</span>}
          </div>
          <p className="mt-1.5 text-[14px] text-muted">
            {c.owner ? `Owner: ${c.owner.name}, ${c.owner.email}` : "No owner"}
            {c.contactPhone ? `. Phone ${c.contactPhone}` : ""}. On Pulse since {shortDate(c.createdAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!ownCompany && (
            <Button variant="secondary" onClick={() => setDialog("password")} disabled={!c.owner}>
              <KeyRound /> Reset owner&apos;s password
            </Button>
          )}
          {!ownCompany && (
            <Button variant={paused ? "secondary" : "danger"} onClick={() => setDialog("pause")}>
              {paused ? <Play /> : <Pause />} {paused ? "Resume access" : "Pause access"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Usage c={c} weeks={weeks} now={now} />
          <People people={people} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <DetailsForm key={`${c.contactPhone}|${c.notes}`} c={c} onSaved={refresh} />
        </aside>
      </div>

      <Dialog open={dialog === "pause"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "pause" && <PauseConfirm c={c} paused={paused} onDone={(saved) => { setDialog(null); if (saved) refresh(); }} />}
      </Dialog>
      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "password" && <PasswordReset c={c} onDone={() => setDialog(null)} />}
      </Dialog>
    </>
  );
}

/* ---------------- usage ---------------- */

function Usage({ c, weeks, now }: { c: CompanyRow; weeks: { start: string; tasks: number }[]; now: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.tasks));
  const engineMin = c.engineLastTickAt ? Math.round((now - new Date(c.engineLastTickAt).getTime()) / 60000) : null;
  return (
    <Panel className="p-5 sm:p-6">
      <SectionHeading title="How they use Pulse" className="mb-5" />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Metric label="People" value={<span className="font-display text-[22px] font-semibold tabular">{c.users}</span>} />
        <Metric label="Active this week" value={<span className="font-display text-[22px] font-semibold tabular">{c.activeThisWeek}</span>} />
        <Metric label="Tasks, 30 days" value={<span className="font-display text-[22px] font-semibold tabular">{c.tasks30}</span>} />
        <Metric label="Reminders, 7 days" value={<span className="font-display text-[22px] font-semibold tabular">{c.reminders7}</span>} />
      </dl>
      <div className="mt-7">
        <p className="mb-3 text-[13px] text-muted">Tasks created each week{weeks.every((w) => !w.tasks) ? ": none yet" : ""}</p>
        <div className="flex h-28 items-end gap-1.5 sm:gap-2" role="img" aria-label={`Tasks created per week, last ${weeks.length} weeks: ${weeks.map((w) => w.tasks).join(", ")}`}>
          {weeks.map((w, i) => (
            <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[11.5px] tabular text-faint">{w.tasks || ""}</span>
              <span
                className={cn("w-full rounded-t-[4px] transition-[height] duration-700 ease-[var(--ease-settle)]", i === weeks.length - 1 ? "bg-ink" : "bg-ink/35")}
                style={{ height: `${Math.max(w.tasks ? 6 : 2, Math.round((w.tasks / max) * 84))}px` }}
              />
              <span className={cn("whitespace-nowrap text-[11px] text-faint", i % 2 === 1 && i !== weeks.length - 1 && "invisible sm:visible")}>
                {new Date(w.start).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace("Sept", "Sep")}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 border-t border-line pt-4 text-[13px] text-muted">
        Last used {ago(c.lastActivityAt, now).toLowerCase()}. Reminder engine{" "}
        {isPaused(c) ? "is paused for this company." : engineMin === null ? "hasn't run for them yet." : `last ran ${engineMin <= 1 ? "just now" : `${engineMin} min ago`}.`}
      </p>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-[12.5px] text-faint">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

/* ---------------- people ---------------- */

function People({ people }: { people: Person[] }) {
  const active = people.filter((p) => p.active);
  return (
    <Panel className="overflow-hidden">
      <div className="px-5 pt-4 sm:px-6">
        <SectionHeading title="People" aside={`${active.length} active`} />
      </div>
      <ul className="mt-2 max-h-[420px] overflow-y-auto thin-scrollbar">
        {people.map((p) => (
          <li key={p.id} className={cn("flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-[13.5px] sm:px-6", !p.active && "opacity-55")}>
            <span className="min-w-0">
              <span className="block truncate font-medium text-text">{p.name}</span>
              <span className="block truncate text-[12.5px] text-faint">{p.title || p.email}</span>
            </span>
            <span className="shrink-0 text-[12.5px] capitalize text-muted">{p.active ? p.role : "Deactivated"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------- notes ---------------- */

function DetailsForm({ c, onSaved }: { c: CompanyRow; onSaved: () => void }) {
  const [phone, setPhone] = React.useState(c.contactPhone);
  const [notes, setNotes] = React.useState(c.notes);
  const [busy, setBusy] = React.useState(false);
  const dirty = phone !== c.contactPhone || notes !== c.notes;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await saveCompanyDetails({ orgId: c.id, contactPhone: phone, notes }).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    onSaved();
  }

  return (
    <Panel className="p-5">
      <SectionHeading title="Your notes" className="mb-4" />
      <form onSubmit={save} className="space-y-4">
        <Field label="Phone or WhatsApp">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Notes" hint="Only you see these.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-28" />
        </Field>
        <Button type="submit" variant={dirty ? "primary" : "secondary"} className="w-full" disabled={busy || !dirty}>
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </form>
    </Panel>
  );
}

const isPaused = (c: CompanyRow) => c.access === "paused";

/* ---------------- dialogs ---------------- */

function PauseConfirm({ c, paused, onDone }: { c: CompanyRow; paused: boolean; onDone: (saved: boolean) => void }) {
  const [busy, setBusy] = React.useState(false);
  async function go() {
    setBusy(true);
    const r = await setCompanyPaused(c.id, !paused).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(paused ? `${c.name} can use Pulse again` : `${c.name} is paused`);
    onDone(true);
  }
  return (
    <DialogContent
      title={paused ? `Resume ${c.name}?` : `Pause ${c.name}?`}
      description={
        paused
          ? "Everyone in the company can sign in and work again, and their reminders start again."
          : "Nobody in the company can use Pulse until you resume it, and their reminders stop. Nothing is deleted."
      }
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button variant={paused ? "primary" : "dangerSolid"} onClick={go} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {paused ? "Resume access" : "Pause access"}
        </Button>
      </div>
    </DialogContent>
  );
}

function PasswordReset({ c, onDone }: { c: CompanyRow; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  async function go() {
    setBusy(true);
    const r = await resetOwnerPassword(c.id).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult({ email: r.email, password: r.password });
  }
  if (result)
    return (
      <DialogContent title="New temporary password" description={`Send it to ${c.owner?.name.split(" ")[0] ?? "the owner"}. It's shown only now; Pulse asks them to choose their own after signing in.`}>
        <div className="rounded-[var(--radius-md)] bg-sunken p-4">
          <p className="text-[13px] text-muted">{result.email}</p>
          <p className="mt-1 font-mono text-[18px] font-semibold tracking-wide text-text">{result.password}</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              await navigator.clipboard.writeText(`Email: ${result.email}\nTemporary password: ${result.password}`).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </DialogContent>
    );
  return (
    <DialogContent title={`Reset ${c.owner?.name.split(" ")[0] ?? "the owner"}'s password?`} description="Their current password stops working and they're signed out everywhere. You'll get a temporary password to send them.">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={go} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Reset password
        </Button>
      </div>
    </DialogContent>
  );
}
