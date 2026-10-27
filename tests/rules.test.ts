import { describe, expect, it } from "vitest";
import { applyCommand, tryCommand, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00");
const ctx = (actorId: string) => ({ actorId, now: NOW, uid });
const due = pkt("2026-10-22T17:00:00").toISOString();

function world() {
  const w = makeWorld();
  w.tasks = [
    task({ id: "t_k", assigneeId: "p_kamran" }),
    task({
      id: "t_ali",
      assigneeId: "p_ali",
      createdById: "p_saad",
      reviewerId: "p_saad",
      departmentId: "d_dev",
      status: "in_progress",
      startedAt: NOW.toISOString(),
      requiresProof: true,
    }),
  ];
  return w;
}
const can = (actor: string, cmd: Command) => authorize(world(), actor, cmd).ok;

describe("who may do what", () => {
  it("lets managers assign inside their scope only", () => {
    const create = (assigneeId: string): Command => ({
      type: "createTask",
      id: "new",
      input: { title: "x", assigneeId, priority: "normal", dueAt: due },
    });
    expect(can("p_usman", create("p_kamran"))).toBe(true);
    expect(can("p_usman", create("p_ali"))).toBe(false);
    expect(can("p_hina", create("p_faisal"))).toBe(true); // head of the department
    expect(can("p_owner", create("p_ali"))).toBe(true);
    expect(can("p_kamran", create("p_faisal"))).toBe(false);
    expect(can("p_kamran", create("p_kamran"))).toBe(true); // a note to self
  });

  it("keeps the assignee's buttons for the assignee", () => {
    expect(can("p_kamran", { type: "acknowledge", taskId: "t_k" })).toBe(true);
    expect(can("p_faisal", { type: "acknowledge", taskId: "t_k" })).toBe(false);
    expect(can("p_usman", { type: "submit", taskId: "t_k", note: "" })).toBe(false);
  });

  it("never lets anyone approve their own work, and employees can't review", () => {
    const w = world();
    w.tasks[1].status = "submitted";
    expect(authorize(w, "p_ali", { type: "approve", taskId: "t_ali" }).ok).toBe(false);
    expect(authorize(w, "p_kamran", { type: "approve", taskId: "t_ali" }).ok).toBe(false);
    expect(authorize(w, "p_saad", { type: "approve", taskId: "t_ali" }).ok).toBe(true);
  });

  it("keeps company settings with the owner", () => {
    expect(can("p_hina", { type: "updateSettings", patch: { workStart: "08:00" } })).toBe(false);
    expect(can("p_owner", { type: "updateSettings", patch: { workStart: "08:00" } })).toBe(true);
  });

  it("refuses deactivated people", () => {
    const w = world();
    w.people.find((p) => p.id === "p_kamran")!.active = false;
    expect(authorize(w, "p_kamran", { type: "acknowledge", taskId: "t_k" }).ok).toBe(false);
  });
});

describe("task rules", () => {
  it("records every step in the activity log with notifications", () => {
    let w = world();
    w = applyCommand(w, { type: "acknowledge", taskId: "t_k" }, ctx("p_kamran"));
    w = applyCommand(w, { type: "start", taskId: "t_k" }, ctx("p_kamran"));
    w = applyCommand(w, { type: "submit", taskId: "t_k", note: "Done" }, ctx("p_kamran"));
    const t = w.tasks.find((x) => x.id === "t_k")!;
    expect(t.status).toBe("submitted");
    expect(w.activity.map((a) => a.kind)).toEqual(["submitted", "started", "acknowledged"]);
    expect(w.notifications.filter((n) => n.recipientId === "p_usman" && n.kind === "submitted")).toHaveLength(1);
  });

  it("needs proof when the task asks for it", () => {
    const r = tryCommand(world(), { type: "submit", taskId: "t_ali", note: "done" }, ctx("p_ali"));
    expect(r.result.ok).toBe(false);
    // only a real upload counts as proof
    const withProof = world();
    withProof.tasks
      .find((t) => t.id === "t_ali")!
      .attachments.push({
        id: "a1",
        name: "photo.jpg",
        kind: "image",
        sizeKb: 100,
        at: new Date().toISOString(),
        byId: "p_ali",
        isProof: true,
        hue: 10,
      });
    const ok = tryCommand(withProof, { type: "submit", taskId: "t_ali", note: "done" }, ctx("p_ali"));
    expect(ok.result.ok).toBe(true);
  });

  it("limits snoozes per day and snooze lengths", () => {
    const w = world();
    w.tasks[0].snoozesToday = 3;
    expect(tryCommand(w, { type: "snooze", taskId: "t_k", minutes: 30 }, ctx("p_kamran")).result.ok).toBe(false);
    expect(tryCommand(world(), { type: "snooze", taskId: "t_k", minutes: 45 }, ctx("p_kamran")).result.ok).toBe(false);
  });

  it("acknowledging calms the ladder back down", () => {
    const w = world();
    w.tasks[0].escalationLevel = 2;
    w.tasks[0].remindersIgnored = 5;
    const t = applyCommand(w, { type: "acknowledge", taskId: "t_k" }, ctx("p_kamran")).tasks[0];
    expect(t.escalationLevel).toBe(0);
    expect(t.remindersIgnored).toBe(0);
  });

  it("checks in late after the grace period, in company time", () => {
    const w = applyCommand(world(), { type: "checkIn" }, { actorId: "p_kamran", now: pkt("2026-10-21T09:20:00"), uid });
    expect(w.attendance[0]).toMatchObject({
      date: "2026-10-21",
      status: "late",
    });
    const w2 = applyCommand(world(), { type: "checkIn" }, { actorId: "p_kamran", now: pkt("2026-10-21T09:10:00"), uid });
    expect(w2.attendance[0].status).toBe("present");
  });
});
