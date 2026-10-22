import { describe, expect, it } from "vitest";
import { runTick } from "@/domain/engine";
import { makeWorld, pkt, task, uid } from "./fixtures";

// Wed 21 Oct 2026, 10:00 PKT: a working day, inside working hours
const MORNING = pkt("2026-10-21T10:00:00");
const ready = { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" };

const reminders = (w: ReturnType<typeof makeWorld>, to: string) => w.notifications.filter((n) => n.recipientId === to && n.kind === "reminder");

describe("reminder gates", () => {
  it("reminds an unacknowledged task once the interval has passed", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    const r = runTick(w, ready, MORNING, uid);
    expect(reminders(r.world, "p_kamran")).toHaveLength(1);
    expect(r.world.tasks[0].remindersSent).toBe(1);
    expect(r.world.tasks[0].remindersIgnored).toBe(0); // the first reminder isn't "ignored" yet
    expect(r.world.activity.some((a) => a.kind === "reminder_sent")).toBe(true);
  });

  it("waits for the interval between reminders", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersSent: 1, lastReminderAt: pkt("2026-10-21T09:45:00").toISOString() })];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
    expect(reminders(runTick(w, ready, pkt("2026-10-21T10:16:00"), uid).world, "p_kamran")).toHaveLength(1);
  });

  it("stays quiet outside working hours, on weekly off days and holidays", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    expect(reminders(runTick(w, { ...ready }, pkt("2026-10-21T20:00:00"), uid).world, "p_kamran")).toHaveLength(0);
    expect(reminders(runTick(w, { day: "2026-10-25" }, pkt("2026-10-25T11:00:00"), uid).world, "p_kamran")).toHaveLength(0); // Sunday
    w.settings.holidays = [{ date: "2026-10-21", name: "Test holiday" }];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
  });

  it("reminds at any hour when the task says so", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reminder: { intervalMin: 30, window: "always", dailyCap: 12, channels: ["push"], quietAfterAckMin: 60 } })];
    expect(reminders(runTick(w, ready, pkt("2026-10-21T22:00:00"), uid).world, "p_kamran")).toHaveLength(1);
  });

  it("pauses for snooze, leave and the daily cap", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", snoozedUntil: pkt("2026-10-21T10:30:00").toISOString() })];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);

    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    w.leaves = [{ id: "l1", personId: "p_kamran", from: "2026-10-21", to: "2026-10-21", type: "sick", status: "approved" }];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);

    w.leaves = [];
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersToday: 12 })];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
  });

  it("doesn't start reminding before the task's start time", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", startAt: pkt("2026-10-22T09:00:00").toISOString() })];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
  });
});

describe("escalation ladder", () => {
  it("climbs with ignored reminders and tells the right people", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersSent: 5, remindersIgnored: 4, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString(), escalationLevel: 1 })];
    const r = runTick(w, ready, MORNING, uid);
    const t = r.world.tasks[0];
    expect(t.remindersIgnored).toBe(5);
    expect(t.escalationLevel).toBe(2);
    const esc = r.world.notifications.filter((n) => n.kind === "escalation").map((n) => n.recipientId);
    expect(esc).toEqual(["p_usman"]); // L2: the team lead
  });

  it("level 3 reaches the department head", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersSent: 8, remindersIgnored: 7, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString(), escalationLevel: 2 })];
    const r = runTick(w, ready, MORNING, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(3);
    expect(r.world.notifications.filter((n) => n.kind === "escalation").map((n) => n.recipientId).sort()).toEqual(["p_hina", "p_usman"]);
  });

  it("silence a day past the deadline goes to the owner (level 4)", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", dueAt: pkt("2026-10-20T09:00:00").toISOString(), escalationLevel: 3 })];
    const r = runTick(w, ready, MORNING, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(4);
    expect(r.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_owner")).toBe(true);
  });

  it("a reminder that can't reach any device isn't counted as ignored", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_kamran")!.devices = [{ id: "d1", kind: "android", label: "Phone", lastSeen: "2026-10-01T00:00:00Z", healthy: false }];
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersSent: 2, remindersIgnored: 1, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString() })];
    const t = runTick(w, ready, MORNING, uid).world.tasks[0];
    expect(t.remindersSent).toBe(3);
    expect(t.remindersIgnored).toBe(1);
  });

  it("an overdue task that was acknowledged tells the reviewer once", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress", acknowledgedAt: pkt("2026-10-20T09:00:00").toISOString(), dueAt: pkt("2026-10-21T09:30:00").toISOString() })];
    const r1 = runTick(w, ready, MORNING, uid);
    expect(r1.world.tasks[0].escalationLevel).toBe(3);
    expect(r1.world.notifications.filter((n) => n.kind === "escalation" && n.recipientId === "p_usman")).toHaveLength(1);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-21T10:05:00"), uid);
    expect(r2.world.notifications.filter((n) => n.kind === "escalation")).toHaveLength(1);
  });

  it("nudges a slow reviewer, then their manager", () => {
    const w = makeWorld();
    w.settings.reviewSlaHours = 24;
    w.tasks = [task({ id: "t1", assigneeId: "p_ali", reviewerId: "p_saad", status: "submitted", submittedAt: pkt("2026-10-20T09:00:00").toISOString() })];
    const r1 = runTick(w, ready, MORNING, uid);
    expect(r1.world.notifications.filter((n) => n.recipientId === "p_saad")).toHaveLength(1);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-22T10:00:00"), uid);
    expect(r2.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_owner")).toBe(true);
  });
});

describe("daily work", () => {
  it("resets daily counters on a new day", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "acknowledged", snoozesToday: 3, remindersToday: 9 })];
    const r = runTick(w, { day: "2026-10-20" }, MORNING, uid);
    expect(r.world.tasks[0].snoozesToday).toBe(0);
    expect(r.world.tasks[0].remindersToday).toBe(0);
    expect(r.rollupDates).toContain("2026-10-20");
  });

  it("makes the next copy of a repeating task once, when it's done", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "approved", recurrence: "weekly", dueAt: pkt("2026-10-21T17:00:00").toISOString() })];
    const r1 = runTick(w, ready, MORNING, uid);
    expect(r1.world.tasks).toHaveLength(2);
    const copy = r1.world.tasks[0];
    expect(copy.status).toBe("assigned");
    expect(copy.dueAt).toBe(pkt("2026-10-28T17:00:00").toISOString());
    expect(r1.world.tasks[1].recurrenceNextId).toBe(copy.id);
    expect(runTick(r1.world, r1.state, pkt("2026-10-21T10:01:00"), uid).world.tasks).toHaveLength(2);
  });

  it("sends the morning digest once per working day", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", dueAt: pkt("2026-10-21T17:00:00").toISOString() })];
    const r1 = runTick(w, { day: "2026-10-21" }, pkt("2026-10-21T09:00:30"), uid);
    expect(r1.digestIds.length).toBeGreaterThan(0);
    expect(r1.world.notifications.some((n) => n.kind === "digest" && n.recipientId === "p_kamran" && n.body.includes("1 due today"))).toBe(true);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-21T09:05:00"), uid);
    expect(r2.digestIds).toHaveLength(0);
  });

  it("puts people on leave on their leave day and back afterwards", () => {
    const w = makeWorld();
    w.leaves = [{ id: "l1", personId: "p_ali", from: "2026-10-21", to: "2026-10-21", type: "annual", status: "approved" }];
    const r1 = runTick(w, { day: "2026-10-20" }, MORNING, uid);
    expect(r1.world.people.find((p) => p.id === "p_ali")!.onLeave).toBe(true);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-22T09:30:00"), uid);
    expect(r2.world.people.find((p) => p.id === "p_ali")!.onLeave).toBe(false);
  });
});
