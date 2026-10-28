"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Eraser, KeyRound, Link2, Loader2, Mail, Trash2, UserMinus, UserPlus, UserRoundCheck, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useShallow } from "zustand/react/shallow";
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

export function AddPersonDialog({ open, onOpenChange, onInvited }: { open: boolean; onOpenChange: (o: boolean) => void; onInvited?: () => void }) {
  const [how, setHow] = React.useState<"invite" | "create">("invite");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open &&
        (how === "invite" ? (
          <InviteForm onDone={() => onOpenChange(false)} onInvited={onInvited} switcher={<HowSwitch how={how} setHow={setHow} />} />
        ) : (
          <AddPersonForm onDone={() => onOpenChange(false)} switcher={<HowSwitch how={how} setHow={setHow} />} />
        ))}
    </Dialog>
  );
}

function HowSwitch({ how, setHow }: { how: "invite" | "create"; setHow: (h: "invite" | "create") => void }) {
  return (
    <Segmented
      value={how}
      onChange={setHow}
      options={[
        { value: "invite", label: "Send an invite" },
        { value: "create", label: "Create the account myself" },
      ]}
      className="mb-5 w-full [&>button]:flex-1 [&>button]:justify-center"
    />
  );
}

function TeamSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No team yet</option>
      {departments.map((d) => (
        <optgroup key={d.id} label={d.name}>
          {teams
            .filter((t) => t.departmentId === d.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

interface MadeInvite {
  code: string;
  link: string;
  email: string | null;
  emailed: boolean;
}

/** invite by email, or make a code to hand over; they choose their own password */
function InviteForm({ onDone, onInvited, switcher }: { onDone: () => void; onInvited?: () => void; switcher: React.ReactNode }) {
  const teams = useApp((s) => s.teams);
  const [f, setF] = React.useState({ email: "", title: "", role: "employee" as "employee" | "manager", teamId: teams[0]?.id ?? "", workType: "desk" as "desk" | "field" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [made, setMade] = React.useState<MadeInvite | null>(null);
  const [copied, setCopied] = React.useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  if (made) {
    const text = `You're invited to join us on Pulse.\nOpen: ${made.link}\nOr enter the code ${made.code} at ${window.location.origin}/join\nThe invite works for 7 days.`;
    return (
      <DialogContent
        title="Invite ready"
        description={made.emailed ? `We emailed the link to ${made.email}. You can also share it yourself.` : "Share this link or code. They choose their own password when they open it."}
      >
        <div className="space-y-3 rounded-[var(--radius-md)] border border-line bg-sunken p-4 text-[14px]">
          <p className="flex items-center gap-2">
            <span className="text-muted">Code:</span> <span className="font-mono text-[18px] font-semibold tracking-[0.2em]">{made.code}</span>
          </p>
          <p className="break-all text-[13px] text-muted">{made.link}</p>
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
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy invite"}
          </Button>
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </DialogContent>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't go through.");
      setMade(data.invite);
      onInvited?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent title="Add a person" description="They get a link or code, set up their own account, and land in the right team.">
      {switcher}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Work email (optional)" hint="We email the link when email is set up. Leave it empty to get a code you share yourself.">
          <Input type="email" autoFocus value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="bilal@company.com" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team">
            <TeamSelect value={f.teamId} onChange={(teamId) => set({ teamId })} />
          </Field>
          <Field label="Job title (optional)">
            <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sales Officer" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Segmented
              value={f.role}
              onChange={(v) => set({ role: v })}
              options={[
                { value: "employee", label: "Employee" },
                { value: "manager", label: "Manager" },
              ]}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
            />
          </Field>
          <Field label="Works">
            <Segmented
              value={f.workType}
              onChange={(v) => set({ workType: v })}
              options={[
                { value: "desk", label: "Desk" },
                { value: "field", label: "Field" },
              ]}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
            />
          </Field>
        </div>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : f.email.trim() ? <Mail /> : <Link2 />} {f.email.trim() ? "Send invite" : "Make invite code"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

interface InviteRow {
  id: string;
  code: string;
  email: string | null;
  role: string;
  teamId: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

/** open invites, so the owner can see who hasn't joined and cancel what's no longer needed */
export function PendingInvites({ refresh }: { refresh: number }) {
  const teams = useApp((s) => s.teams);
  const [rows, setRows] = React.useState<InviteRow[] | null>(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    fetch("/api/invites", { cache: "no-store" })
      .then((x) => (x.ok ? x.json() : null))
      .then((r) => live && setRows(r?.invites ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [refresh, reload]);
  const load = () => setReload((n) => n + 1);
  const [now] = React.useState(() => Date.now());
  const open = (rows ?? []).filter((r) => !r.usedAt && !r.revokedAt && new Date(r.expiresAt).getTime() > now);
  if (!open.length) return null;
  return (
    <details className="mt-8 rounded-[var(--radius-lg)] border border-line bg-surface" open>
      <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium sm:px-5">Invites not used yet ({open.length})</summary>
      <ul className="border-t border-line">
        {open.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0 sm:px-5">
            <span className="font-mono text-[14px] font-semibold tracking-[0.15em]">{r.code}</span>
            <span className="min-w-0 flex-1 text-[13px] text-muted">
              {r.email ?? "Anyone with the code"}, {r.role === "manager" ? "manager" : "employee"}
              {r.teamId ? ` in ${teams.find((t) => t.id === r.teamId)?.name ?? "a team"}` : ""}. Expires in {formatDistanceToNowStrict(new Date(r.expiresAt))}.
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const res = await fetch(`/api/invites/${r.id}`, { method: "DELETE" });
                if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't cancel it.");
                else {
                  toast.success("Invite cancelled");
                  void load();
                }
              }}
            >
              <X /> Cancel invite
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AddPersonForm({ onDone, switcher }: { onDone: () => void; switcher: React.ReactNode }) {
  const teams = useApp((s) => s.teams);
  const [f, setF] = React.useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    role: "employee" as "employee" | "manager",
    teamId: teams[0]?.id ?? "",
    workType: "desk" as "desk" | "field",
    capacityHours: 8,
  });
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
      {switcher}
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
          <TeamSelect value={f.teamId} onChange={(teamId) => set({ teamId })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Role">
            <Segmented
              value={f.role}
              onChange={(v) => set({ role: v })}
              options={[
                { value: "employee", label: "Employee" },
                { value: "manager", label: "Manager" },
              ]}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
            />
          </Field>
          <Field label="Works">
            <Segmented
              value={f.workType}
              onChange={(v) => set({ workType: v })}
              options={[
                { value: "desk", label: "Desk" },
                { value: "field", label: "Field" },
              ]}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
            />
          </Field>
          <Field label="Hours a day">
            <Input type="number" min={1} max={16} value={f.capacityHours} onChange={(e) => set({ capacityHours: Number(e.target.value) || 8 })} />
          </Field>
        </div>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !f.name.trim() || !f.email.trim() || !f.title.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} Add person
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

type Mode = "edit" | "reset" | "deactivate" | "reactivate" | "delete" | "purge";

/** owner-only actions on one person */
export function StaffActions({ person }: { person: Person }) {
  const [mode, setMode] = React.useState<Mode | null>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {person.active !== false ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>
              Edit details
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode("reset")}>
              <KeyRound /> Reset password
            </Button>
            {person.role !== "owner" && (
              <Button size="sm" variant="danger" onClick={() => setMode("deactivate")}>
                <UserMinus /> Deactivate
              </Button>
            )}
            {person.role !== "owner" && (
              <Button size="sm" variant="ghost" onClick={() => setMode("delete")}>
                <Trash2 /> Delete
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => setMode("reactivate")}>
              <UserRoundCheck /> Reactivate
            </Button>
            {!person.contactPurgedAt && (
              <Button size="sm" variant="ghost" onClick={() => setMode("purge")}>
                <Eraser /> Wipe contact details
              </Button>
            )}
          </>
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
  const leads = useApp(useShallow((s) => [...s.teams.filter((t) => t.leadId === p.id).map((t) => t.name), ...s.departments.filter((d) => d.headId === p.id).map((d) => d.name)]));
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

  const footer = (label: string, onClick: () => void, variant: "primary" | "dangerSolid" = "primary", blocked = false) => (
    <>
      {error && <p className="mt-3 text-[13px] text-heat-3">{error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onClick} disabled={busy || blocked}>
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
                <Segmented
                  value={f.role}
                  onChange={(v) => setF({ ...f, role: v })}
                  options={[
                    { value: "employee", label: "Employee" },
                    { value: "manager", label: "Manager" },
                  ]}
                  className="w-full [&>button]:flex-1 [&>button]:justify-center"
                />
              </Field>
            )}
            <Field label="Works">
              <Segmented
                value={f.workType}
                onChange={(v) => setF({ ...f, workType: v })}
                options={[
                  { value: "desk", label: "Desk" },
                  { value: "field", label: "Field" },
                ]}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
              />
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
            {openTasks > 0 && (
              <p>
                {first} still has {openTasks} open task{openTasks === 1 ? "" : "s"}. They move to you when you deactivate, along with any reviews, so nothing is dropped. You can hand them on from
                Tasks.
              </p>
            )}
            {leads.length > 0 && (
              <p>
                {first} runs {leads.join(", ")}. Choose someone else in Organisation first, so escalations still reach a person.
              </p>
            )}
          </div>
        )}
        {footer("Deactivate", () => go(() => call(`/api/people/${p.id}`, "PATCH", { active: false }), `${first} deactivated`), "dangerSolid", leads.length > 0)}
      </DialogContent>
    );

  if (mode === "delete")
    return (
      <DialogContent
        title={`Delete ${first}?`}
        description={`Only for someone added by mistake. If ${first} has been given work, checked in or done anything, Pulse keeps their record and you should deactivate them instead.`}
      >
        {footer("Delete for good", () => go(() => call(`/api/people/${p.id}`, "DELETE"), `${first} deleted`), "dangerSolid")}
      </DialogContent>
    );

  if (mode === "purge")
    return (
      <DialogContent
        title={`Wipe ${first}'s contact details?`}
        description={`Their phone number and availability note are removed for good. Their name, work history and reports stay, so past records still make sense.`}
      >
        {footer(
          "Wipe contact details",
          () =>
            go(async () => {
              const r = useApp.getState().act({ type: "purgeContact", personId: p.id });
              if (!r.ok) throw new Error(r.error);
            }, "Contact details wiped"),
          "dangerSolid",
        )}
      </DialogContent>
    );

  return (
    <DialogContent title={`Reactivate ${first}?`} description={`${first} can sign in again with their old password. Reset it if they've forgotten it.`}>
      {footer("Reactivate", () => go(() => call(`/api/people/${p.id}`, "PATCH", { active: true }), `${first} is back`))}
    </DialogContent>
  );
}
