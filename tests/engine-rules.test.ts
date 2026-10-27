import { describe, expect, it } from "vitest";
import { applyCommand } from "@/domain/commands";
import { runTick } from "@/domain/engine";
import { describeRule, nextDue } from "@/domain/repeat";
import type { RepeatRule } from "@/lib/types";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00"); // Wed
const ready = { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" };
const TZ = "Asia/Karachi";
const noDaysOff = () => false;
const sundaysOff = (_: string, dow: number) => dow === 0;
const local = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

describe("repeat rules", () => {
  it("weekly on chosen days keeps the time of day", () => {
    const rule: RepeatRule = { freq: "week", interval: 1, weekdays: [1, 3, 5], mode: "schedule" };
    const a = nextDue(rule, pkt("2026-10-21T17:00:00"), TZ, noDaysOff); // Wed → Fri
    expect(local(a)).toBe("Fri 23 Oct, 17:00");
    expect(local(nextDue(rule, a, TZ, noDaysOff))).toBe("Mon 26 Oct, 17:00");
  });

  it("every 2 weeks keeps its rhythm from the first copy", () => {
    const rule: RepeatRule = { freq: "week", interval: 2, weekdays: [2], mode: "schedule" };
    expect(local(nextDue(rule, pkt("2026-10-20T09:00:00"), TZ, noDaysOff, "2026-10-20"))).toBe("Tue 3 Nov, 09:00");
  });

  it("monthly on the last Friday, and on the 31st in a short month", () => {
    expect(local(nextDue({ freq: "month", interval: 1, monthly: { kind: "weekday", nth: -1, weekday: 5 }, mode: "schedule" }, pkt("2026-10-30T16:00:00"), TZ, noDaysOff))).toBe("Fri 27 Nov, 16:00");
    expect(local(nextDue({ freq: "month", interval: 1, monthly: { kind: "date", day: 31 }, mode: "schedule" }, pkt("2026-10-31T12:00:00"), TZ, noDaysOff))).toBe("Mon 30 Nov, 12:00");
  });

  it("every working day skips days off", () => {
    expect(local(nextDue({ freq: "day", interval: 1, workingDays: true, mode: "schedule" }, pkt("2026-10-24T09:00:00"), TZ, sundaysOff))).toBe("Mon 26 Oct, 09:00");
  });

  it("says itself in plain words", () => {
    expect(describeRule({ freq: "week", interval: 1, weekdays: [1, 4], mode: "schedule" })).toBe("Every Mon and Thu");
    expect(describeRule({ freq: "month", interval: 1, monthly: { kind: "weekday", nth: 2, weekday: 2 }, mode: "schedule", ends: { kind: "count", count: 6 } })).toBe("Monthly on the second Tuesday, 6 times");
    expect(describeRule({ freq: "day", interval: 1, mode: "afterDone", afterDays: 30 })).toBe("30 days after the last one is approved");
  });

  it("stops after the set number of copies", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "approved", approvedAt: NOW.toISOString(), dueAt: pkt("2026-10-21T09:00:00").toISOString(), repeat: { freq: "day", interval: 1, mode: "schedule", ends: { kind: "count", count: 3 } }, repeatIndex: 3 })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks).toHaveLength(1);
    expect(r.world.tasks[0].recurrenceNextId).toBe("ended");
  });

  it("closes a missed copy when told to, instead of letting them pile up", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "assigned", dueAt: pkt("2026-10-20T17:00:00").toISOString(), repeat: { freq: "day", interval: 1, mode: "schedule", missed: "close" } })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks.find((t) => t.id === "t1")!.status).toBe("cancelled");
    expect(r.world.tasks).toHaveLength(2);
    expect(r.world.tasks[0].repeatIndex).toBe(2);
  });

  it("after-completion makes the next one N days after approval, and not before", () => {
    const w = makeWorld();
    const rule: RepeatRule = { freq: "day", interval: 1, mode: "afterDone", afterDays: 30 };
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress", dueAt: pkt("2026-10-20T15:00:00").toISOString(), repeat: rule })];
    expect(runTick(w, ready, NOW, uid).world.tasks).toHaveLength(1); // late but not approved: nothing yet
    w.tasks[0].status = "approved";
    w.tasks[0].approvedAt = pkt("2026-10-21T09:30:00").toISOString();
    const r = runTick(w, ready, NOW, uid);
    expect(local(new Date(r.world.tasks[0].dueAt))).toBe("Fri 20 Nov, 15:00");
  });
});

describe("the ladder, as the spec sets it", () => {
  it("urgent work climbs sooner", () => {
    const w = makeWorld();
    const base = { assigneeId: "p_kamran", remindersSent: 3, remindersIgnored: 2, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString() };
    w.people.find((p) => p.id === "p_kamran")!.devices = [{ id: "d", kind: "android", label: "Phone", lastSeen: NOW.toISOString(), healthy: true }];
    w.tasks = [task({ id: "t1", priority: "urgent", ...base }), task({ id: "t2", priority: "normal", ...base })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks.find((t) => t.id === "t1")!.escalationLevel).toBe(2); // 3 ignored reaches urgent L2
    expect(r.world.tasks.find((t) => t.id === "t2")!.escalationLevel).toBe(1); // 3 ignored is only normal L1
  });

  it("an unclaimed offer climbs to whoever runs the unit", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_hina", groupClaim: { unitName: "Field", claimed: false, unitType: "team", unitId: "t_field" }, remindersSent: 5, remindersIgnored: 4, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString() })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(2);
    expect(r.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_usman" && n.title.includes("Nobody in Field"))).toBe(true);
  });

  it("unreviewed work: reviewer and owner at the deadline, the head at twice, flagged at three times", () => {
    const w = makeWorld();
    w.settings.reviewSlaHours = 24;
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "submitted", submittedAt: pkt("2026-10-20T09:00:00").toISOString() })];
    const r1 = runTick(w, ready, NOW, uid);
    const to = (r: typeof r1, id: string) => r.world.notifications.filter((n) => n.recipientId === id);
    expect(to(r1, "p_usman")).toHaveLength(1);
    expect(to(r1, "p_owner").some((n) => n.kind === "escalation")).toBe(true);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-22T10:00:00"), uid);
    expect(to(r2, "p_hina").some((n) => n.kind === "escalation")).toBe(true);
    const r3 = runTick(r2.world, r2.state, pkt("2026-10-23T10:00:00"), uid);
    expect(r3.world.tasks[0].escalationLevel).toBe(4);
    expect(r3.world.notifications.some((n) => n.recipientId === "p_owner" && n.body.includes("unresponsive"))).toBe(true);
  });

  it("every skipped reminder is logged once a day, with why", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_faisal")!.onLeave = true;
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", snoozedUntil: pkt("2026-10-21T11:00:00").toISOString() }), task({ id: "t2", assigneeId: "p_faisal" })];
    const r = runTick(w, ready, NOW, uid);
    const skips = r.world.activity.filter((a) => a.text.startsWith("Reminder skipped"));
    expect(skips.find((a) => a.taskId === "t1")?.text).toMatch(/snoozed/);
    expect(skips.find((a) => a.taskId === "t2")?.text).toMatch(/leave/);
    // not again the same day
    expect(runTick(r.world, r.state, pkt("2026-10-21T10:40:00"), uid).world.activity.filter((a) => a.text.startsWith("Reminder skipped"))).toHaveLength(2);
    // outside hours is its own reason
    const night = runTick(w, ready, pkt("2026-10-21T21:00:00"), uid);
    expect(night.world.activity.some((a) => a.taskId === "t1" && /outside .* working hours/.test(a.text))).toBe(true);
  });

  it("people who missed a working day without leave are marked absent the next morning", () => {
    const w = makeWorld();
    w.attendance = [{ personId: "p_kamran", date: "2026-10-20", checkIn: pkt("2026-10-20T09:00:00").toISOString(), breakMin: 0, status: "present" }];
    w.leaves = [{ id: "l1", personId: "p_ali", from: "2026-10-20", to: "2026-10-20", type: "sick", status: "approved" }];
    const r = runTick(w, { day: "2026-10-20" }, pkt("2026-10-21T00:05:00"), uid);
    const absent = r.world.attendance.filter((a) => a.date === "2026-10-20" && a.status === "absent").map((a) => a.personId).sort();
    expect(absent).toEqual(["p_faisal", "p_hina", "p_saad", "p_usman"]);
  });

  it("managers hear about hand-overs and moved deadlines", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    const handed = applyCommand(w, { type: "reassign", taskId: "t1", toId: "p_faisal", reason: "Kamran is at the bank" }, { actorId: "p_hina", now: NOW, uid });
    expect(handed.notifications.some((n) => n.recipientId === "p_usman" && n.title.includes("handed"))).toBe(true);
    const moved = applyCommand(w, { type: "changeDeadline", taskId: "t1", newDueAt: pkt("2026-10-25T17:00:00").toISOString(), reason: "Client asked" }, { actorId: "p_hina", now: NOW, uid });
    expect(moved.notifications.some((n) => n.recipientId === "p_usman" && n.title.startsWith("Deadline moved"))).toBe(true);
  });
});
