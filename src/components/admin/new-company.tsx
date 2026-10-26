"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { registerCompany } from "@/app/admin/actions";
import { PageTitle } from "./bits";

export function NewCompanyForm() {
  const [f, setF] = React.useState({ company: "", ownerName: "", ownerEmail: "", contactPhone: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ orgId: string; password: string } | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await registerCompany(f).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone({ orgId: r.orgId, password: r.password });
    toast.success(`${f.company.trim()} is on Pulse`);
  }

  if (done) return <Handover company={f.company.trim()} owner={f.ownerName.trim()} email={f.ownerEmail.trim().toLowerCase()} {...done} />;

  return (
    <div className="mx-auto max-w-[560px]">
      <PageTitle title="Add a company" sub="Create the company and its owner. The owner gets a temporary password, chooses their own on first sign-in, and adds their people from there." />
      <Panel className="p-5 sm:p-6">
        <form onSubmit={submit} noValidate className="space-y-4">
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
          <Field label="Phone or WhatsApp (optional)" hint="For your records, to reach the company if you need to.">
            <Input type="tel" value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+92 300 1234567" className="h-10" />
          </Field>
          {error && (
            <p role="alert" className="rounded-[var(--radius-sm)] bg-heat-3-tint px-3 py-2.5 text-[13px] leading-snug text-heat-3">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button asChild variant="ghost">
              <Link href="/admin/companies">Cancel</Link>
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !f.company.trim() || !f.ownerName.trim() || !f.ownerEmail.trim()}>
              {busy && <Loader2 className="animate-spin" />} Create company
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

/** the one moment the temporary password is visible: hand it over */
function Handover({ company, owner, email, password, orgId }: { company: string; owner: string; email: string; password: string; orgId: string }) {
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
      <PageTitle title={`${company} is ready`} sub={`Send ${owner.split(" ")[0]} these sign-in details. The password is shown only now.`} />
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
