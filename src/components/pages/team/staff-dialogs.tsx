"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, UserMinus, UserPlus, UserRoundCheck } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Segmented, Select } from "@/components/ui/primitives";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; password?: string };
  if (!res.ok) throw new Error(data.error ?? "That didn't go through.");
  await useApp.getState().load();
  return data;
}

/** shown once: the temporary password to pass on */
function PasswordReveal({ name, email, password, onDone }: { name: string; email: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const text = `Pulse sign-in for ${name}\nLink: ${typeof window !== "undefined" ? window.location.origin : ""}/login\nEmail: ${email}\nTemporary password: ${password}`;
  return (
    <DialogContent title={`Share these with ${name.split(" ")[0]}`} description="This password is shown only now. They'll be asked to choose their own after signing in.">
      <div className="space-y-2 rounded-[var(--radius-md)] border border-line bg-sunken p-4 text-[14px]">
        <p>
          <span className="text-muted">Email:</span> <span className="font-medium">{email}</span>
        </p>
        <p>
          <span className="text-muted">Temporary password:</span> <span className="tabular font-mono text-[15px] font-semibold tracking-wide">{password}</span>
        </p>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              toast.error("Couldn't copy. Select the text and copy it instead.");
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy sign-in details"}
        </Button>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </DialogContent>
  );
}

export function AddPersonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AddPersonForm onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function AddPersonForm({ onDone }: { onDone: () => void }) {
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const [f, setF] = React.useState({ name: "", email: "", phone: "", title: "", role: "employee" as "employee" | "manager", teamId: teams[0]?.id ?? "", workType: "desk" as "desk" | "field", capacityHours: 8 });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [made, setMade] = React.useState<{ password: string } | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  if (made) return <PasswordReveal name={f.name} email={f.email.trim().toLowerCase()} password={made.password} onDone={onDone} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call("/api/people", "POST", f);
      setMade({ password: r.password! });
      toast.success(`${f.name.split(" ")[0]} added`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent title="Add a person" description="They get a sign-in with a temporary password, and can be assigned tasks straight away.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Bilal Ahmed" />
          </Field>
          <Field label="Job title">
            <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sales Officer" />
          </Field>
          <Field label="Work email" hint="They sign in with this.">
            <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="bilal@company.com" />
          </Field>
          <Field label="Phone (optional)">
            <Input type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+92 300 1234567" />
          </Field>
        </div>
        <Field label="Team">
          <Select value={f.teamId} onChange={(e) => set({ teamId: e.target.value })}>
            <option value="">No team yet</option>
            {departments.map((d) => (
              <optgroup key={d.id} label={d.name}>
                {teams.filter((t) => t.departmentId === d.id).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Role">
            <Segmented value={f.role} onChange={(v) => set({ role: v })} options={[{ value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }]} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
          </Field>
          <Field label="Works">
            <Segmented value={f.workType} onChange={(v) => set({ workType: v })} options={[{ value: "desk", label: "Desk" }, { value: "field", label: "Field" }]} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
          </Field>
          <Field label="Hours a day">
            <Input type="number" min={1} max={16} value={f.capacityHours} onChange={(e) => set({ capacityHours: Number(e.target.value) || 8 })} />
          </Field>
        </div>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !f.name.trim() || !f.email.trim() || !f.title.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Add person
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

type Mode = "edit" | "reset" | "deactivate" | "reactivate";

/** owner-only actions on one person */
export function StaffActions({ person }: { person: Person }) {
  const [mode, setMode] = React.useState<Mode | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {person.active !== false ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>Edit details</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("reset")}>
              <KeyRound /> Reset password
            </Button>
            {person.role !== "owner" && (
              <Button size="sm" variant="danger" onClick={() => setMode("deactivate")}>
                <UserMinus /> Deactivate
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setMode("reactivate")}>
            <UserRoundCheck /> Reactivate
          </Button>
        )}
      </div>
      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        {mode && <StaffDialog person={person} mode={mode} onDone={() => setMode(null)} />}
      </Dialog>
    </>
  );
}

function StaffDialog({ person: p, mode, onDone }: { person: Person; mode: Mode; onDone: () => void }) {
  const openTasks = useApp((s) => s.tasks.filter((t) => t.assigneeId === p.id && ["assigned", "acknowledged", "in_progress", "blocked", "submitted"].includes(t.status)).length);
  const leads = useApp((s) => [...s.teams.filter((t) => t.leadId === p.id).map((t) => t.name), ...s.departments.filter((d) => d.headId === p.id).map((d) => d.name)]);
  const [f, setF] = React.useState({ name: p.name, title: p.title, phone: p.phone, role: p.role === "owner" ? undefined : p.role, workType: p.workType, capacityHours: p.capacityHours });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState<string | null>(null);
  const first = p.name.split(" ")[0];

  if (password) return <PasswordReveal name={p.name} email={p.email} password={password} onDone={onDone} />;

  const go = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (success) {
        toast.success(success);
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const footer = (label: string, onClick: () => void, variant: "primary" | "dangerSolid" = "primary") => (
    <>
      {error && <p className="mt-3 text-[13px] text-heat-3">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant={variant} onClick={onClick} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {label}
        </Button>
      </div>
    </>
  );

  if (mode === "edit")
    return (
      <DialogContent title={`Edit ${first}'s details`} description="To move them to another team, use Organisation.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label="Hours a day">
              <Input type="number" min={1} max={16} value={f.capacityHours} onChange={(e) => setF({ ...f, capacityHours: Number(e.target.value) || 8 })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {f.role && (
              <Field label="Role" hint="Managers can assign and review work for their team.">
                <Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: "employee", label: "Employee" }, { value: "manager", label: "Manager" }]} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
              </Field>
            )}
            <Field label="Works">
              <Segmented value={f.workType} onChange={(v) => setF({ ...f, workType: v })} options={[{ value: "desk", label: "Desk" }, { value: "field", label: "Field" }]} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
            </Field>
          </div>
        </div>
        {footer("Save", () => go(() => call(`/api/people/${p.id}`, "PATCH", f), "Saved"))}
      </DialogContent>
    );

  if (mode === "reset")
    return (
      <DialogContent title={`Reset ${first}'s password?`} description={`${first} is signed out on every device and gets a new temporary password from you.`}>
        {footer("Reset password", () => go(async () => setPassword((await call(`/api/people/${p.id}/password`, "POST")).password!)))}
      </DialogContent>
    );

  if (mode === "deactivate")
    return (
      <DialogContent title={`Deactivate ${first}?`} description={`${first} can no longer sign in and stops receiving reminders. Their history and reports stay. You can reactivate them later.`}>
        {(openTasks > 0 || leads.length > 0) && (
          <div className="space-y-1 rounded-[var(--radius-md)] bg-heat-1-tint px-3.5 py-3 text-[13.5px] text-text">
            {openTasks > 0 && <p>{first} still has {openTasks} open task{openTasks === 1 ? "" : "s"}. Hand them over first so nothing is dropped.</p>}
            {leads.length > 0 && <p>{first} leads {leads.join(", ")}. Pick someone else in Organisation.</p>}
          </div>
        )}
        {footer("Deactivate", () => go(() => call(`/api/people/${p.id}`, "PATCH", { active: false }), `${first} deactivated`), "dangerSolid")}
      </DialogContent>
    );

  return (
    <DialogContent title={`Reactivate ${first}?`} description={`${first} can sign in again with their old password. Reset it if they've forgotten it.`}>
      {footer("Reactivate", () => go(() => call(`/api/people/${p.id}`, "PATCH", { active: true }), `${first} is back`))}
    </DialogContent>
  );
}
