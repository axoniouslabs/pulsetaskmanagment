import { describe, expect, it } from "vitest";
import { applyCommand, tryCommand } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { parseCsv } from "@/components/pages/tasks/import-dialog";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00");
const ctx = (actorId: string) => ({ actorId, now: NOW, uid });

describe("dependencies", () => {
  it("can't start until what it waits for is done, then the owner is told", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "first", assigneeId: "p_kamran", status: "submitted", submittedAt: NOW.toISOString() }), task({ id: "second", assigneeId: "p_faisal", dependsOn: ["first"] })];
    expect(tryCommand(w, { type: "start", taskId: "second" }, ctx("p_faisal")).result.ok).toBe(false);
    expect(tryCommand(w, { type: "acknowledge", taskId: "second" }, ctx("p_faisal")).result.ok).toBe(true);
    w = applyCommand(w, { type: "approve", taskId: "first" }, ctx("p_usman"));
    expect(w.notifications.some((n) => n.recipientId === "p_faisal" && n.title === "You can start now")).toBe(true);
    expect(tryCommand(w, { type: "start", taskId: "second" }, ctx("p_faisal")).result.ok).toBe(true);
  });

  it("refuses loops", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "a", assigneeId: "p_kamran", dependsOn: ["b"] }), task({ id: "b", assigneeId: "p_kamran" })];
    expect(tryCommand(w, { type: "editTask", taskId: "b", patch: { dependsOn: ["a"] } }, ctx("p_usman")).result.ok).toBe(false);
  });
});

describe("team tasks, first to claim", () => {
  it("tells every member, and only a member can claim it", () => {
    let w = makeWorld();
    w = applyCommand(w, { type: "createTask", id: "t_team", input: { title: "Visit new shop", assigneeId: "p_usman", priority: "normal", dueAt: pkt("2026-10-22T17:00:00").toISOString(), claim: { unitType: "team", unitId: "t_field" } } }, ctx("p_usman"));
    const told = w.notifications.filter((n) => n.taskId === "t_team").map((n) => n.recipientId).sort();
    expect(told).toEqual(["p_faisal", "p_hina", "p_kamran"]);
    expect(authorize(w, "p_ali", { type: "claimTask", taskId: "t_team" }).ok).toBe(false);
    expect(authorize(w, "p_kamran", { type: "claimTask", taskId: "t_team" }).ok).toBe(true);
    w = applyCommand(w, { type: "claimTask", taskId: "t_team" }, ctx("p_kamran"));
    expect(w.tasks[0]).toMatchObject({ assigneeId: "p_kamran", status: "acknowledged" });
    expect(tryCommand(w, { type: "claimTask", taskId: "t_team" }, ctx("p_faisal")).result.ok).toBe(false);
  });

  it("only the people running a team can offer work to it", () => {
    const w = makeWorld();
    const cmd = { type: "createTask" as const, id: "x", input: { title: "x", assigneeId: "p_usman", priority: "normal" as const, dueAt: NOW.toISOString(), claim: { unitType: "team" as const, unitId: "t_field" } } };
    expect(authorize(w, "p_saad", cmd).ok).toBe(false);
    expect(authorize(w, "p_hina", cmd).ok).toBe(true);
  });
});

describe("editing and templates", () => {
  it("records edits and tells the assignee", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    const after = applyCommand(w, { type: "editTask", taskId: "t1", patch: { title: "New title", priority: "urgent" } }, ctx("p_usman"));
    expect(after.tasks[0]).toMatchObject({ title: "New title", priority: "urgent" });
    expect(after.activity[0].text).toContain("priority to urgent");
    expect(after.notifications.some((n) => n.recipientId === "p_kamran")).toBe(true);
    expect(authorize(w, "p_kamran", { type: "editTask", taskId: "t1", patch: {} }).ok).toBe(false);
  });

  it("saves and deletes templates", () => {
    let w = makeWorld();
    w = applyCommand(w, { type: "saveTemplate", id: "tpl1", name: "Stock count", input: { title: "Count stock", priority: "high", subtasks: ["Count", "Photo"] } }, ctx("p_usman"));
    expect(w.templates).toHaveLength(1);
    expect(authorize(w, "p_kamran", { type: "saveTemplate", id: "tpl2", name: "x", input: { title: "x", priority: "low" } }).ok).toBe(false);
    expect(authorize(w, "p_hina", { type: "deleteTemplate", id: "tpl1" }).ok).toBe(false);
    w = applyCommand(w, { type: "deleteTemplate", id: "tpl1" }, ctx("p_usman"));
    expect(w.templates).toHaveLength(0);
  });
});

describe("CSV import", () => {
  it("handles quotes, commas and line breaks inside fields", () => {
    const rows = parseCsv('title,assignee\n"Call dealers, Lahore",ali@x.pk\r\n"Say ""hi""\nthen leave",sana\n');
    expect(rows).toEqual([["title", "assignee"], ["Call dealers, Lahore", "ali@x.pk"], ['Say "hi"\nthen leave', "sana"]]);
  });
});
