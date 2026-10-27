"use client";

import * as React from "react";
import { toast } from "sonner";
import { Clock4, Pencil, ShieldCheck, Users } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useApp, useMeId } from "@/lib/store";
import type { Person, WorkSchedule } from "@/lib/types";
import { scheduleFor } from "@/domain/time";
import { backupFor } from "@/domain/world";
import { Button } from "@/components/ui/button";
import { Checkbox, Dialog, DialogContent, Field, Select } from "@/components/ui/primitives";
import { TimeZoneSelect, WorkHoursFields, offsetLabel } from "@/components/app/work-hours";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon to Sat, 09:00 to 18:00" */
export function describeDays(days: number[]) {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const idx = order.map((d) => [1, 2, 3, 4, 5, 6, 0].indexOf(d));
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return run && order.length > 2 ? `${DAY[order[0]]} to ${DAY[order[order.length - 1]]}` : order.map((d) => DAY[d]).join(", ");
}

/**
 * How someone works: their hours and time zone (own, department's or the
 * company's), the other teams they help in, and who covers when they're away.
 */
export function WorkPattern({ person: p, canEdit, canEditTeams }: { person: Person; canEdit: boolean; canEditTeams: boolean }) {
  const w = useApp(useShallow((s) => ({ settings: s.settings, people: s.people, departments: s.departments, teams: s.teams })));
  const [open, setOpen] = React.useState(false);
  const sc = scheduleFor(w, p.id);
  const dept = w.departments.find((d) => d.id === p.departmentId);
  const source =
    p.schedule && (p.schedule.workDays || p.schedule.workStart || p.schedule.workEnd)
      ? "own hours"
      : dept?.settings && (dept.settings.workDays || dept.settings.workStart || dept.settings.workEnd)
        ? `${dept.name} hours`
        : "company hours";
  const cover = w.people.find((x) => x.id === backupFor(w, p.id));
  const named = !!p.backupId && cover?.id === p.backupId;
  const extra = (p.secondaryTeamIds ?? []).map((id) => w.teams.find((t) => t.id === id)?.name).filter(Boolean);
  const first = p.name.split(" ")[0];
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-text">How {first} works</h3>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Pencil /> Change
          </Button>
        )}
      </div>
      <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line text-[13.5px]">
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="flex items-center gap-2 text-muted">
            <Clock4 className="size-4 text-faint" /> Hours
          </dt>
          <dd className="text-right">
            {describeDays(sc.workDays)}, {sc.workStart} to {sc.workEnd}
            <span className="block text-[12px] text-muted">
              {source}
              {sc.timezone !== w.settings.timezone ? `, ${sc.timezone.replace(/_/g, " ")} (${offsetLabel(sc.timezone)})` : ""}
            </span>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="flex items-center gap-2 text-muted">
            <ShieldCheck className="size-4 text-faint" /> Covers when away
          </dt>
          <dd className="text-right">
            {cover?.name ?? "Nobody yet"}
            <span className="block text-[12px] text-muted">{named ? "named backup" : "team lead, then department head"}</span>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <dt className="flex items-center gap-2 text-muted">
            <Users className="size-4 text-faint" /> Also works in
          </dt>
          <dd className="text-right">{extra.length ? extra.join(", ") : <span className="text-muted">Only their home team</span>}</dd>
        </div>
      </dl>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent title={`How ${first} works`} description="Anything left as usual follows their department, then the company.">
            <PatternForm person={p} canEditTeams={canEditTeams} onDone={() => setOpen(false)} />
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function PatternForm({ person: p, canEditTeams, onDone }: { person: Person; canEditTeams: boolean; onDone: () => void }) {
  const s = useApp(useShallow((x) => ({ settings: x.settings, people: x.people, departments: x.departments, teams: x.teams, act: x.act, role: x.role })));
  const meId = useMeId();
  const dept = s.departments.find((d) => d.id === p.departmentId)?.settings;
  const inherited = { workDays: dept?.workDays ?? s.settings.workDays, workStart: dept?.workStart ?? s.settings.workStart, workEnd: dept?.workEnd ?? s.settings.workEnd };
  const [hours, setHours] = React.useState<Pick<WorkSchedule, "workDays" | "workStart" | "workEnd">>({
    workDays: p.schedule?.workDays,
    workStart: p.schedule?.workStart,
    workEnd: p.schedule?.workEnd,
  });
  const [tz, setTz] = React.useState(p.schedule?.timezone ?? "");
  const [backup, setBackup] = React.useState(p.backupId ?? "");
  const [teamIds, setTeamIds] = React.useState<string[]>(p.secondaryTeamIds ?? []);
  const [error, setError] = React.useState<string | null>(null);
  const otherTeams = s.teams.filter((t) => t.id !== p.teamId && (s.role === "owner" || t.departmentId === p.departmentId));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if ((hours.workEnd ?? inherited.workEnd) <= (hours.workStart ?? inherited.workStart)) return setError("The day has to end after it starts.");
    const schedule: WorkSchedule = { ...hours, ...(tz ? { timezone: tz } : {}) };
    const clean = Object.fromEntries(Object.entries(schedule).filter(([, v]) => v !== undefined && v !== "")) as WorkSchedule;
    const steps = [
      JSON.stringify(clean) !== JSON.stringify(p.schedule ?? {}) ? () => s.act({ type: "setPersonSchedule", personId: p.id, schedule: Object.keys(clean).length ? clean : null }) : null,
      (backup || null) !== (p.backupId ?? null) ? () => s.act({ type: "setBackup", personId: p.id, backupId: backup || null }) : null,
      canEditTeams && JSON.stringify([...teamIds].sort()) !== JSON.stringify([...(p.secondaryTeamIds ?? [])].sort()) ? () => s.act({ type: "setSecondaryTeams", personId: p.id, teamIds }) : null,
    ].filter(Boolean) as (() => { ok: boolean })[];
    for (const step of steps) if (!step().ok) return;
    if (steps.length) toast.success("Saved", { description: "Reminders and lateness follow the new pattern from now on." });
    onDone();
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <section>
        <h4 className="mb-2 text-[13.5px] font-medium text-text">Working hours</h4>
        <WorkHoursFields idPrefix="person" value={hours} onChange={setHours} inherited={inherited} />
      </section>
      <Field label="Time zone" htmlFor="person-tz" hint="For someone working remotely. Their reminders, lateness and morning brief follow their own clock.">
        <TimeZoneSelect id="person-tz" value={tz} onChange={setTz} inheritLabel={`Company time zone (${s.settings.timezone.replace(/_/g, " ")})`} />
      </Field>
      <Field label="Covers when they're away" htmlFor="person-backup" hint="New work goes to this person while they're on leave.">
        <Select id="person-backup" value={backup} onChange={(e) => setBackup(e.target.value)}>
          <option value="">Their team lead (or department head)</option>
          {s.people
            .filter((x) => x.active !== false && x.id !== p.id)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}, {x.title}
                {x.id === meId ? " (you)" : ""}
              </option>
            ))}
        </Select>
      </Field>
      {canEditTeams && otherTeams.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-[13.5px] font-medium text-text">Also works in</legend>
          <p className="mb-2 text-[12.5px] leading-snug text-muted">Their home team stays where escalations go. Leads of these teams can see and give them work too.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {otherTeams.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-[13.5px]">
                <Checkbox checked={teamIds.includes(t.id)} onCheckedChange={(v) => setTeamIds((cur) => (v ? [...cur, t.id] : cur.filter((x) => x !== t.id)))} />
                {t.name}
                <span className="ml-auto text-[12px] text-faint">{s.departments.find((d) => d.id === t.departmentId)?.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="text-[13px] text-heat-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
  );
}
