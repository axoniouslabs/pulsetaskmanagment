"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { saveSupport, type SupportInput } from "@/app/admin/actions";
import { PageTitle } from "./bits";

export function SupportSettings({ initial, adminEmail }: { initial: SupportInput; adminEmail: string }) {
  const [f, setF] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const preview = [f.supportPhone, f.supportEmail].filter(Boolean).join(" or ");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await saveSupport(f).catch(() => ({ ok: false as const, error: "Couldn't reach Pulse. Try again." }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
  }

  return (
    <div className="max-w-[640px]">
      <PageTitle title="Settings" sub={`Signed in as ${adminEmail}, the Pulse administrator.`} />
      <Panel className="p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold text-text">How customers reach you</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Shown to company owners when their subscription is about to end, and to everyone when it has ended or is paused.</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <Field label="Name customers know you by">
            <Input value={f.supportName} onChange={(e) => setF({ ...f, supportName: e.target.value })} placeholder="e.g. Axonious Labs" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone or WhatsApp">
              <Input type="tel" value={f.supportPhone} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} placeholder="+92 300 1234567" />
            </Field>
            <Field label="Email">
              <Input type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} placeholder="billing@company.com" />
            </Field>
          </div>
          <p className="rounded-[var(--radius-md)] bg-sunken px-3.5 py-2.5 text-[13px] text-muted">
            Customers will read: “{preview ? `Contact ${f.supportName || "Pulse"} on ${preview} to renew.` : "Contact the person who set up Pulse for you to renew."}”
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Save
          </Button>
        </form>
      </Panel>
    </div>
  );
}
