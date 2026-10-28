/**
 * The reminder engine: one pure "tick" over an organisation's world.
 * The server calls it every minute (cron), saves what changed and sends push.
 *
 * For a task that hasn't been acknowledged, a reminder goes out only when all
 * five gates are open:
 *   1. window    it's working time (or the task is set to remind at any hour)
 *   2. presence  the assignee isn't on leave or deactivated
 *   3. snooze    the assignee hasn't snoozed it
 *   4. interval  enough minutes have passed since the last reminder
 *   5. cap       today's reminders for this task are under the daily cap
 *
 * Silence climbs the ladder: L1 after N ignored reminders (marked urgent),
 * L2 tells the team lead, L3 the department head (also any overdue task),
 * L4 the owner when it's still not acknowledged long after the deadline.
 */
import { addDays, differenceInMinutes } from "date-fns";
import type { Activity, ActivityKind, AppNotification, HeatLevel, NotificationKind, Task } from "@/lib/types";
import { backupFor, channelMembersOf, headOf, leadOf, membersOf, ownerOf, unitHeadOf, type World } from "./world";
import { isAway, isWorkDay, isWorkingTimeFor, localDate, localNow, overdueFrom, scheduleFor, timerCutoff, toMinutes, zonedInstant } from "./time";
import { describeRule, nextDue, ruleOf } from "./repeat";

export interface EngineState {
  lastTickAt?: string;
  /** org-local date of the last daily reset */
  day?: string;
  morningSent?: string;
  eveningSent?: string;
  /** when report rows were last recomputed */
  rollupAt?: string;
  /** org-local date of the last weekly summary */
  weeklySent?: string;
  /** org-local date the 48-hour horizon warning last went out */
  horizonSent?: string;
  /** last reminder per notice per person, for notices that need an acknowledgment */
  noticeReminders?: Record<string, Record<string, string>>;
  /** tasks whose daily reminder cap was logged today (date → task ids) */
  capLogged?: { date: string; ids: string[] };
  /** per person: the local date their morning brief last went out (people can be in different time zones) */
  morningFor?: Record<string, string>;
  /** skipped reminders already logged today ("taskId:reason"), so each reason shows once a day */
  skipLogged?: { date: string; keys: string[] };
  /** the last date absences were recorded for */
  absentDay?: string;
  /** the UTC date old records were last cleared (data retention) */
  retentionDay?: string;
  /** UTC date of the last nightly backup */
  backupDay?: string;
}

export interface TickResult {
  world: World;
  state: EngineState;
  /** org-local dates whose report rows should be recomputed */
  rollupDates: string[];
  /** notification ids that are digests (also emailed when email is set up) */
  digestIds: string[];
}

const BLOCKED_NUDGE_MIN = 240;
const DUE_SOON_MIN = 60;
const DIGEST_GRACE_MIN = 120;
/** not started with this little time left: the team lead hears about it */
const NOT_STARTED_SOON_MIN = 120;
/** notices that need an OK are chased this often (at most twice in a working day) */
const NOTICE_REMIND_MIN = 240;
/** a repeating task stops making new copies while this many are still open */
const RECURRENCE_PILE_CAP = 3;
/** the 48-hour horizon warning goes to managers at this org-local time */
const HORIZON_MINUTES = 15 * 60;

const OPEN = ["assigned", "acknowledged", "in_progress"];

export function runTick(world: World, state: EngineState, now: Date, uid: (p: string) => string, extra: { lastTouch?: Record<string, string> } = {}): TickResult {
  const w: World = structuredClone(world);
  const s = w.settings;
  const tz = s.timezone || "Asia/Karachi";
  const l = localNow(now, tz);
  const nowIso = now.toISOString();
  /** inside this person's own working hours (their override, else their department's, else the company's) */
  const workCache = new Map<string, boolean>();
  const workingFor = (personId: string | undefined) => {
    const key = personId ?? "";
    if (!workCache.has(key)) workCache.set(key, isWorkingTimeFor(w, personId, now));
    return workCache.get(key)!;
  };
  const acts: Activity[] = [];
  const notes: AppNotification[] = [];
  const digestIds: string[] = [];
  const next: EngineState = { ...state, lastTickAt: nowIso };
  const rollupDates: string[] = [];

  const first = (id: string) => w.people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const log = (kind: ActivityKind, text: string, taskId?: string, aboutId?: string) =>
    acts.push({
      id: uid("act"),
      at: nowIso,
      actorId: "system",
      kind,
      text,
      taskId,
      ...(aboutId ? { aboutId } : {}),
    });
  const note = (recipientId: string | undefined, kind: NotificationKind, title: string, body: string, taskId?: string) => {
    if (!recipientId) return undefined;
    let p = w.people.find((x) => x.id === recipientId);
    // someone who has left can't act on an escalation or a review: the owner hears instead
    if (p?.active === false && (kind === "escalation" || kind === "submitted")) {
      const owner = ownerOf(w);
      p = owner && owner !== recipientId ? w.people.find((x) => x.id === owner) : undefined;
      recipientId = p?.id;
    }
    if (!p || !recipientId || p.active === false) return undefined;
    const n: AppNotification = {
      id: uid("n"),
      at: nowIso,
      recipientId,
      kind,
      title,
      body,
      taskId,
      read: false,
    };
    notes.push(n);
    return n;
  };
  const minsSince = (iso?: string) => (iso ? differenceInMinutes(now, new Date(iso)) : Infinity);
  const hasHealthyDevice = (personId: string) => w.people.find((p) => p.id === personId)?.devices.some((d) => d.healthy) ?? false;

  /* ---------- 1. a new day: reset daily counters, sync leave, roll up yesterday ---------- */
  if (next.day !== l.date) {
    if (next.day) rollupDates.push(next.day);
    for (const t of w.tasks) {
      if (t.snoozesToday) t.snoozesToday = 0;
      if (t.remindersToday) t.remindersToday = 0;
    }
    for (const p of w.people) {
      const onApprovedLeave = w.leaves.some((x) => x.personId === p.id && x.status === "approved" && x.from <= l.date && x.to >= l.date);
      const leaveEndedRecently = w.leaves.some((x) => x.personId === p.id && x.status === "approved" && x.to < l.date && x.to >= (next.day ?? x.to));
      if (onApprovedLeave && !p.onLeave) {
        p.onLeave = true;
        log("reminders_paused", `${first(p.id)} is on leave today. Their reminders are paused.`);
      } else if (!onApprovedLeave && p.onLeave && leaveEndedRecently) {
        p.onLeave = false;
        log("check_in", `${first(p.id)} is back from leave. Reminders resume.`);
      }
    }
    // yesterday: anyone with a working day who never checked in and wasn't away is marked absent
    const yesterday = next.day;
    if (yesterday && next.absentDay !== yesterday) {
      next.absentDay = yesterday;
      for (const p of w.people) {
        if (p.active === false || p.role === "owner") continue;
        const sc = scheduleFor(w, p.id);
        const dow = new Date(`${yesterday}T12:00:00Z`).getUTCDay();
        if (!sc.workDays.includes(dow) || sc.holidays.some((h) => h.date === yesterday) || isAway(w, p.id, yesterday)) continue;
        if (w.leaves.some((x) => x.personId === p.id && x.status === "approved" && x.from <= yesterday && x.to >= yesterday)) continue;
        if (w.attendance.some((a) => a.personId === p.id && a.date === yesterday)) continue;
        w.attendance.push({ personId: p.id, date: yesterday, breakMin: 0, status: "absent" });
      }
    }
    next.day = l.date;
  }
  rollupDates.push(l.date);

  /* ---------- 1b. self-check: if the engine itself stopped running, the owner is told when it comes back (spec §19) ---------- */
  if (state.lastTickAt) {
    const gapMin = Math.round((now.getTime() - new Date(state.lastTickAt).getTime()) / 60000);
    const sc = scheduleFor(w, ownerOf(w));
    const lo = localNow(now, sc.timezone);
    const inHours = sc.workDays.includes(lo.dow) && lo.minutes >= toMinutes(sc.workStart) && lo.minutes < toMinutes(sc.workEnd);
    const waiting = w.tasks.filter((t) => ["assigned", "acknowledged", "in_progress"].includes(t.status)).length;
    if (gapMin >= 15 && inHours && waiting) {
      const owner = ownerOf(w);
      const msg = `Reminders were not running for ${gapMin >= 120 ? `${Math.round(gapMin / 60)} hours` : `${gapMin} minutes`}, so nobody was chased in that time. They are running again. If this keeps happening, check the scheduler that calls Pulse every minute.`;
      log("reminders_paused", `The reminder engine was stopped for ${gapMin} minutes and has restarted`);
      if (owner) note(owner, "escalation", "Reminders stopped for a while", msg);
    }
  }

  /* ---------- 2. tasks ---------- */
  /** the escalation thresholds for a task: tighter for urgent work (spec §15) */
  const ladder = (t: Task) => (t.priority === "urgent" ? (s.urgentEscalation ?? { l1Ignored: 2, l2Ignored: 3, l3Ignored: 5, l4HoursPastDue: 12 }) : s.escalation);
  const escalate = (t: Task, level: HeatLevel, why: string, opts: { overdue?: boolean; unit?: boolean } = {}) => {
    if (level <= t.escalationLevel) return;
    t.escalationLevel = level;
    log("escalated", `Escalated to level ${level}: ${why}`, t.id, opts.unit ? undefined : t.assigneeId);
    const who = first(t.assigneeId);
    // work offered to a unit: escalation goes to whoever runs the unit, then up
    const unitHead = opts.unit && t.groupClaim?.unitType && t.groupClaim.unitId ? unitHeadOf(w, t.groupClaim.unitType, t.groupClaim.unitId) : undefined;
    const lead = unitHead ?? leadOf(w, t.assigneeId);
    const head = unitHead ? (headOf(w, unitHead) ?? ownerOf(w)) : headOf(w, t.assigneeId);
    const owner = ownerOf(w);
    const audience = level === 4 ? [owner, head, lead] : level === 3 ? [lead, head, owner] : level === 2 ? [lead ?? head ?? owner] : [];
    const title = opts.unit
      ? `Nobody in ${t.groupClaim?.unitName ?? "the team"} has claimed it: ${t.title}`
      : level === 4
        ? `${who} has not responded for ${Math.round(minsSince(t.overdueAt ?? t.dueAt) / 60)} hours past the deadline`
        : `${who}: ${why}`;
    const told = Array.from(new Set(audience.filter((x): x is string => !!x && x !== t.assigneeId)));
    for (const r of told) note(r, "escalation", title, `${t.title} is now level ${level}.`, t.id);
    // the person themselves hears that it has gone up (spec §16), not just the people above them
    if (level >= 2 && !opts.unit && told.length)
      note(
        t.assigneeId,
        "escalation",
        `${t.title} has been escalated`,
        `${told.map(first).join(" and ")} ${told.length === 1 ? "has" : "have"} been told. Acknowledge, start or mark it blocked to bring it back down.`,
        t.id,
      );
  };
  // every reminder that doesn't go out, and why, is in the history once a day (spec §7)
  const skipped = { ...(next.skipLogged?.date === l.date ? next.skipLogged : { date: l.date, keys: [] as string[] }) };
  /** did the assignee say or do anything on the task after this moment? */
  const respondedSince = (t: Task, iso: string) =>
    (!!t.progressAt && t.progressAt > iso) ||
    (!!t.statusChangedAt && t.statusChangedAt > iso) ||
    t.comments.some((c) => c.authorId === t.assigneeId && c.at > iso) ||
    w.deadlineRequests.some((d) => d.taskId === t.id && d.byId === t.assigneeId && d.at > iso);
  const waitingOnOther = (t: Task) =>
    (t.dependsOn ?? []).some((id) => {
      const d = w.tasks.find((x) => x.id === id);
      return !!d && d.status !== "approved" && d.status !== "cancelled";
    });
  const skip = (t: Task, reason: string, text: string) => {
    const key = `${t.id}:${reason}`;
    if (skipped.keys.includes(key)) return;
    skipped.keys = [...skipped.keys, key];
    log("reminders_paused", `Reminder skipped: ${text}`, t.id);
  };

  for (const t of w.tasks) {
    if (t.status === "draft" || t.status === "approved" || t.status === "cancelled") continue;
    if (t.startAt && new Date(t.startAt) > now) continue;
    // waiting on another task: nothing to chase the assignee about until it's done (spec §6)
    if (waitingOnOther(t)) {
      if (t.status === "assigned" || t.status === "acknowledged") skip(t, "waiting", "it is waiting for another task to be finished");
      continue;
    }
    // working hours can change: keep the moment it turns overdue current
    const od = overdueFrom(w, t.assigneeId, t.dueAt);
    if (t.overdueAt !== od) t.overdueAt = od;
    const away = isAway(w, t.assigneeId, l.date);
    const overdueMin = minsSince(t.overdueAt); // > 0 when overdue
    const overdue = overdueMin > 0;

    const unclaimed = !!t.groupClaim && !t.groupClaim.claimed;
    const working = workingFor(t.assigneeId);
    if (t.status === "assigned") {
      // ladder first: lateness counts even when reminders are paused by the window
      if (!away && working) {
        if (overdue && overdueMin >= ladder(t).l4HoursPastDue * 60)
          escalate(t, 4, "still not acknowledged long after the deadline", {
            overdue: true,
            unit: unclaimed,
          });
        else if (overdue) escalate(t, 3, unclaimed ? "past the deadline and nobody claimed it" : "past the deadline and not acknowledged", { overdue: true, unit: unclaimed });
        else if (-overdueMin <= NOT_STARTED_SOON_MIN) escalate(t, 2, "due within 2 hours and not started");
        else {
          // a quarter of the time to the deadline gone with no response: mark it, before any reminder count does
          const total = new Date(t.dueAt).getTime() - new Date(t.createdAt).getTime();
          if (total > 0 && (now.getTime() - new Date(t.createdAt).getTime()) / total >= 0.25) escalate(t, 1, "a quarter of the time to the deadline passed without a response");
        }
      }
      const windowOpen = t.reminder.window === "always" || working;
      const snoozed = !!t.snoozedUntil && new Date(t.snoozedUntil) > now;
      const intervalOk = minsSince(t.lastReminderAt ?? t.createdAt) >= t.reminder.intervalMin;
      const underCap = (t.remindersToday ?? 0) < t.reminder.dailyCap;
      if (!underCap && windowOpen && intervalOk) {
        // the cap is the one gate the owner can't infer from the clock: say so once a day
        const logged = next.capLogged?.date === l.date ? next.capLogged.ids : [];
        if (!logged.includes(t.id)) {
          next.capLogged = { date: l.date, ids: [...logged, t.id] };
          log("reminders_paused", `Daily reminder cap of ${t.reminder.dailyCap} reached. No more reminders today; the escalation ladder still applies.`, t.id);
        }
      }
      if (unclaimed) {
        // offered to a unit and not claimed: every member is reminded until someone takes it
        if (!(windowOpen && intervalOk && underCap) || !t.groupClaim?.unitType || !t.groupClaim.unitId) continue;
        const members = membersOf(w, t.groupClaim.unitType, t.groupClaim.unitId).filter((id) => !isAway(w, id, l.date));
        if (!members.length) continue;
        // every round nobody claims it counts, and it climbs to whoever runs the unit
        if (t.remindersSent > 0) t.remindersIgnored += 1;
        t.remindersSent += 1;
        t.remindersToday = (t.remindersToday ?? 0) + 1;
        t.lastReminderAt = nowIso;
        if (t.remindersIgnored >= ladder(t).l2Ignored) escalate(t, 2, `nobody claimed it after ${t.remindersSent} reminders`, { unit: true });
        for (const id of members)
          note(id, "reminder", `Still unclaimed: ${t.title}`, `Offered to ${t.groupClaim.unitName}. The first to claim it owns it.${overdue ? " It is past its deadline." : ""}`, t.id);
        log("reminder_sent", `Reminded ${members.length} people in ${t.groupClaim.unitName} that nobody has claimed this yet`, t.id, "unit");
        continue;
      }
      if (!(windowOpen && !away && !snoozed && intervalOk && underCap)) {
        if (intervalOk && underCap) {
          const sc = scheduleFor(w, t.assigneeId);
          const pl = localNow(now, sc.timezone);
          const dayOff = !sc.workDays.includes(pl.dow) || sc.holidays.some((h) => h.date === pl.date);
          if (away) skip(t, "away", `${first(t.assigneeId)} is on leave or away today`);
          else if (snoozed)
            skip(
              t,
              "snooze",
              `${first(t.assigneeId)} snoozed it until ${new Intl.DateTimeFormat("en-GB", { timeZone: sc.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(t.snoozedUntil!))}`,
            );
          else if (dayOff) skip(t, "dayoff", sc.holidays.some((h) => h.date === pl.date) ? "today is a holiday" : `today is a day off for ${first(t.assigneeId)}`);
          else skip(t, "hours", `outside ${first(t.assigneeId)}'s working hours (${sc.workStart} to ${sc.workEnd})`);
        }
        continue;
      }

      const count = t.remindersSent + 1;
      // a reminder that couldn't reach any device isn't held against the person
      const counted = t.remindersSent > 0 && hasHealthyDevice(t.assigneeId);
      t.remindersSent = count;
      t.remindersToday = (t.remindersToday ?? 0) + 1;
      t.lastReminderAt = nowIso;
      if (counted) t.remindersIgnored += 1;
      const reviewer = first(t.reviewerId);
      const urgent = t.priority === "urgent" || t.escalationLevel >= 1;
      note(
        t.assigneeId,
        "reminder",
        `${urgent ? "Urgent. " : ""}Reminder ${count}: ${t.title}`,
        overdue ? `This is past its deadline. Tap Acknowledge so ${reviewer} knows you've seen it.` : `Tap Acknowledge so ${reviewer} knows you've seen it.`,
        t.id,
      );
      log("reminder_sent", `Reminder ${count} sent to ${first(t.assigneeId)}${hasHealthyDevice(t.assigneeId) ? "" : " (no working device: in-app only, not counted as ignored)"}`, t.id, t.assigneeId);

      const ig = t.remindersIgnored;
      const e = ladder(t);
      if (ig >= e.l3Ignored) escalate(t, 3, `${ig} reminders ignored`);
      else if (ig >= e.l2Ignored) escalate(t, 2, `${ig} reminders ignored`);
      else if (ig >= e.l1Ignored) escalate(t, 1, `${ig} reminders ignored`);
      continue;
    }

    if (t.status === "acknowledged" || t.status === "in_progress") {
      if (away || !(t.reminder.window === "always" || working)) continue;
      if (overdue) {
        // level 4 is for silence: past the deadline and no word from them since (spec §15)
        if (overdueMin >= ladder(t).l4HoursPastDue * 60 && !respondedSince(t, t.overdueAt ?? t.dueAt)) escalate(t, 4, "past the deadline with no response since", { overdue: true });
        else if (t.escalationLevel < 3) {
          t.escalationLevel = 3;
          log("escalated", "Past the deadline", t.id, t.assigneeId);
          // the reviewer (or lead), the department head and the owner hear that it's late
          const late = [t.reviewerId !== t.assigneeId ? t.reviewerId : leadOf(w, t.assigneeId), headOf(w, t.assigneeId), ownerOf(w)];
          for (const r of Array.from(new Set(late.filter((x): x is string => !!x && x !== t.assigneeId)))) {
            note(r, "escalation", `${first(t.assigneeId)} is late`, `${t.title} was due ${Math.max(1, Math.round(overdueMin / 60))}h ago.`, t.id);
          }
        }
        const gap = Math.max(t.reminder.intervalMin, t.reminder.quietAfterAckMin);
        if (minsSince(t.lastReminderAt) >= gap && (t.remindersToday ?? 0) < t.reminder.dailyCap) {
          t.remindersSent += 1;
          t.remindersToday = (t.remindersToday ?? 0) + 1;
          t.lastReminderAt = nowIso;
          note(t.assigneeId, "reminder", `Overdue: ${t.title}`, "Submit it, or ask for more time so your reviewer knows the new plan.", t.id);
          log("reminder_sent", `Overdue reminder sent to ${first(t.assigneeId)}`, t.id, t.assigneeId);
        }
      } else if (-overdueMin <= DUE_SOON_MIN && (!t.lastReminderAt || new Date(t.lastReminderAt) < new Date(new Date(t.dueAt).getTime() - DUE_SOON_MIN * 60000))) {
        t.lastReminderAt = nowIso;
        t.remindersSent += 1;
        t.remindersToday = (t.remindersToday ?? 0) + 1;
        note(t.assigneeId, "reminder", `Due within the hour: ${t.title}`, "Submit it on time, or ask for more time now.", t.id);
        log("reminder_sent", `Due-soon reminder sent to ${first(t.assigneeId)}`, t.id, t.assigneeId);
      } else if (t.status === "acknowledged" && t.acknowledgedAt) {
        // seen but not started: a gentler nudge at twice the interval, after the quiet period, never counted as ignored
        if (-overdueMin <= NOT_STARTED_SOON_MIN) escalate(t, 2, "due within 2 hours and not started");
        const snoozed = !!t.snoozedUntil && new Date(t.snoozedUntil) > now;
        const sinceAck = minsSince(t.acknowledgedAt);
        const sinceLast = t.lastReminderAt && t.lastReminderAt > t.acknowledgedAt ? minsSince(t.lastReminderAt) : sinceAck;
        const gap = Math.max(t.reminder.intervalMin * 2, t.reminder.quietAfterAckMin);
        if (!snoozed && sinceAck >= t.reminder.quietAfterAckMin && sinceLast >= gap && (t.remindersToday ?? 0) < t.reminder.dailyCap) {
          t.lastReminderAt = nowIso;
          t.remindersSent += 1;
          t.remindersToday = (t.remindersToday ?? 0) + 1;
          note(t.assigneeId, "reminder", `Not started yet: ${t.title}`, "Tap Start when you begin, or Blocked if something is in the way.", t.id);
          log("reminder_sent", `Gentle reminder sent to ${first(t.assigneeId)} (seen, not started)`, t.id, t.assigneeId);
        }
      }
      continue;
    }

    if (t.status === "blocked") {
      if (!t.blockedOwnerId || !workingFor(t.blockedOwnerId)) continue;
      const since = t.lastReminderAt && t.blockedAt && t.lastReminderAt > t.blockedAt ? t.lastReminderAt : t.blockedAt;
      if (minsSince(since) >= BLOCKED_NUDGE_MIN) {
        t.lastReminderAt = nowIso;
        note(t.blockedOwnerId, "blocked", `${first(t.assigneeId)} is still waiting on you`, `${t.title}: ${t.blockedReason ?? "blocked"}`, t.id);
        log("reminder_sent", `Reminded ${first(t.blockedOwnerId)} that ${first(t.assigneeId)} is still blocked`, t.id, t.blockedOwnerId);
      }
      continue;
    }

    if (t.status === "submitted" && t.submittedAt) {
      // the same ladder runs for reviewers: the manager is the subject, the owner the escalation target (spec §15)
      if (!workingFor(t.reviewerId)) continue;
      const waitH = minsSince(t.submittedAt) / 60;
      const sla = s.reviewSlaHours;
      const owner = ownerOf(w);
      const up = headOf(w, t.reviewerId);
      const ago = `${Math.round(waitH)} hours`;
      if (waitH >= sla * 3 && t.escalationLevel < 4) {
        t.escalationLevel = 4;
        if (owner && owner !== t.reviewerId)
          note(owner, "escalation", `${first(t.reviewerId)} has not reviewed ${first(t.assigneeId)}'s work for ${ago}`, `${t.title}. Flagged as unresponsive.`, t.id);
        log("escalated", `Review unanswered for ${ago}: ${first(t.reviewerId)} flagged to the owner as unresponsive`, t.id, t.reviewerId);
      } else if (waitH >= sla * 2 && t.escalationLevel < 3) {
        t.escalationLevel = 3;
        for (const r of Array.from(new Set([up, owner].filter((x): x is string => !!x && x !== t.reviewerId))))
          note(r, "escalation", `${first(t.assigneeId)}'s work has waited ${ago} for review`, `${t.title} is waiting on ${first(t.reviewerId)}.`, t.id);
        note(t.reviewerId, "submitted", `Still waiting for your review: ${t.title}`, `${ago} now. Your head and the owner have been told.`, t.id);
        log("escalated", `Review overdue: waiting ${ago} on ${first(t.reviewerId)}`, t.id, t.reviewerId);
      } else if (waitH >= sla && t.escalationLevel < 2) {
        // unreviewed for the SLA: the reviewer and the owner hear (spec §16)
        t.escalationLevel = 2;
        note(t.reviewerId, "submitted", `${first(t.assigneeId)}'s work is waiting for you`, `${t.title} has waited ${ago}. Approve it or send it back.`, t.id);
        if (owner && owner !== t.reviewerId) note(owner, "escalation", `Unreviewed for ${ago}: ${t.title}`, `Submitted by ${first(t.assigneeId)}, waiting on ${first(t.reviewerId)}.`, t.id);
        log("reminder_sent", `Reminded ${first(t.reviewerId)} to review (${ago} waiting)`, t.id, t.reviewerId);
      }
    }
  }

  /* ---------- 2a. availability notes clear themselves once their time has passed ---------- */
  for (const p of w.people) if (p.availability?.until && p.availability.until <= now.toISOString()) p.availability = undefined;

  /* ---------- 2b. forgotten timers stop at the end of the working day ---------- */
  for (const [personId, timer] of Object.entries(w.timers)) {
    if (!timer) continue;
    const cutoff = timerCutoff(w, personId, timer.startedAt);
    if (cutoff > now) continue;
    const t = w.tasks.find((x) => x.id === timer.taskId);
    const mins = Math.max(1, Math.round((cutoff.getTime() - new Date(timer.startedAt).getTime()) / 60000));
    if (t) {
      t.loggedMinutes += mins;
      t.timeEntries = [...(t.timeEntries ?? []), { id: uid("te"), personId, minutes: mins, from: timer.startedAt, to: cutoff.toISOString(), autoStopped: true }];
    }
    w.timers[personId] = undefined;
    const at = new Intl.DateTimeFormat("en-GB", { timeZone: scheduleFor(w, personId).timezone, hour: "numeric", minute: "2-digit" }).format(cutoff);
    log("timer", `Timer stopped automatically at ${at}, the end of ${first(personId)}'s working day (${mins} min counted). Add time by hand if work went on longer.`, timer.taskId);
    note(personId, "reminder", "Your timer was stopped", `${t?.title ?? "A task"}: it was still running at ${at}, so Pulse stopped it there. If you worked later, add the time by hand.`, timer.taskId);
  }

  /* ---------- 2c. work that sits in progress with no activity is flagged as idle ---------- */
  {
    const idleDays = s.idleDays ?? 3;
    const lastTouch = new Map<string, number>(Object.entries(extra.lastTouch ?? {}).map(([k, v]) => [k, new Date(v).getTime()]));
    for (const a of w.activity) {
      if (!a.taskId || a.actorId === "system") continue;
      const at = new Date(a.at).getTime();
      if (at > (lastTouch.get(a.taskId) ?? 0)) lastTouch.set(a.taskId, at);
    }
    for (const t of w.tasks) {
      if (t.status !== "in_progress" || t.idleFlaggedAt) continue;
      if (w.timers[t.assigneeId]?.taskId === t.id) continue;
      const touched = Math.max(
        lastTouch.get(t.id) ?? 0,
        new Date(t.statusChangedAt).getTime(),
        ...t.comments.map((c) => new Date(c.at).getTime()),
        ...(t.timeEntries ?? []).map((e) => new Date(e.to ?? e.from).getTime()),
      );
      if (now.getTime() - touched < idleDays * 24 * 3600000) continue;
      t.idleFlaggedAt = nowIso;
      log("escalated", `Idle: in progress with no activity for ${idleDays} days`, t.id, "idle");
      note(t.assigneeId, "reminder", `Still working on this? ${t.title}`, `Nothing has happened on it for ${idleDays} days. Add an update, submit it, or mark it blocked.`, t.id);
      const up = t.reviewerId !== t.assigneeId ? t.reviewerId : (leadOf(w, t.assigneeId) ?? headOf(w, t.assigneeId));
      if (up) note(up, "escalation", `${first(t.assigneeId)}'s task has gone quiet`, `${t.title} has been in progress with no activity for ${idleDays} days.`, t.id);
    }
  }

  /* ---------- 2d. regular progress updates on long work, and archiving finished work ---------- */
  for (const t of w.tasks) {
    if (t.updateEveryDays && ["acknowledged", "in_progress"].includes(t.status) && !isAway(w, t.assigneeId, l.date) && workingFor(t.assigneeId)) {
      const every = t.updateEveryDays * 24 * 60;
      const lastUpdate = [t.progressAt, t.startedAt, t.acknowledgedAt].filter(Boolean).sort().pop();
      const sinceUpdate = minsSince(lastUpdate);
      if (sinceUpdate >= every && minsSince(t.lastUpdateRemindedAt) >= every) {
        t.lastUpdateRemindedAt = nowIso;
        const days = Math.floor(sinceUpdate / 1440);
        note(
          t.assigneeId,
          "reminder",
          `Time for an update: ${t.title}`,
          `It asks for an update every ${t.updateEveryDays === 1 ? "day" : `${t.updateEveryDays} days`}. Set how far along it is, with one line on where it stands.`,
          t.id,
        );
        log("reminder_sent", `Asked ${first(t.assigneeId)} for a progress update (last one ${days} ${days === 1 ? "day" : "days"} ago)`, t.id, "update");
        // two missed updates in a row: the reviewer hears
        if (sinceUpdate >= every * 2 && t.reviewerId !== t.assigneeId)
          note(
            t.reviewerId,
            "escalation",
            `No update from ${first(t.assigneeId)} in ${days} days`,
            `${t.title} asks for one every ${t.updateEveryDays === 1 ? "day" : `${t.updateEveryDays} days`}.`,
            t.id,
          );
      }
    }
    const closed = t.status === "approved" ? t.approvedAt : t.status === "cancelled" ? t.statusChangedAt : undefined;
    if (closed && !t.archivedAt && minsSince(closed) >= (s.autoArchiveDays ?? 30) * 1440) t.archivedAt = nowIso;
  }

  /* ---------- 3. repeating tasks: make the next copy once this one is done or due ---------- */
  const stillOpen = (x: Task) => !["approved", "cancelled"].includes(x.status);
  /** open copies behind this one in its repeat chain (this one included) */
  const openInChain = (t: Task) => {
    let n = stillOpen(t) ? 1 : 0;
    let cur: Task | undefined = t;
    for (let i = 0; i < 50 && cur; i++) {
      const prev: Task | undefined = w.tasks.find((x) => x.recurrenceNextId === cur!.id);
      if (!prev) break;
      if (stillOpen(prev)) n++;
      cur = prev;
    }
    return n;
  };
  for (const t of [...w.tasks]) {
    if (t.recurrenceNextId || t.status === "draft" || t.status === "cancelled") continue;
    const sc = scheduleFor(w, t.assigneeId);
    const rule = ruleOf(t, sc.timezone);
    if (!rule) continue;
    const isOff = (date: string, dow: number) => !sc.workDays.includes(dow) || sc.holidays.some((h) => h.date === date);
    const anchor = (() => {
      let first: Task = t;
      for (let i = 0; i < 400; i++) {
        const prev = w.tasks.find((x) => x.recurrenceNextId === first.id);
        if (!prev) break;
        first = prev;
      }
      return localNow(new Date(first.dueAt), sc.timezone).date;
    })();

    let due: Date;
    if (rule.mode === "afterDone") {
      // the next one only once this one is approved, N days later at the same time of day
      if (t.status !== "approved" || !t.approvedAt) continue;
      const days = Math.max(1, rule.afterDays ?? rule.interval ?? 1);
      const time = localNow(new Date(t.dueAt), sc.timezone);
      const hhmm = `${String(Math.floor(time.minutes / 60)).padStart(2, "0")}:${String(time.minutes % 60).padStart(2, "0")}`;
      const day = addDays(new Date(`${localNow(new Date(t.approvedAt), sc.timezone).date}T12:00:00Z`), days);
      due = zonedInstant(day.toISOString().slice(0, 10), hhmm, sc.timezone);
    } else {
      // fixed schedule: the next copy appears once this one is done or its deadline has passed
      if (t.status !== "approved" && new Date(t.dueAt) > now) continue;
      due = nextDue(rule, new Date(t.dueAt), sc.timezone, isOff, anchor);
      for (let guard = 0; due <= now && guard < 400; guard++) due = nextDue(rule, due, sc.timezone, isOff, anchor);
    }

    // the series has ended: no more copies
    const index = t.repeatIndex ?? 1;
    if ((rule.ends?.kind === "count" && index >= rule.ends.count) || (rule.ends?.kind === "date" && localNow(due, sc.timezone).date > rule.ends.date)) {
      t.recurrenceNextId = "ended";
      log("created", `The repeat series ended after ${index} ${index === 1 ? "copy" : "copies"}`, t.id);
      continue;
    }

    // an unfinished copy when the next is due: close it as missed, or let it wait (capped)
    if (rule.mode !== "afterDone" && stillOpen(t) && t.status !== "approved") {
      if (rule.missed === "close") {
        if (w.timers[t.assigneeId]?.taskId === t.id) w.timers[t.assigneeId] = undefined;
        t.status = "cancelled";
        t.statusChangedAt = nowIso;
        log("cancelled", "Closed as missed: the next copy is due", t.id);
      } else if (openInChain(t) >= RECURRENCE_PILE_CAP) continue; // the pile is capped; a holiday never creates fifty overdue copies
    }

    let start = t.startAt ? new Date(due.getTime() - (new Date(t.dueAt).getTime() - new Date(t.startAt).getTime())) : undefined;
    if (start && start > due) start = undefined;
    const id = uid("task");
    const copy: Task = {
      ...structuredClone(t),
      id,
      status: "assigned",
      createdAt: nowIso,
      startAt: start?.toISOString(),
      dueAt: due.toISOString(),
      repeatIndex: index + 1,
      overdueAt: undefined,
      progress: undefined,
      progressNote: undefined,
      progressAt: undefined,
      timeEntries: [],
      idleFlaggedAt: undefined,
      archivedAt: undefined,
      lastUpdateRemindedAt: undefined,
      remindersSent: 0,
      remindersIgnored: 0,
      remindersToday: 0,
      lastReminderAt: undefined,
      escalationLevel: 0,
      subtasks: t.subtasks.map((x) => ({ ...x, id: uid("s"), done: false })),
      comments: [],
      attachments: [],
      blockedReason: undefined,
      blockedOwnerId: undefined,
      blockedAt: undefined,
      blockedFrom: undefined,
      submittedAt: undefined,
      submissionNote: undefined,
      rejections: 0,
      lastRejectionReason: undefined,
      acknowledgedAt: undefined,
      startedAt: undefined,
      approvedAt: undefined,
      statusChangedAt: nowIso,
      snoozedUntil: undefined,
      snoozesToday: 0,
      loggedMinutes: 0,
      recurrenceNextId: undefined,
      dependsOn: [],
    };
    // the person it repeated for has left: the next copy goes to the owner to hand on
    if (w.people.find((p) => p.id === t.assigneeId)?.active === false) {
      const owner = ownerOf(w);
      if (owner) copy.assigneeId = owner;
    } else if (isAway(w, t.assigneeId, localDate(due, tz)) || isAway(w, t.assigneeId, l.date)) {
      // away on the day it's due (or now): the copy goes to their backup, as new work would (spec §6)
      const cover = backupFor(w, t.assigneeId);
      if (cover && cover !== t.assigneeId) {
        copy.assigneeId = cover;
        copy.watcherIds = Array.from(new Set([...(copy.watcherIds ?? []), t.assigneeId]));
        log("reassigned", `${first(t.assigneeId)} is away, so this went to ${first(cover)}`, id);
      }
    }
    if (w.people.find((p) => p.id === copy.reviewerId)?.active === false) copy.reviewerId = ownerOf(w) ?? copy.reviewerId;
    t.recurrenceNextId = id;
    w.tasks.unshift(copy);
    copy.overdueAt = overdueFrom(w, copy.assigneeId, copy.dueAt);
    log("assigned", `${describeRule(rule)}: copy ${index + 1} assigned to ${first(copy.assigneeId)}`, id);
    note(
      copy.assigneeId,
      "assigned",
      `New repeating task`,
      `${copy.title}, due ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(due)}`,
      id,
    );
  }

  /* ---------- 4. digests ---------- */
  if (isWorkDay(s, l)) {
    const active = w.people.filter((p) => p.active !== false && !isAway(w, p.id, l.date));
    const open = w.tasks.filter((t) => ["assigned", "acknowledged", "in_progress", "blocked"].includes(t.status));
    const endOfDay = new Date(now.getTime() + (24 * 60 - l.minutes) * 60000);

    // the morning brief goes out at each person's own morning, in their own time zone;
    // a brief is only worth sending close to its time, so if the engine was down it's skipped
    // first run after per-person briefs arrived: today's brief already went out company-wide
    const morningFor = { ...(next.morningFor ?? (next.morningSent === l.date ? Object.fromEntries(w.people.map((p) => [p.id, l.date])) : {})) };
    if (l.minutes >= toMinutes(s.digestMorning)) next.morningSent = l.date;
    {
      const rank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
      for (const p of active) {
        const sc = scheduleFor(w, p.id);
        const pl = localNow(now, sc.timezone);
        if (morningFor[p.id] === pl.date || !sc.workDays.includes(pl.dow) || sc.holidays.some((h) => h.date === pl.date)) continue;
        if (pl.minutes < toMinutes(s.digestMorning)) continue;
        morningFor[p.id] = pl.date;
        if (pl.minutes > toMinutes(s.digestMorning) + DIGEST_GRACE_MIN) continue;
        const mine = open.filter((t) => t.assigneeId === p.id && t.status !== "blocked" && !waitingOnOther(t) && !(t.startAt && new Date(t.startAt) > endOfDay));
        const late = mine.filter((t) => new Date(t.dueAt) <= now).length;
        const reviews = w.tasks.filter((t) => t.status === "submitted" && t.reviewerId === p.id).length;
        // the day, in order: overdue first, then by deadline, urgent before normal
        const ordered = [...mine].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || rank[a.priority] - rank[b.priority]);
        const top = ordered.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`);
        const more = ordered.length - top.length;
        const parts = [late ? `${late} overdue` : "", reviews ? `${reviews} waiting for your review` : ""].filter(Boolean);
        if (!mine.length && !reviews) continue;
        const title = mine.length ? `Good morning. ${mine.length} ${mine.length === 1 ? "task" : "tasks"} today${late ? `, ${late} overdue` : ""}` : "Good morning. Here's your day";
        const body = [...top, more > 0 ? `and ${more} more` : "", parts.length && !mine.length ? parts.join(", ") + "." : reviews ? `${reviews} waiting for your review.` : ""]
          .filter(Boolean)
          .join("\n");
        const n = note(p.id, "digest", title, body);
        if (n) digestIds.push(n.id);
      }
    }
    next.morningFor = morningFor;

    // 48-hour horizon: work that is due soon and hasn't been started, for whoever manages it
    const horizonDue = l.minutes >= HORIZON_MINUTES && next.horizonSent !== l.date;
    if (horizonDue && l.minutes > HORIZON_MINUTES + DIGEST_GRACE_MIN) next.horizonSent = l.date;
    if (horizonDue && next.horizonSent !== l.date) {
      next.horizonSent = l.date;
      const in48 = new Date(now.getTime() + 48 * 60 * 60000);
      const notStarted = open.filter((t) => (t.status === "assigned" || t.status === "acknowledged") && new Date(t.dueAt) > now && new Date(t.dueAt) <= in48);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const theirs = notStarted.filter((t) => team.has(t.assigneeId) && t.assigneeId !== p.id);
        if (!theirs.length) continue;
        const names = Array.from(new Set(theirs.map((t) => first(t.assigneeId))))
          .slice(0, 4)
          .join(", ");
        const n = note(
          p.id,
          "deadline",
          `${theirs.length} ${theirs.length === 1 ? "task is" : "tasks are"} due within 48 hours and not started`,
          `${names}${theirs.length > 4 ? " and others" : ""}. Worth a word before the deadline, not after.`,
        );
        if (n) digestIds.push(n.id);
      }
    }

    // weekly summary: first working day of the week, with the morning brief
    const weekStart = l.dow === Math.min(...s.workDays.filter((d) => d !== 0), 1);
    if (weekStart && next.morningSent === l.date && next.weeklySent !== l.date) {
      next.weeklySent = l.date;
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60000);
      const lastWeek = w.activity.filter((a) => new Date(a.at) >= weekAgo);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const teamTasks = w.tasks.filter((t) => team.has(t.assigneeId));
        const approved = teamTasks.filter((t) => t.status === "approved" && t.approvedAt && new Date(t.approvedAt) >= weekAgo);
        const assignedWeek = teamTasks.filter((t) => t.status !== "draft" && new Date(t.createdAt) >= weekAgo).length;
        const onTime = approved.filter((t) => t.approvedAt! <= t.dueAt).length;
        // counted against the people they were about, like the reports
        const ofTeam = (a: Activity) => (a.aboutId ? team.has(a.aboutId) : teamTasks.some((t) => t.id === a.taskId));
        const escalated = lastWeek.filter((a) => a.kind === "escalated" && ofTeam(a)).length;
        const reminders = lastWeek.filter((a) => a.kind === "reminder_sent" && ofTeam(a)).length;
        const lateNow = teamTasks.filter((t) => OPEN.includes(t.status) && new Date(t.dueAt) <= now).length;
        if (!approved.length && !escalated && !reminders && !lateNow) continue;
        // average time to acknowledge new work, and who needed the most chasing
        const acked = teamTasks.filter((t) => t.acknowledgedAt && new Date(t.acknowledgedAt) >= weekAgo);
        const avgAck = acked.length ? Math.round(acked.reduce((n, t) => n + (new Date(t.acknowledgedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000, 0) / acked.length) : null;
        const escalationsBy = new Map<string, number>();
        for (const a of lastWeek) {
          if (a.kind !== "escalated" || !a.taskId) continue;
          const t = teamTasks.find((x) => x.id === a.taskId);
          const who = a.aboutId && team.has(a.aboutId) ? a.aboutId : a.aboutId ? undefined : t?.assigneeId;
          if (who) escalationsBy.set(who, (escalationsBy.get(who) ?? 0) + 1);
        }
        const chronic = Array.from(escalationsBy.entries())
          .filter(([, n]) => n >= 3)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id, n]) => `${first(id)} (${n})`);
        const ackText = avgAck === null ? "" : ` Average time to acknowledge: ${avgAck < 60 ? `${avgAck} min` : `${(avgAck / 60).toFixed(1)}h`}.`;
        const n = note(
          p.id,
          "digest",
          "Last week in one line",
          `${approved.length} approved of ${assignedWeek} assigned (${assignedWeek ? Math.min(100, Math.round((approved.length / assignedWeek) * 100)) : 0}% completion, ${approved.length ? Math.round((onTime / approved.length) * 100) : 0}% on time), ${reminders} reminders sent, ${escalated} escalations. ${lateNow} ${lateNow === 1 ? "task is" : "tasks are"} overdue right now.${ackText}${chronic.length ? ` Escalated most: ${chronic.join(", ")}.` : ""}`,
        );
        if (n) digestIds.push(n.id);
      }
    }

    // notices that need an OK are chased until everyone has given it
    const reminded = { ...(next.noticeReminders ?? {}) };
    for (const a of w.announcements) {
      if (!a.requiresAck) continue;
      const ch = w.channels.find((c) => c.id === a.channelId);
      if (!ch) continue;
      const waiting = channelMembersOf(w, ch).filter((id) => !a.ackBy[id] && id !== a.authorId && !isAway(w, id, l.date));
      if (!waiting.length) {
        delete reminded[a.id];
        continue;
      }
      const per = { ...(reminded[a.id] ?? {}) };
      let sent = 0;
      for (const id of waiting) {
        if (!workingFor(id)) continue;
        // every 4 working hours, which is at most twice in a working day
        const last = per[id] ?? a.at;
        if (minsSince(last) < NOTICE_REMIND_MIN) continue;
        per[id] = nowIso;
        sent++;
        note(id, "announcement", `${first(a.authorId)} is waiting for your OK`, `Please read and acknowledge "${a.title}".`);
      }
      if (sent) {
        reminded[a.id] = per;
        log("announcement", `Reminded ${sent} ${sent === 1 ? "person" : "people"} to acknowledge "${a.title}"`);
        // past its due time: each missing person's manager hears once, the owner a day later
        if (a.ackDueAt && new Date(a.ackDueAt) <= now) {
          for (const id of waiting) {
            const mgr = leadOf(w, id) ?? headOf(w, id);
            if (mgr && mgr !== a.authorId && !per[`${id}:mgr`]) {
              per[`${id}:mgr`] = nowIso;
              note(
                mgr,
                "announcement",
                `${first(id)} hasn't acknowledged "${a.title}"`,
                `It was due ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(a.ackDueAt))}.`,
              );
            }
          }
          const owner = ownerOf(w);
          if (owner && owner !== a.authorId && !per.__owner && minsSince(a.ackDueAt) >= 24 * 60) {
            per.__owner = nowIso;
            note(
              owner,
              "announcement",
              `${waiting.length} still haven't acknowledged "${a.title}"`,
              `${waiting.map(first).slice(0, 6).join(", ")}${waiting.length > 6 ? " and others" : ""}, a day after it was due.`,
            );
          }
        }
        // overdue notice: the author hears who is still missing, once
        if (a.ackDueAt && new Date(a.ackDueAt) <= now && !per.__escalated) {
          per.__escalated = nowIso;
          note(
            a.authorId,
            "announcement",
            `${waiting.length} ${waiting.length === 1 ? "person hasn't" : "people haven't"} acknowledged "${a.title}"`,
            `It was due ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(a.ackDueAt))}. ${waiting.map(first).slice(0, 5).join(", ")}${waiting.length > 5 ? " and others" : ""}.`,
          );
        }
      }
    }
    next.noticeReminders = reminded;

    const eveningDue = l.minutes >= toMinutes(s.digestEvening) && next.eveningSent !== l.date;
    if (eveningDue && l.minutes > toMinutes(s.digestEvening) + DIGEST_GRACE_MIN) next.eveningSent = l.date;
    if (eveningDue && next.eveningSent !== l.date) {
      next.eveningSent = l.date;
      const doneToday = w.tasks.filter((t) => t.status === "approved" && t.approvedAt && localNow(new Date(t.approvedAt), tz).date === l.date);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const done = doneToday.filter((t) => team.has(t.assigneeId)).length;
        const late = open.filter((t) => team.has(t.assigneeId) && new Date(t.dueAt) <= now).length;
        const unseen = open.filter((t) => team.has(t.assigneeId) && t.status === "assigned").length;
        const blocked = open.filter((t) => team.has(t.assigneeId) && t.status === "blocked").length;
        const escalatedToday = open.filter((t) => team.has(t.assigneeId) && t.escalationLevel >= 2).length;
        const awaiting = w.tasks.filter((t) => t.status === "submitted" && (team.has(t.assigneeId) || t.reviewerId === p.id)).length;
        const n = note(
          p.id,
          "digest",
          "End of day summary",
          `${done} done today, ${late} overdue, ${escalatedToday} escalated, ${blocked} blocked, ${awaiting} awaiting review, ${unseen} not acknowledged yet.`,
        );
        if (n) digestIds.push(n.id);
      }
    }
  }

  next.skipLogged = skipped;
  w.activity = [...acts.reverse(), ...w.activity];
  w.notifications = [...notes, ...w.notifications];
  return {
    world: w,
    state: next,
    rollupDates: Array.from(new Set(rollupDates)),
    digestIds,
  };
}

/** open work that the engine is responsible for */
export const isEngineTask = (t: Task) => OPEN.includes(t.status);
