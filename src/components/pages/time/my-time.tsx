"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, isToday, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { CalendarDays, LogIn, LogOut, Plus, TreePalm } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { Leave } from "@/lib/types";
import { cn, minutesToLabel, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bar } from "@/components/ui/primitives";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { LeaveDialog } from "./leave-dialog";
import {
  LEAVE_LABEL,
  STATUS_META,
  approvedLeaveOn,
  approverFor,
  backOn,
  day,
  leaveDays,
  leaveRange,
  minutesLate,
  startLabel,
  time,
  workedMinutes,
  type DayStatus,
} from "./lib";

export function MyTime() {
  const now = useNow(30000);
  const today = format(now, "yyyy-MM-dd");
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-8">
        <TodayCard now={now} today={today} />
        <WeekSheet now={now} today={today} />
      </div>
      <aside className="space-y-6">
        <MyLeave today={today} />
        <UpcomingHolidays now={now} today={today} />
      </aside>
    </div>
  );
}

/* ---------- today: check in / out ---------- */
function TodayCard({ now, today }: { now: Date; today: string }) {
  const { me, meId } = useScope();
  const att = useApp((s) => s.attendance.find((a) => a.personId === meId && a.date === today));
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const checkIn = useApp((s) => s.checkIn);
  const checkOut = useApp((s) => s.checkOut);
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const managerName = approverFor({ people, teams, departments }, meId)?.name.split(" ")[0] ?? "your manager";

  const leave = approvedLeaveOn(leaves, meId, today) ?? (me.onLeave && !att?.checkIn ? ({ to: today } as Leave) : undefined);
  const holiday = settings.holidays.find((h) => h.date === today);
  const dayOff = !settings.workDays.includes(now.getDay()) || !!holiday;
  const worked = workedMinutes(att, now);
  const late = att?.status === "late" ? minutesLate(att, settings) : 0;
  const target = me.capacityHours * 60;

  const doCheckIn = () => {
    checkIn();
    toast.success("Checked in", { description: `at ${format(new Date(), "h:mm a")}` });
  };
  const doCheckOut = () => {
    checkOut();
    toast("Checked out", { description: "Any running timer was stopped." });
  };

  return (
    <Panel className="p-5 sm:p-6">
      <p className="text-[13.5px] text-muted">Today, {format(now, "EEEE d MMMM")}</p>

      {att?.checkIn ? (
        <>
          <div className="mt-1.5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="tabular font-display text-[36px] font-semibold leading-none text-text">{minutesToLabel(worked)}</span>
                <span className="text-[14px] text-muted">{att.checkOut ? "worked" : "so far"}</span>
              </p>
              <p className="mt-2 text-[14px] text-text">
                <span className="inline-flex items-center gap-1.5">
                  {!att.checkOut && <span className="size-2 animate-pulse-dot rounded-full bg-ok" aria-hidden />}
                  Checked in at <span className="tabular font-medium">{time(att.checkIn)}</span>
                </span>
                {late > 0 && <span className="font-medium text-heat-1">, {late} min late</span>}
                {att.checkOut && (
                  <>
                    , out at <span className="tabular font-medium">{time(att.checkOut)}</span>
                  </>
                )}
              </p>
            </div>
            {!att.checkOut ? (
              <Button size="lg" onClick={doCheckOut} className="self-start sm:self-auto">
                <LogOut /> Check out
              </Button>
            ) : (
              <p className="text-[13px] text-muted">See you tomorrow.</p>
            )}
          </div>
          <div className="mt-5">
            <Bar value={worked} max={target} tone={worked >= target ? "ok" : "ink"} />
            <div className="mt-1.5 flex justify-between text-[12px] text-faint">
              <span>Starts {startLabel(settings.workStart)}</span>
              <span className="tabular">{minutesToLabel(target)} day</span>
            </div>
          </div>
        </>
      ) : leave ? (
        <div className="mt-1.5 flex items-start gap-3">
          <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
            <TreePalm className="size-5" />
          </span>
          <div>
            <p className="font-display text-[26px] font-semibold leading-tight">You&apos;re on leave today</p>
            <p className="mt-1 text-[14px] text-muted">
              Reminders are paused. Back on {format(backOn(leave, settings), "EEEE d MMM")}.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-[26px] font-semibold leading-tight sm:text-[28px]">{dayOff ? "It's a day off" : "Not checked in yet"}</p>
            <p className="mt-1 max-w-[52ch] text-[14px] leading-snug text-muted">
              {dayOff
                ? `${holiday ? holiday.name : "Sunday"}. Pulse isn't sending reminders today.`
                : `Your day starts at ${startLabel(settings.workStart)}. Check in when you start so ${managerName} knows you're here.`}
            </p>
          </div>
          <Button variant={dayOff ? "secondary" : "primary"} size="lg" onClick={doCheckIn} className="self-start sm:self-auto">
            <LogIn /> {dayOff ? "Check in anyway" : "Check in"}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/* ---------- this week ---------- */
function WeekSheet({ now, today }: { now: Date; today: string }) {
  const { meId } = useScope();
  const attendance = useApp((s) => s.attendance);
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const activity = useApp((s) => s.activity);
  const tasks = useApp((s) => s.tasks);
  const timer = useApp((s) => s.timers[meId]);

  /* approximate: total time logged on tasks you touched today, plus a running timer */
  const taskMinutes = React.useMemo(() => {
    const touched = new Set(activity.filter((a) => a.actorId === meId && a.taskId && isToday(new Date(a.at))).map((a) => a.taskId!));
    if (timer) touched.add(timer.taskId);
    const logged = tasks.filter((t) => t.assigneeId === meId && touched.has(t.id)).reduce((s, t) => s + t.loggedMinutes, 0);
    const running = timer ? Math.max(0, Math.round((now.getTime() - new Date(timer.startedAt).getTime()) / 60000)) : 0;
    return logged + running;
  }, [activity, tasks, timer, meId, now]);

  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const rows = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(monday, i);
    const date = format(d, "yyyy-MM-dd");
    const rec = attendance.find((a) => a.personId === meId && a.date === date);
    const holiday = settings.holidays.find((h) => h.date === date);
    const leave = approvedLeaveOn(leaves, meId, date);
    const future = date > today;
    const status: DayStatus | "upcoming" | "none" = rec?.checkIn
      ? rec.status
      : rec && rec.status !== "present"
        ? rec.status
        : holiday
          ? "holiday"
          : leave
            ? "leave"
            : future
              ? "upcoming"
              : date === today
                ? "upcoming"
                : "none";
    return { d, date, rec, holiday, status, isToday: date === today, worked: workedMinutes(rec, now) };
  });
  const total = rows.reduce((s, r) => s + r.worked, 0);
  const lateDays = rows.filter((r) => r.status === "late").length;

  const statusText = (r: (typeof rows)[number]) =>
    r.status === "upcoming"
      ? r.isToday
        ? "Not in yet"
        : "Upcoming"
      : r.status === "none"
        ? "No record"
        : r.status === "holiday"
          ? r.holiday?.name ?? "Holiday"
          : STATUS_META[r.status].label;
  const statusCls = (r: (typeof rows)[number]) =>
    r.status === "upcoming" || r.status === "none" ? "text-faint" : STATUS_META[r.status].text;

  return (
    <section>
      <SectionHeading
        title="This week"
        aside={
          <span className="tabular">
            {minutesToLabel(total)} worked{lateDays ? <span className="text-heat-1">, late {lateDays === 1 ? "once" : `${lateDays} times`}</span> : ""}
          </span>
        }
      />
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(120px,1.3fr)_1fr_0.9fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-line bg-[#fafbfb] px-5 py-2.5 text-[12.5px] font-medium text-muted sm:grid">
          <span>Day</span>
          <span>Status</span>
          <span>In</span>
          <span>Out</span>
          <span className="text-right">Worked</span>
          <span className="text-right">On tasks</span>
        </div>
        <ul>
          {rows.map((r) => {
            const inOut = r.rec?.checkIn ? `${time(r.rec.checkIn)}${r.rec.checkOut ? ` to ${time(r.rec.checkOut)}` : ""}` : "";
            const worked = r.worked ? `${minutesToLabel(r.worked)}${r.isToday && !r.rec?.checkOut ? " so far" : ""}` : "–";
            const onTasks = r.isToday ? (taskMinutes ? `~${minutesToLabel(taskMinutes)}` : "None yet") : "–";
            return (
              <li key={r.date} className={cn("border-b border-line px-5 py-3 last:border-b-0", r.isToday && "bg-ink-tint/40")}>
                {/* phone */}
                <div className="flex items-start justify-between gap-3 sm:hidden">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-text">
                      {format(r.d, "EEE d MMM")}
                      {r.isToday && <span className="font-normal text-muted">, today</span>}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <span className={cn("font-medium", statusCls(r))}>{statusText(r)}</span>
                      {inOut && <span className="tabular">, {inOut}</span>}
                    </p>
                    {r.isToday && <p className="mt-0.5 text-[12.5px] text-faint">On tasks: {onTasks}</p>}
                  </div>
                  <p className="tabular shrink-0 text-[14px] font-medium text-text">{worked}</p>
                </div>
                {/* tablet and up */}
                <div className="hidden grid-cols-[minmax(120px,1.3fr)_1fr_0.9fr_0.9fr_0.9fr_0.9fr] items-center gap-3 text-[13.5px] sm:grid">
                  <span className="font-medium text-text">
                    {format(r.d, "EEE d MMM")}
                    {r.isToday && <span className="font-normal text-muted">, today</span>}
                  </span>
                  <span className={cn("truncate font-medium", statusCls(r))}>{statusText(r)}</span>
                  <span className="tabular text-text">{r.rec?.checkIn ? time(r.rec.checkIn) : <span className="text-faint">–</span>}</span>
                  <span className="tabular text-text">{r.rec?.checkOut ? time(r.rec.checkOut) : <span className="text-faint">–</span>}</span>
                  <span className={cn("tabular text-right", r.worked ? "text-text" : "text-faint")}>{worked}</span>
                  <span className={cn("tabular text-right", r.isToday && taskMinutes ? "text-text" : "text-faint")}>{onTasks}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
        Worked time is check-in to check-out minus breaks. Time on tasks comes from task timers, so it&apos;s approximate and only shown for today.
      </p>
    </section>
  );
}

/* ---------- my leave ---------- */
const LEAVE_STATUS = {
  approved: { label: "Approved", cls: "bg-ok-tint text-ok" },
  pending: { label: "Waiting", cls: "bg-info-tint text-info" },
  declined: { label: "Declined", cls: "bg-sunken text-faint" },
} as const;

function MyLeave({ today }: { today: string }) {
  const { meId } = useScope();
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const approver = approverFor({ people, teams, departments }, meId);
  const approverName = approver?.name.split(" ")[0] ?? "your manager";
  const [open, setOpen] = React.useState(false);

  const mine = React.useMemo(
    () =>
      leaves
        .filter((l) => l.personId === meId)
        .sort((a, b) => Number(b.to >= today) - Number(a.to >= today) || b.from.localeCompare(a.from)),
    [leaves, meId, today],
  );

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <h2 className="text-[15px] font-semibold text-text">My leave</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Request leave
        </Button>
      </div>
      {mine.length ? (
        <ul className="mt-2">
          {mine.map((l) => {
            const st = LEAVE_STATUS[l.status];
            const past = l.to < today;
            return (
              <li key={l.id} className={cn("border-t border-line px-5 py-3.5", past && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-text">{LEAVE_LABEL[l.type]}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {leaveRange(l)}, {plural(leaveDays(l, settings), "day")}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium", st.cls)}>{st.label}</span>
                </div>
                {l.note && <p className="mt-1.5 text-[13px] leading-snug text-text/80">“{l.note}”</p>}
                {l.status === "pending" && <p className="mt-1.5 text-[12.5px] text-faint">Waiting for {approverName} to decide.</p>}
                {l.status === "approved" && !past && <p className="mt-1.5 text-[12.5px] text-faint">Reminders pause on these days.</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 pb-5 pt-2 text-[13.5px] leading-snug text-muted">
          You haven&apos;t asked for leave yet. Requests go to {approverName}, and approved days pause your reminders.
        </p>
      )}
      <LeaveDialog open={open} onOpenChange={setOpen} today={today} approverName={approverName} />
    </Panel>
  );
}

/* ---------- holidays ---------- */
export function UpcomingHolidays({ now, today }: { now: Date; today: string }) {
  const holidays = useApp((s) => s.settings.holidays);
  const upcoming = holidays.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  return (
    <Panel className="p-5">
      <SectionHeading title="Upcoming holidays" />
      {upcoming.length ? (
        <ul className="space-y-3">
          {upcoming.map((h) => {
            const n = differenceInCalendarDays(day(h.date), now);
            return (
              <li key={h.date} className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-[var(--radius-md)] bg-sunken leading-none">
                  <span className="text-[10.5px] font-medium text-muted">{format(day(h.date), "MMM")}</span>
                  <span className="tabular mt-0.5 font-display text-[15px] font-semibold text-text">{format(day(h.date), "d")}</span>
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-text">{h.name}</p>
                  <p className="text-[12.5px] text-muted">
                    {format(day(h.date), "EEEE")}, {n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[13.5px] text-muted">
          <CalendarDays className="size-4 text-faint" /> No holidays coming up.
        </p>
      )}
      <p className="mt-4 text-[12.5px] leading-snug text-muted">Pulse doesn&apos;t send reminders on holidays.</p>
    </Panel>
  );
}
