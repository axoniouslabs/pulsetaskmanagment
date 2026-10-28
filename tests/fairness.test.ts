import { describe, expect, it } from "vitest";
import { applyCommand, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { runTick } from "@/domain/engine";
import { computeDailyStats } from "@/domain/stats";
import type { World } from "@/domain/world";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00");
const ready = { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" };
const run = (w: World, actorId: string, cmd: Command, at = NOW) => {
  const ok = authorize(w, actorId, cmd);
  if (!ok.ok) throw new Error(ok.error);
  return applyCommand(w, cmd, { actorId, now: at, uid });
};
const denied = (w: World, actorId: string, cmd: Command) => !authorize(w, actorId, cmd).ok;

describe("waiting on another task", () => {
  it("isn't chased or escalated, and is released when the other task is cancelled", () => {
    const w = makeWorld();
    w.tasks = [
      task({ id: "a", assigneeId: "p_faisal" }),
      task({ id: "b", assigneeId: "p_kamran", dependsOn: ["a"], remindersSent: 6, remindersIgnored: 5, lastReminderAt: pkt("2026-10-21T08:00:00").toISOString() }),
    ];
    const r = runTick(w, ready, NOW, uid);
    const b = r.world.tasks.find((t) => t.id === "b")!;
    expect(b.escalationLevel).toBe(0);
    expect(r.world.notifications.some((n) => n.taskId === "b")).toBe(false);
    const after = run(r.world, "p_usman", { type: "cancel", taskId: "a", reason: "Client dropped it" });
    expect(after.notifications.some((n) => n.recipientId === "p_kamran" && n.title === "You can start now")).toBe(true);
  });
});

describe("reports count only what is someone's own doing", () => {
  it("a slow reviewer's escalations and a blocker's reminders don't count against the assignee", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "submitted", submittedAt: pkt("2026-10-19T09:00:00").toISOString() })];
    w.settings.reviewSlaHours = 24;
    w = runTick(w, ready, NOW, uid).world;
    const rows = computeDailyStats(w, "2026-10-21");
    expect(rows.find((r) => r.personId === "p_kamran")?.escalations ?? 0).toBe(0);
    expect(rows.find((r) => r.personId === "p_usman")!.escalations).toBeGreaterThan(0);
  });

  it("time blocked counts against the blocker; each rework round is timed apart", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "assigned", createdAt: pkt("2026-10-21T09:00:00").toISOString() })];
    w = run(w, "p_kamran", { type: "start", taskId: "t1" }, pkt("2026-10-21T09:00:00"));
    w = run(w, "p_kamran", { type: "block", taskId: "t1", reason: "Need rates", blockerOwnerId: "p_faisal" }, pkt("2026-10-21T10:00:00"));
    w = run(w, "p_faisal", { type: "unblock", taskId: "t1", note: "Sent" }, pkt("2026-10-21T12:00:00"));
    w = run(w, "p_kamran", { type: "submit", taskId: "t1", note: "Done" }, pkt("2026-10-21T13:00:00"));
    w = run(w, "p_usman", { type: "reject", taskId: "t1", reason: "Wrong rate" }, pkt("2026-10-21T14:00:00"));
    w = run(w, "p_kamran", { type: "submit", taskId: "t1", note: "Fixed" }, pkt("2026-10-21T14:30:00"));
    w = run(w, "p_usman", { type: "approve", taskId: "t1", note: "OK" }, pkt("2026-10-21T15:30:00"));
    const rows = computeDailyStats(w, "2026-10-21");
    const k = rows.find((r) => r.personId === "p_kamran")!;
    expect(k.workHours).toBe(2); // 9–13 minus 2h blocked
    expect(k.reworkHours).toBe(0.5);
    expect(k.blockedHours).toBe(2);
    expect(rows.find((r) => r.personId === "p_faisal")!.blockingHours).toBe(2);
    const u = rows.find((r) => r.personId === "p_usman")!;
    expect(u.reviewsDone).toBe(2);
    expect(u.reviewGivenHours).toBe(1); // 1h and 1h
  });
});

describe("permissions the spec sets", () => {
  it("review can be skipped only for low priority, by the owner or when the owner allows managers", () => {
    const w = makeWorld();
    const input = (priority: "low" | "normal") => ({ title: "Tidy shelf", assigneeId: "p_kamran", priority, dueAt: pkt("2026-10-22T17:00:00").toISOString(), requiresApproval: false });
    w.settings.approvalByDefault = true;
    expect(() => run(w, "p_usman", { type: "createTask", id: "x1", input: input("low") })).toThrow(/owner/);
    expect(run(w, "p_owner", { type: "createTask", id: "x2", input: input("low") }).tasks.find((t) => t.id === "x2")!.requiresApproval).toBe(false);
    expect(() => run(w, "p_owner", { type: "createTask", id: "x3", input: input("normal") })).toThrow(/low-priority/);
    w.settings.lowPriorityNoApproval = true;
    expect(run(w, "p_usman", { type: "createTask", id: "x4", input: input("low") }).tasks.find((t) => t.id === "x4")!.requiresApproval).toBe(false);
    // an employee's own task is always reviewed
    const own = run(w, "p_kamran", { type: "createTask", id: "x5", input: { ...input("low"), reminder: { intervalMin: 5 } } as never });
    expect(own.tasks.find((t) => t.id === "x5")).toMatchObject({ requiresApproval: true });
    expect(own.tasks.find((t) => t.id === "x5")!.reminder.intervalMin).toBe(w.settings.defaultReminder.intervalMin);
    expect(denied(own, "p_kamran", { type: "cancel", taskId: "x5", reason: "x" })).toBe(true);
    expect(denied(own, "p_kamran", { type: "changeDeadline", taskId: "x5", newDueAt: pkt("2026-10-25T17:00:00").toISOString(), reason: "x" })).toBe(true);
  });

  it("a lead hands their own task down and stays as a watcher, who then hears about it", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_usman", reviewerId: "p_hina", createdById: "p_owner" })];
    w = run(w, "p_usman", { type: "reassign", taskId: "t1", toId: "p_kamran", reason: "Kamran knows this client" });
    expect(w.tasks[0]).toMatchObject({ assigneeId: "p_kamran" });
    expect(w.tasks[0].watcherIds).toContain("p_usman");
    expect(denied(w, "p_usman", { type: "reassign", taskId: "t1", toId: "p_ali", reason: "x" })).toBe(true);
    w = run(w, "p_kamran", { type: "start", taskId: "t1" });
    w = run(w, "p_kamran", { type: "submit", taskId: "t1", note: "Done" });
    expect(w.notifications.some((n) => n.recipientId === "p_usman" && n.taskId === "t1" && n.kind === "submitted")).toBe(true);
  });

  it("managers correct time and attendance and record leave; nobody corrects their own", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", loggedMinutes: 120, timeEntries: [{ id: "e1", personId: "p_kamran", minutes: 120, from: pkt("2026-10-20T09:00:00").toISOString() }] })];
    expect(denied(w, "p_kamran", { type: "correctTimeEntry", taskId: "t1", entryId: "e1", minutes: 60, reason: "x" })).toBe(true);
    w = run(w, "p_usman", { type: "correctTimeEntry", taskId: "t1", entryId: "e1", minutes: 90, reason: "Lunch" });
    expect(w.tasks[0].loggedMinutes).toBe(90);
    expect(w.tasks[0].timeEntries![0].corrected).toMatchObject({ fromMinutes: 120, reason: "Lunch" });
    w = run(w, "p_usman", { type: "correctAttendance", personId: "p_kamran", date: "2026-10-20", checkIn: "09:05", checkOut: "18:00", reason: "Forgot to check in" });
    expect(w.attendance.find((a) => a.personId === "p_kamran" && a.date === "2026-10-20")).toMatchObject({ status: "present" });
    w = run(w, "p_usman", { type: "recordLeave", personId: "p_faisal", from: "2026-10-21", to: "2026-10-23", leaveType: "sick", note: "" });
    expect(w.people.find((p) => p.id === "p_faisal")!.onLeave).toBe(true);
    expect(() => run(w, "p_usman", { type: "recordLeave", personId: "p_faisal", from: "2026-10-22", to: "2026-10-22", leaveType: "casual", note: "" })).toThrow(/already/);
  });
});

describe("level 4 is for silence", () => {
  it("work someone is talking about isn't flagged unresponsive", () => {
    const w = makeWorld();
    const due = pkt("2026-10-20T09:00:00").toISOString();
    w.tasks = [
      task({ id: "quiet", assigneeId: "p_kamran", status: "in_progress", dueAt: due, statusChangedAt: pkt("2026-10-19T10:00:00").toISOString() }),
      task({
        id: "talking",
        assigneeId: "p_faisal",
        status: "in_progress",
        dueAt: due,
        statusChangedAt: pkt("2026-10-19T10:00:00").toISOString(),
        progressAt: pkt("2026-10-20T15:00:00").toISOString(),
      }),
    ];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks.find((t) => t.id === "quiet")!.escalationLevel).toBe(4);
    expect(r.world.tasks.find((t) => t.id === "talking")!.escalationLevel).toBe(3);
  });
});
