"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, Pause, Play, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Dialog, DialogContent, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { PAYMENT_METHODS, ago, pkr, shortDate } from "@/lib/admin-shared";
import { cn } from "@/lib/utils";
import type { CompanyRow } from "@/server/admin-data";
import { recordPayment, resetOwnerPassword, setCompanyPaused, updateSubscription } from "@/app/admin/actions";
import { AccessBadge, Seats } from "./bits";

type Plan = { id: string; name: string; maxUsers: number | null; priceMonthly: number | null };
type Payment = { id: string; amount: number; method: string; reference: string; months: number; paidAt: string; periodFrom: string; periodTo: string; note: string };
type Person = { id: string; name: string; title: string; role: string; active: boolean; email: string };

interface Props {
  company: CompanyRow;
  payments: Payment[];
  people: Person[];
  weeks: { start: string; tasks: number }[];
  plans: Plan[];
  now: number;
  ownCompany: boolean;
}

export function CompanyView({ company: c, payments, people, weeks, plans, now, ownCompany }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"pay" | "pause" | "password" | null>(null);
  const refresh = () => router.refresh();
  const paused = c.access.state === "suspended";

  return (
    <>
      <Link href="/admin/companies" className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted transition-colors hover:text-text">
        <ArrowLeft className="size-4" /> Companies
      </Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] text-text sm:text-[32px]">{c.name}</h1>
            <AccessBadge access={c.access} />
            {ownCompany && <span className="rounded-full bg-ink-tint px-2.5 py-0.5 text-[12.5px] font-medium text-ink">Your company</span>}
          </div>
          <p className="mt-1.5 text-[14px] text-muted">
            {c.owner ? `Owner: ${c.owner.name}, ${c.owner.email}` : "No owner"}
            {c.contactPhone ? `. Phone ${c.contactPhone}` : ""}. On Pulse since {shortDate(c.createdAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDialog("pay")}>
            <Wallet /> Record a payment
          </Button>
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
          <Payments payments={payments} total={c.paidTotal} />
          <People people={people} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <SubscriptionForm key={`${c.planId}|${c.access.expiresAt}|${c.contactPhone}|${c.notes}`} c={c} plans={plans} onSaved={refresh} />
        </aside>
      </div>

      <Dialog open={dialog === "pay"} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "pay" && <PaymentForm c={c} plans={plans} onDone={(saved) => { setDialog(null); if (saved) refresh(); }} />}
      </Dialog>
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
        <Metric label="People" value={<Seats used={c.users} max={c.maxUsers} />} />
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
        {c.access.state === "expired" || c.access.state === "suspended" ? "is paused for this company." : engineMin === null ? "hasn't run for them yet." : `last ran ${engineMin <= 1 ? "just now" : `${engineMin} min ago`}.`}
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

/* ---------------- payments ---------------- */

function Payments({ payments, total }: { payments: Payment[]; total: number }) {
  return (
    <Panel className="overflow-hidden">
      <div className="px-5 pt-4 sm:px-6">
        <SectionHeading title="Payments" aside={payments.length ? pkr(total) : undefined} />
      </div>
      {payments.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-[13.5px] text-muted sm:px-6">No payments recorded yet.</p>
      ) : (
        <ul className="mt-2">
          {payments.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-4 border-t border-line px-5 py-3 text-[13.5px] sm:px-6">
              <div className="min-w-0">
                <p className="font-medium text-text">
                  {shortDate(p.paidAt)}, {p.method}
                </p>
                <p className="text-[12.5px] text-faint">
                  {p.months} {p.months === 1 ? "month" : "months"}: {shortDate(p.periodFrom)} to {shortDate(p.periodTo)}
                  {p.reference ? `. Ref ${p.reference}` : ""}
                  {p.note && p.note !== "First payment" ? `. ${p.note}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular text-text">{pkr(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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

/* ---------------- subscription settings ---------------- */

const toDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

function SubscriptionForm({ c, plans, onSaved }: { c: CompanyRow; plans: Plan[]; onSaved: () => void }) {
  const [planId, setPlanId] = React.useState(c.planId ?? "");
  const [never, setNever] = React.useState(!c.access.expiresAt);
  const [ends, setEnds] = React.useState(toDay(c.access.expiresAt));
  const [phone, setPhone] = React.useState(c.contactPhone);
  const [notes, setNotes] = React.useState(c.notes);
  const [busy, setBusy] = React.useState(false);
  const plan = plans.find((p) => p.id === planId);
  const over = plan?.maxUsers != null && c.users > plan.maxUsers;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!never && !ends) return toast.error("Pick an end date, or tick “No end date”.");
    setBusy(true);
    const r = await updateSubscription({ orgId: c.id, planId: planId || null, expiresOn: never ? null : ends, contactPhone: phone, notes }).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Subscription saved");
    onSaved();
  }

  return (
    <Panel className="p-5">
      <SectionHeading title="Subscription" className="mb-4" />
      <form onSubmit={save} className="space-y-4">
        <Field label="Plan" hint={over ? <span className="text-heat-3">They have {c.users} active people, more than this plan allows. They can't add anyone until it fits.</span> : plan?.priceMonthly ? `${pkr(plan.priceMonthly)} a month` : undefined}>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">No plan (no limit)</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.maxUsers === null ? ", unlimited" : `, up to ${p.maxUsers}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Access until" hint="Recording a payment moves this date for you. Change it here only to correct it.">
          <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} disabled={never} />
        </Field>
        <label className="flex items-center gap-2.5 text-[13.5px] text-text">
          <Checkbox checked={never} onCheckedChange={(v) => setNever(v === true)} /> No end date
        </label>
        <Field label="Phone or WhatsApp">
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Notes" hint="Only you see these.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Save
        </Button>
      </form>
    </Panel>
  );
}

/* ---------------- dialogs ---------------- */

function PaymentForm({ c, plans, onDone }: { c: CompanyRow; plans: Plan[]; onDone: (saved: boolean) => void }) {
  const price = plans.find((p) => p.id === c.planId)?.priceMonthly ?? null;
  const [months, setMonths] = React.useState(1);
  const [amount, setAmount] = React.useState(price ?? 0);
  const [method, setMethod] = React.useState<string>("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(() => new Date().toLocaleDateString("en-CA"));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const base = c.access.expiresAt && new Date(c.access.expiresAt) > new Date() ? new Date(c.access.expiresAt) : new Date();
  const until = new Date(base);
  until.setMonth(until.getMonth() + (months || 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await recordPayment({ orgId: c.id, amount, months, method, reference, paidOn, note }).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success("Payment recorded", { description: `${c.name} now has access until ${shortDate(r.expiresAt)}.` });
    onDone(true);
  }

  return (
    <DialogContent title="Record a payment" description={`Money received from ${c.name} outside Pulse. Their access is extended by the months paid.`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Months paid for">
            <Input
              type="number"
              min={1}
              max={36}
              value={months}
              onChange={(e) => {
                const m = Number(e.target.value);
                setMonths(m);
                if (price) setAmount(price * m);
              }}
              autoFocus
            />
          </Field>
          <Field label="Amount received (Rs)" hint={price ? `Plan price: ${pkr(price * (months || 0))}` : undefined}>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Paid by">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label="Reference (optional)" hint="Transaction ID, so you can match it to your bank statement.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="rounded-[var(--radius-md)] bg-ink-tint/60 px-3.5 py-2.5 text-[13.5px] text-ink">
          Access will run until <span className="font-semibold">{shortDate(until.toISOString())}</span>.
        </p>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !(months >= 1)}>
            {busy && <Loader2 className="animate-spin" />} Record payment
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

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
          ? "Everyone in the company can sign in and work again. If their paid-up date has passed, Pulse stays read-only until you record a payment."
          : "Nobody in the company can use Pulse until you resume it, and their reminders stop. Nothing is deleted. Use this for unpaid accounts or a company that has left."
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
