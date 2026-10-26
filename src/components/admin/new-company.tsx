"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, Select } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { PAYMENT_METHODS, pkr, shortDate } from "@/lib/admin-shared";
import { createClient } from "@/app/admin/actions";
import { PageTitle } from "./bits";

type Plan = { id: string; name: string; maxUsers: number | null; priceMonthly: number | null };

export function NewCompanyForm({ plans }: { plans: Plan[] }) {
  const [f, setF] = React.useState({
    company: "",
    ownerName: "",
    ownerEmail: "",
    contactPhone: "",
    planId: plans[0]?.id ?? "",
    start: "paid" as "paid" | "trial",
    months: 1,
    trialDays: 14,
    amount: plans[0]?.priceMonthly ?? 0,
    method: "Bank transfer",
    reference: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ orgId: string; password: string; expiresAt: string } | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const plan = plans.find((p) => p.id === f.planId);
  const suggested = plan?.priceMonthly ? plan.priceMonthly * f.months : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createClient(f).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone({ orgId: r.orgId, password: r.password, expiresAt: r.expiresAt });
    toast.success(`${f.company.trim()} is on Pulse`);
  }

  if (done) return <Handover company={f.company.trim()} owner={f.ownerName.trim()} email={f.ownerEmail.trim().toLowerCase()} {...done} />;

  return (
    <>
      <PageTitle title="Add a company" sub="Create the company and its owner. The owner gets a temporary password and adds their own people from there." />
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Panel className="space-y-4 p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-text">Company and owner</h2>
            <Field label="Company name">
              <Input value={f.company} onChange={(e) => set({ company: e.target.value })} autoFocus className="h-10" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Owner's name">
                <Input value={f.ownerName} onChange={(e) => set({ ownerName: e.target.value })} autoComplete="off" className="h-10" />
              </Field>
              <Field label="Owner's email" hint="They sign in with this.">
                <Input type="email" inputMode="email" value={f.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} autoComplete="off" className="h-10" />
              </Field>
            </div>
            <Field label="Phone or WhatsApp (optional)" hint="For your records, to reach them about renewals.">
              <Input type="tel" value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+92 300 1234567" className="h-10" />
            </Field>
          </Panel>

          <Panel className="space-y-4 p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-text">Subscription</h2>
            <Field label="Plan" hint={plan ? `${plan.maxUsers === null ? "No limit on people" : `Up to ${plan.maxUsers} people`}${plan.priceMonthly ? `, ${pkr(plan.priceMonthly)} a month` : ""}.` : undefined}>
              <Select value={f.planId} onChange={(e) => set({ planId: e.target.value, amount: (plans.find((p) => p.id === e.target.value)?.priceMonthly ?? 0) * f.months })} className="h-10">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.maxUsers === null ? ", unlimited" : `, up to ${p.maxUsers}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-text">Start with</p>
              <Segmented<"paid" | "trial">
                value={f.start}
                onChange={(v) => set({ start: v })}
                options={[
                  { value: "paid", label: "A payment" },
                  { value: "trial", label: "A free trial" },
                ]}
              />
            </div>
            {f.start === "trial" ? (
              <Field label="Trial length in days" hint="Afterwards Pulse goes read-only for them until you record a payment.">
                <Input type="number" min={1} max={90} value={f.trialDays} onChange={(e) => set({ trialDays: Number(e.target.value) })} className="h-10 w-32" />
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Months paid">
                    <Input
                      type="number"
                      min={1}
                      max={36}
                      value={f.months}
                      onChange={(e) => {
                        const months = Number(e.target.value);
                        set({ months, amount: plan?.priceMonthly ? plan.priceMonthly * months : f.amount });
                      }}
                      className="h-10"
                    />
                  </Field>
                  <Field label="Amount received (Rs)" hint={suggested !== null ? `Plan price: ${pkr(suggested)}` : "Enter 0 if not paid yet."}>
                    <Input type="number" min={0} value={f.amount} onChange={(e) => set({ amount: Number(e.target.value) })} className="h-10" />
                  </Field>
                  <Field label="Paid by">
                    <Select value={f.method} onChange={(e) => set({ method: e.target.value })} className="h-10">
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Reference (optional)" hint="Transaction ID or a note to find the payment later.">
                  <Input value={f.reference} onChange={(e) => set({ reference: e.target.value })} className="h-10" />
                </Field>
              </>
            )}
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel className="p-5">
            <p className="text-[13px] text-muted">They&apos;ll have access until</p>
            <p className="mt-1 font-display text-[22px] font-semibold text-text">
              {shortDate(f.start === "trial" ? addDaysIso(f.trialDays || 0) : addMonthsIso(f.months || 0))}
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-faint">Each payment you record later adds months from this date, or from today if it has already passed.</p>
            {error && (
              <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13px] leading-snug text-heat-3">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !f.company.trim() || !f.ownerName.trim() || !f.ownerEmail.trim() || !f.planId}>
              {busy && <Loader2 className="animate-spin" />} Create company
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link href="/admin/companies">Cancel</Link>
            </Button>
          </Panel>
        </aside>
      </form>
    </>
  );
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function addMonthsIso(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/** the one moment the temporary password is visible: hand it over */
function Handover({ company, owner, email, password, expiresAt, orgId }: { company: string; owner: string; email: string; password: string; expiresAt: string; orgId: string }) {
  const [copied, setCopied] = React.useState(false);
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const message = `Assalam o Alaikum ${owner.split(" ")[0]},\n\n${company} is now on Pulse.\n\nOpen: ${url}/login\nEmail: ${email}\nTemporary password: ${password}\n\nPulse will ask you to choose your own password after you sign in. Then add your team from Team → Add person.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };
  return (
    <div className="mx-auto max-w-[560px]">
      <PageTitle title={`${company} is ready`} sub={`Access runs until ${shortDate(expiresAt)}. Send ${owner.split(" ")[0]} these sign-in details. The password is shown only now.`} />
      <Panel className="p-5 sm:p-6">
        <dl className="space-y-3 text-[14px]">
          <Row label="Sign in at" value={`${url}/login`} />
          <Row label="Email" value={email} />
          <Row label="Temporary password" value={password} mono />
        </dl>
        <pre className="mt-5 whitespace-pre-wrap rounded-[var(--radius-md)] bg-sunken p-4 font-sans text-[13px] leading-relaxed text-text">{message}</pre>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy message"}
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/admin/companies/${orgId}`}>Open the company</Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-[15px] font-semibold tracking-wide text-text" : "break-all font-medium text-text"}>{value}</dd>
    </div>
  );
}
