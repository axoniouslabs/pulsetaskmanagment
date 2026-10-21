"use client";

import * as React from "react";
import { subDays, format } from "date-fns";
import { toast } from "sonner";
import { BellOff, CalendarOff, CheckCircle2, Globe, Mail, MapPin, Monitor, Phone, Plus, Smartphone, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { DailyStat } from "@/lib/seed";
import type { Device, Person } from "@/lib/types";
import { NEXT_UP_SCORE, committedHours, isActive } from "@/lib/selectors";
import { ago, cn, minutesToLabel, pct, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bar, Sheet, SheetClose } from "@/components/ui/primitives";
import { SectionHeading } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { TaskList, TaskRow } from "@/components/app/task-row";
import { AttendanceText, LOAD_STYLE, LeaveTag, WorkTag, backupOf, deviceNoun, fmtHours, loadTone } from "./shared";

export function PersonPanel({ personId, onClose }: { personId: string | null; onClose: () => void }) {
  const person = useApp((s) => (personId ? s.people.find((p) => p.id === personId) : undefined));
  return (
    <Sheet open={!!person} onOpenChange={(o) => !o && onClose()} title={person?.name ?? "Person"}>
      {person && <PersonDetail person={person} />}
    </Sheet>
  );
}

function PersonDetail({ person: p }: { person: Person }) {
  const now = useNow();
  const { role, meId, allPeople, allTasks, teams, departments } = useScope();
  const attendance = useApp((s) => s.attendance);
  const setOnLeave = useApp((s) => s.setOnLeave);
  const openCreate = useApp((s) => s.openCreate);
  const team = teams.find((t) => t.id === p.teamId);
  const dept = departments.find((d) => d.id === p.departmentId);
  const backup = backupOf(p, allPeople, teams, departments);
  const first = p.name.split(" ")[0];
  const canManage = (role === "owner" || role === "manager") && p.id !== meId;
  const att = attendance.find((a) => a.personId === p.id && a.date === format(now, "yyyy-MM-dd"));
  const hours = p.onLeave ? 0 : committedHours(allTasks, p.id, now);
  const tone = loadTone(hours, p.capacityHours);
  const open = React.useMemo(
    () => allTasks.filter((t) => t.assigneeId === p.id && isActive(t)).sort((a, b) => NEXT_UP_SCORE(a, now) - NEXT_UP_SCORE(b, now)),
    [allTasks, p.id, now],
  );
  const isLead = team?.leadId === p.id;
  const isHead = dept?.headId === p.id;

  const toggleLeave = () => {
    setOnLeave(p.id, !p.onLeave);
    if (p.onLeave) toast.success("Back from leave", { description: `Reminders for ${first} start again.` });
    else toast.success("Marked on leave", { description: `Reminders stopped. New tasks go to ${backup?.name.split(" ")[0] ?? "the team lead"}.` });
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-5 pb-5 pt-3 backdrop-blur sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">{team ? `${team.name} team` : "No team"}</p>
          <SheetClose className="-mr-2 rounded-[var(--radius-sm)] p-2 text-faint hover:bg-sunken hover:text-text" aria-label="Close">
            <X className="size-5" />
          </SheetClose>
        </div>
        <div className="mt-2 flex items-center gap-4">
          <Avatar person={p} size="xl" />
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold leading-tight text-text sm:text-[24px]">{p.name}</h2>
            <p className="mt-0.5 text-[14px] text-muted">
              {p.title}
              {isHead ? `, head of ${dept?.name}` : isLead ? `, leads ${team?.name}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <WorkTag person={p} />
              {p.onLeave && <LeaveTag />}
              {dept && <span className="text-[12.5px] text-muted">{dept.name} department</span>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {role !== "employee" && (
            <Button size="sm" variant="primary" onClick={() => openCreate({ assigneeId: p.id })}>
              <Plus /> Assign a task
            </Button>
          )}
          <Button size="sm" asChild>
            <a href={`mailto:${p.email}`}>
              <Mail /> Email
            </a>
          </Button>
          <Button size="sm" asChild>
            <a href={`tel:${p.phone.replace(/\s/g, "")}`}>
              <Phone /> Call
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-8 px-5 py-6 sm:px-7">
        {/* leave */}
        {canManage && (
          <section
            className={cn(
              "flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 sm:flex-row sm:items-center",
              p.onLeave ? "border-ink/15 bg-ink-tint/50" : "border-line",
            )}
          >
            <CalendarOff className={cn("size-5 shrink-0", p.onLeave ? "text-ink" : "text-faint")} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-text">{p.onLeave ? `${first} is on leave` : "Away for a while?"}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                {p.onLeave
                  ? `Reminders are paused and new tasks go to ${backup?.name ?? "the team lead"}. Mark ${first} back when they return.`
                  : `Reminders stop and new tasks go to ${backup?.name ?? "the team lead"}.`}
              </p>
            </div>
            <Button size="sm" variant={p.onLeave ? "primary" : "secondary"} onClick={toggleLeave}>
              {p.onLeave ? "Back from leave" : "Mark on leave"}
            </Button>
          </section>
        )}

        {/* today */}
        <section>
          <SectionHeading title="Today" />
          <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line text-[13.5px]">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Attendance</dt>
              <dd>
                <AttendanceText person={p} att={att} className="text-[13.5px]" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Committed hours</dt>
              <dd className="flex items-center gap-2.5">
                {p.onLeave ? (
                  <span className="text-faint">Away today</span>
                ) : (
                  <>
                    <Bar value={hours} max={p.capacityHours} tone={LOAD_STYLE[tone].bar} className="w-20" />
                    <span className={cn("tabular", tone === "over" ? "font-semibold text-heat-3" : tone === "full" ? "font-medium text-heat-1" : "text-text")}>
                      {fmtHours(hours)} of {p.capacityHours}h
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Email</dt>
              <dd className="min-w-0 truncate">
                <a className="text-ink hover:underline" href={`mailto:${p.email}`}>
                  {p.email}
                </a>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Phone</dt>
              <dd className="tabular">
                <a className="text-ink hover:underline" href={`tel:${p.phone.replace(/\s/g, "")}`}>
                  {p.phone}
                </a>
              </dd>
            </div>
            {backup && (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">Backup when away</dt>
                <dd className="flex items-center gap-2">
                  <Avatar person={backup} size="xs" />
                  {backup.name}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <PersonStats person={p} />

        {/* devices */}
        <section>
          <SectionHeading title="Devices" aside={plural(p.devices.length, "device")} />
          {p.devices.length ? (
            <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
              {p.devices.map((d) => (
                <DeviceLine key={d.id} device={d} first={first} />
              ))}
            </ul>
          ) : (
            <p className="rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-muted">
              No devices yet. Reminders reach {first} once they sign in to Pulse on a phone or PC.
            </p>
          )}
        </section>

        {/* open tasks */}
        <section>
          <SectionHeading
            title="Open tasks"
            aside={
              role !== "employee" ? (
                <Button size="sm" variant="ghost" className="-mr-2" onClick={() => openCreate({ assigneeId: p.id })}>
                  <Plus /> Assign a task
                </Button>
              ) : undefined
            }
          />
          {open.length ? (
            <TaskList>
              {open.map((t) => (
                <TaskRow key={t.id} task={t} showAssignee={false} />
              ))}
            </TaskList>
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-6 text-[13px] text-muted">
              <CheckCircle2 className="size-4 text-ok" /> Nothing open. Assign a task to give {first} something to do.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------------- device line ---------------- */
const DEVICE_ICON: Record<Device["kind"], React.ElementType> = { windows: Monitor, android: Smartphone, iphone: Smartphone, browser: Globe };

function DeviceLine({ device: d, first }: { device: Device; first: string }) {
  const Icon = DEVICE_ICON[d.kind];
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", d.healthy ? "bg-sunken text-muted" : "bg-heat-2-tint text-heat-2")}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-text">{d.label}</p>
        <p className="text-[12.5px] text-muted">Last seen {ago(d.lastSeen)}</p>
        {!d.healthy && (
          <p className="mt-1 text-[12.5px] leading-snug text-text/80">
            Ask {first} to open Pulse on this {deviceNoun(d).toLowerCase()} and allow notifications. Until then, reminders go to their other devices.
          </p>
        )}
      </div>
      {d.healthy ? (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-ok">
          <span className="size-1.5 rounded-full bg-ok" aria-hidden /> Receiving
        </span>
      ) : (
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-heat-2">
          <BellOff className="size-3.5" /> Not receiving
        </span>
      )}
    </li>
  );
}

/* ---------------- four-week stats ---------------- */
interface Agg {
  assigned: number;
  approved: number;
  onTime: number;
  ackFirst: number;
  submissions: number;
  rejections: number;
  est: number;
  actual: number;
  escalations: number;
  ack: number[];
}

function aggregate(rows: DailyStat[]): Agg {
  const a: Agg = { assigned: 0, approved: 0, onTime: 0, ackFirst: 0, submissions: 0, rejections: 0, est: 0, actual: 0, escalations: 0, ack: [] };
  for (const r of rows) {
    a.assigned += r.assigned;
    a.approved += r.approved;
    a.onTime += r.onTime;
    a.ackFirst += r.ackFirst;
    a.submissions += r.submissions;
    a.rejections += r.rejections;
    a.est += r.estHours;
    a.actual += r.actualHours;
    a.escalations += r.escalations;
    a.ack.push(r.ackMinutes);
  }
  return a;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function metricsOf(a: Agg) {
  return {
    completion: `${pct(a.approved, a.assigned)}%`,
    onTime: a.approved ? `${pct(a.onTime, a.approved)}%` : "None yet",
    ackMedian: minutesToLabel(median(a.ack)),
    ackMean: minutesToLabel(mean(a.ack)),
    firstReminder: `${Math.min(100, pct(a.ackFirst, a.assigned))}%`,
    rework: a.submissions ? `${pct(a.rejections, a.submissions)}%` : "None yet",
    estimate: a.est ? `${(a.actual / a.est).toFixed(1)}×` : "None yet",
    escalations: String(a.escalations),
  };
}

function PersonStats({ person: p }: { person: Person }) {
  const stats = useApp((s) => s.stats);
  const people = useApp((s) => s.people);
  const { mine, peers } = React.useMemo(() => {
    const since = format(subDays(new Date(), 28), "yyyy-MM-dd");
    const recent = stats.filter((s) => s.date > since);
    const peerIds = new Set(people.filter((x) => x.role !== "owner" && x.id !== p.id && x.workType === p.workType).map((x) => x.id));
    const own = recent.filter((s) => s.personId === p.id);
    return {
      mine: own.length ? metricsOf(aggregate(own)) : null,
      peers: peerIds.size ? metricsOf(aggregate(recent.filter((s) => peerIds.has(s.personId)))) : null,
    };
  }, [stats, people, p.id, p.workType]);

  const first = p.name.split(" ")[0];
  const field = p.workType === "field";
  const peerLabel = field ? "Field staff" : "Desk staff";

  if (!mine)
    return (
      <section>
        <SectionHeading title="Last 4 weeks" />
        <p className="rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
          No history yet. Numbers appear after {first}&apos;s first week of assigned tasks.
        </p>
      </section>
    );

  const rows: { label: string; value: string; peer?: string; note: string }[] = [
    { label: "Completion rate", value: mine.completion, peer: peers?.completion, note: "Assigned tasks that were finished and approved." },
    { label: "On time", value: mine.onTime, peer: peers?.onTime, note: "Finished tasks that were approved before their deadline." },
    {
      label: "Time to acknowledge",
      value: mine.ackMedian,
      peer: peers?.ackMedian,
      note: `Typical wait between a task arriving and ${first} tapping Acknowledge. Average ${mine.ackMean}.`,
    },
    { label: "Answered the first reminder", value: mine.firstReminder, peer: peers?.firstReminder, note: "Tasks acknowledged without needing a second reminder." },
    { label: "Sent back for changes", value: mine.rework, peer: peers?.rework, note: "Submissions the reviewer returned. Lower is better." },
    { label: "Estimate accuracy", value: mine.estimate, peer: peers?.estimate, note: "Actual hours against estimated hours. 1.0× is spot on, higher means work took longer." },
    { label: "Escalations", value: mine.escalations, peer: peers?.escalations, note: "Times silence moved a task up to the team lead or higher." },
  ];

  return (
    <section>
      <SectionHeading title="Last 4 weeks" aside={peers ? `Compared with other ${peerLabel.toLowerCase()}` : undefined} />
      {field && (
        <p className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-sunken px-3.5 py-3 text-[13px] leading-snug text-text/85">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
          {first} works in the field. Response times are compared with other field staff, not desk staff.
        </p>
      )}
      <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <dt className="text-[14px] font-medium text-text">{r.label}</dt>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{r.note}</p>
            </div>
            <dd className="shrink-0 text-right">
              <span className="tabular block font-display text-[20px] font-semibold leading-none text-text">{r.value}</span>
              {r.peer && (
                <span className="tabular mt-1.5 block whitespace-nowrap text-[12px] text-faint">
                  {peerLabel} {r.peer}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
