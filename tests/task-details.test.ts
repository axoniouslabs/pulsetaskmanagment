import { describe, expect, it } from "vitest";
import { applyCommand, tryCommand, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { runTick } from "@/domain/engine";
import { overdueFrom } from "@/domain/time";
import { isOverdue } from "@/lib/selectors";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00");
const ctx = (actorId: string, now = NOW) => ({ actorId, now, uid });
const ready = { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" };
const create = (input: Partial<Extract<Command, { type: "createTask" }>["input"]>, id = "t_new"): Command => ({
  type: "createTask",
  id,
  input: { title: "Count the stock", assigneeId: "p_kamran", priority: "normal", dueAt: pkt("2026-10-22T17:00:00").toISOString(), ...input },
});

describe("deadlines and working hours", () => {
  it("a deadline at closing time is due at close, overdue only from the next working morning", () => {
    const w = makeWorld();
    expect(overdueFrom(w, "p_kamran", pkt("2026-10-21T18:00:00").toISOString())).toBe(pkt("2026-10-22T09:00:00").toISOString());
    // inside working hours it's the deadline itself
    expect(overdueFrom(w, "p_kamran", pkt("2026-10-21T15:00:00").toISOString())).toBe(pkt("2026-10-21T15:00:00").toISOString());
    // Saturday evening rolls over Sunday (a day off) to Monday morning
    expect(overdueFrom(w, "p_kamran", pkt("2026-10-24T19:00:00").toISOString())).toBe(pkt("2026-10-26T09:00:00").toISOString());
    const t = applyCommand(w, create({ dueAt: pkt("2026-10-21T18:00:00").toISOString() }), ctx("p_usman")).tasks[0];
    expect(isOverdue(t, pkt("2026-10-21T18:30:00"))).toBe(false);
    expect(isOverdue(t, pkt("2026-10-22T09:01:00"))).toBe(true);
  });

  it("a date-only deadline is due at the end of the assignee's working day", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_kamran")!.schedule = { workEnd: "16:00" };
    const t = applyCommand(w, create({ dueAt: pkt("2026-10-22T09:30:00").toISOString(), dueAllDay: true }), ctx("p_usman")).tasks[0];
    expect(t.dueAt).toBe(pkt("2026-10-22T16:00:00").toISOString());
    expect(t.dueAllDay).toBe(true);
  });

  it("the engine doesn't escalate an overnight deadline as overdue before the morning", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "acknowledged", acknowledgedAt: NOW.toISOString(), dueAt: pkt("2026-10-21T18:00:00").toISOString() })];
    const evening = runTick(w, ready, pkt("2026-10-21T20:00:00"), uid);
    expect(evening.world.tasks[0].escalationLevel).toBe(0);
  });
});

describe("watchers, reviewer, tags", () => {
  it("watchers are told, can see the task, and can stop watching", () => {
    let w = applyCommand(makeWorld(), create({ watcherIds: ["p_ali"] }), ctx("p_usman"));
    expect(w.tasks[0].watcherIds).toEqual(["p_ali"]);
    expect(w.notifications.some((n) => n.recipientId === "p_ali" && n.title.includes("watcher"))).toBe(true);
    w = applyCommand(w, { type: "setWatching", taskId: "t_new", watch: false }, ctx("p_ali"));
    expect(w.tasks[0].watcherIds).toEqual([]);
    expect(tryCommand(w, { type: "setWatching", taskId: "t_new", watch: true }, ctx("p_kamran")).result.ok).toBe(false); // the owner already gets everything
  });

  it("a named reviewer reviews; nobody reviews their own work; employees don't choose", () => {
    const w = applyCommand(makeWorld(), create({ reviewerId: "p_hina" }), ctx("p_usman"));
    expect(w.tasks[0].reviewerId).toBe("p_hina");
    expect(tryCommand(makeWorld(), create({ reviewerId: "p_kamran" }), ctx("p_usman")).result.ok).toBe(false);
    expect(authorize(makeWorld(), "p_kamran", create({ reviewerId: "p_faisal" })).ok).toBe(false);
  });

  it("the assignee may edit only the description of their own task", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    expect(authorize(w, "p_kamran", { type: "editTask", taskId: "t1", patch: { description: "Bring the van keys" } }).ok).toBe(true);
    expect(authorize(w, "p_kamran", { type: "editTask", taskId: "t1", patch: { description: "x", priority: "low" } }).ok).toBe(false);
    expect(authorize(w, "p_faisal", { type: "editTask", taskId: "t1", patch: { description: "x" } }).ok).toBe(false);
  });
});

describe("progress", () => {
  it("only the assignee posts progress, with a note, and the reviewer hears", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "in_progress" })];
    expect(authorize(w, "p_usman", { type: "setProgress", taskId: "t1", pct: 50, note: "x" }).ok).toBe(false);
    expect(tryCommand(w, { type: "setProgress", taskId: "t1", pct: 50, note: " " }, ctx("p_kamran")).result.ok).toBe(false);
    const out = applyCommand(w, { type: "setProgress", taskId: "t1", pct: 60, note: "Two branches done" }, ctx("p_kamran"));
    expect(out.tasks[0]).toMatchObject({ progress: 60, progressNote: "Two branches done" });
    expect(out.notifications.some((n) => n.recipientId === "p_usman")).toBe(true);
  });

  it("asks for an update on schedule, and tells the reviewer after two missed", () => {
    const w = makeWorld();
    const started = pkt("2026-10-18T10:00:00").toISOString();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "in_progress", startedAt: started, statusChangedAt: started, updateEveryDays: 1 })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.notifications.some((n) => n.recipientId === "p_kamran" && n.title.startsWith("Time for an update"))).toBe(true);
    expect(r.world.notifications.some((n) => n.recipientId === "p_usman" && n.title.startsWith("No update"))).toBe(true);
    // not again within the same period
    expect(runTick(r.world, r.state, pkt("2026-10-21T11:00:00"), uid).world.notifications.length).toBe(r.world.notifications.length);
  });
});

describe("review", () => {
  it("sending work back restarts its reminders", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "submitted", escalationLevel: 2, remindersToday: 5, lastReminderAt: NOW.toISOString() })];
    const out = applyCommand(w, { type: "reject", taskId: "t1", reason: "Photo is blurry" }, ctx("p_usman"));
    expect(out.tasks[0]).toMatchObject({ status: "in_progress", escalationLevel: 0, remindersToday: 0 });
    expect(out.tasks[0].lastReminderAt).toBeUndefined();
  });

  it("a reviewer can pass a review up to their head, with a reason", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "submitted" })];
    expect(authorize(w, "p_faisal", { type: "escalateReview", taskId: "t1", note: "x" }).ok).toBe(false);
    const out = applyCommand(w, { type: "escalateReview", taskId: "t1", note: "Needs the head's OK on price" }, ctx("p_usman"));
    expect(out.tasks[0].reviewerId).toBe("p_hina");
    expect(out.notifications.some((n) => n.recipientId === "p_hina" && n.kind === "escalation")).toBe(true);
  });
});

describe("archive, links, duplicates", () => {
  it("archives only finished work, by hand or automatically after the set days", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress" }), task({ id: "t2", assigneeId: "p_kamran", status: "approved", approvedAt: pkt("2026-09-01T10:00:00").toISOString() })];
    expect(tryCommand(w, { type: "archiveTask", taskId: "t1", archived: true }, ctx("p_usman")).result.ok).toBe(false);
    expect(authorize(w, "p_kamran", { type: "archiveTask", taskId: "t2", archived: true }).ok).toBe(false);
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks.find((t) => t.id === "t2")!.archivedAt).toBeTruthy();
    expect(r.world.tasks.find((t) => t.id === "t1")!.archivedAt).toBeUndefined();
  });

  it("adds web links only", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    const out = applyCommand(w, { type: "addLink", taskId: "t1", url: "https://drive.google.com/file/abc" }, ctx("p_kamran"));
    expect(out.tasks[0].attachments[0]).toMatchObject({ kind: "link", name: "drive.google.com" });
    expect(tryCommand(w, { type: "addLink", taskId: "t1", url: "javascript:alert(1)" }, ctx("p_kamran")).result.ok).toBe(false);
    expect(tryCommand(w, { type: "addLink", taskId: "t1", url: "not a link" }, ctx("p_kamran")).result.ok).toBe(false);
  });

  it("saved views belong to the person and are capped", () => {
    const w = applyCommand(makeWorld(), { type: "setSavedViews", views: [{ id: "v1", name: "Late in Sales", sort: "deadline", filters: { quick: "overdue" } }] }, ctx("p_usman"));
    expect(w.savedViews.p_usman).toHaveLength(1);
    expect(w.savedViews.p_kamran).toBeUndefined();
    const many = Array.from({ length: 31 }, (_, i) => ({ id: `v${i}`, name: "x", sort: "deadline", filters: {} }));
    expect(tryCommand(makeWorld(), { type: "setSavedViews", views: many }, ctx("p_usman")).result.ok).toBe(false);
  });
});
