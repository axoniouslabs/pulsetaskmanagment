import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed";
import { emptyWorld, type World } from "@/domain/world";
import { authorize } from "@/domain/permissions";
import { applyCommand } from "@/domain/commands";
import { runTick } from "@/domain/engine";

/** the demo company as a world, so the rules are checked against a realistic org chart */
function seedWorld(): World {
  const s = createSeed(new Date("2026-10-21T10:00:00+05:00"));
  return {
    ...emptyWorld(),
    orgId: "o",
    settings: s.settings,
    people: s.people,
    departments: s.departments,
    teams: s.teams,
    groups: s.groups,
    tasks: s.tasks,
    channels: s.channels,
    announcements: s.announcements,
    attendance: s.attendance,
    leaves: s.leaves,
    questions: s.questions,
    deadlineRequests: s.deadlineRequests,
  };
}
let n = 0;
const ctx = (actorId: string) => ({ actorId, now: new Date("2026-10-21T10:00:00+05:00"), uid: (p: string) => `${p}_${n++}` });
const due = new Date("2026-10-22T12:00:00+05:00").toISOString();

function cast(w: World) {
  const owner = w.people.find((p) => p.role === "owner")!;
  const dept = w.departments.find((d) => w.teams.some((t) => t.departmentId === d.id) && w.people.some((p) => p.role === "employee" && p.departmentId !== d.id))!;
  const head = w.people.find((p) => p.id === dept.headId)!;
  const team = w.teams.find((t) => t.departmentId === dept.id)!;
  const outsider = w.people.find((p) => p.role === "employee" && p.departmentId !== dept.id)!;
  const insider = w.people.find((p) => p.role === "employee" && p.departmentId === dept.id)!;
  return { owner, dept, head, team, outsider, insider };
}

describe("structure changes stay inside your own department", () => {
  it("a head can't make someone from another department a team lead", () => {
    const w = seedWorld();
    const { head, team, outsider } = cast(w);
    expect(authorize(w, head.id, { type: "setTeamLead", teamId: team.id, personId: outsider.id }).ok).toBe(false);
  });

  it("a head can't pull in the owner as a team lead", () => {
    const w = seedWorld();
    const { head, team, owner } = cast(w);
    expect(authorize(w, head.id, { type: "setTeamLead", teamId: team.id, personId: owner.id }).ok).toBe(false);
  });

  it("a head demoted to employee no longer runs the department", () => {
    const w = seedWorld();
    const { head, team, insider } = cast(w);
    w.people.find((p) => p.id === head.id)!.role = "employee";
    expect(authorize(w, head.id, { type: "setTeamLead", teamId: team.id, personId: insider.id }).ok).toBe(false);
    expect(authorize(w, head.id, { type: "setTeamLead", teamId: team.id, personId: head.id }).ok).toBe(false);
  });

  it("a team lead can't be taken from a team they already run", () => {
    const w = seedWorld();
    const { owner } = cast(w);
    const [a, b] = w.teams.filter((t) => t.leadId);
    expect(() => applyCommand(w, { type: "setTeamLead", teamId: b.id, personId: a.leadId }, ctx(owner.id))).toThrow();
  });
});

describe("tasks only go to people you manage", () => {
  it("an employee can't hand their own task to the owner", () => {
    const w0 = seedWorld();
    const { owner, insider } = cast(w0);
    const w = applyCommand(w0, { type: "createTask", id: "mine", input: { title: "Mine", assigneeId: insider.id, priority: "normal", dueAt: due } }, ctx(insider.id));
    expect(authorize(w, insider.id, { type: "reassign", taskId: "mine", toId: owner.id, reason: "x" }).ok).toBe(false);
  });

  it("a manager can't reach outside their team by offering a task to a group", () => {
    const w0 = seedWorld();
    const { head, outsider } = cast(w0);
    const w = applyCommand(w0, { type: "addGroup", name: "Mine", description: "", memberIds: [] }, ctx(head.id));
    const g = w.groups.find((x) => x.ownerId === head.id && x.name === "Mine")!;
    const cmd = { type: "createTask" as const, id: "c1", input: { title: "x", assigneeId: outsider.id, priority: "normal" as const, dueAt: due, claim: { unitType: "group" as const, unitId: g.id } } };
    expect(authorize(w, head.id, cmd).ok).toBe(false);
  });

  it("the owner can still hand any task to anyone", () => {
    const w = seedWorld();
    const { owner, outsider } = cast(w);
    const t = w.tasks.find((x) => x.status === "assigned" && x.assigneeId !== outsider.id)!;
    expect(authorize(w, owner.id, { type: "reassign", taskId: t.id, toId: outsider.id, reason: "x" }).ok).toBe(true);
  });
});

describe("reminders can't be switched off from below", () => {
  it("an employee can't mark themselves as on leave", () => {
    const w = seedWorld();
    const { insider } = cast(w);
    expect(authorize(w, insider.id, { type: "setOnLeave", personId: insider.id, onLeave: true }).ok).toBe(false);
  });

  it("a manager can mark someone in their team as away", () => {
    const w = seedWorld();
    const { head, insider } = cast(w);
    expect(authorize(w, head.id, { type: "setOnLeave", personId: insider.id, onLeave: true }).ok).toBe(true);
  });

  it("a blocker has to be a real person in the company", () => {
    const w = seedWorld();
    const t = w.tasks.find((x) => x.status === "in_progress")!;
    expect(authorize(w, t.assigneeId, { type: "block", taskId: t.id, reason: "waiting", blockerOwnerId: "p_nobody" }).ok).toBe(false);
  });
});

describe("people who have left", () => {
  it("escalations skip a deactivated team lead and reach someone active", () => {
    const w = seedWorld();
    const team = w.teams.find((t) => t.leadId && w.people.some((p) => p.teamId === t.id && p.id !== t.leadId && p.role === "employee"))!;
    const member = w.people.find((p) => p.teamId === team.id && p.id !== team.leadId && p.role === "employee")!;
    w.people.find((p) => p.id === team.leadId)!.active = false;
    w.tasks = w.tasks.filter((t) => t.assigneeId !== member.id);
    const late = new Date("2026-10-21T08:00:00+05:00").toISOString();
    w.tasks.push({
      ...w.tasks[0],
      id: "late",
      assigneeId: member.id,
      reviewerId: team.leadId,
      status: "assigned",
      dueAt: late,
      createdAt: new Date("2026-10-20T09:00:00+05:00").toISOString(),
      startAt: undefined,
      escalationLevel: 0,
      groupClaim: undefined,
      recurrence: undefined,
      snoozedUntil: undefined,
    });
    const r = runTick(w, { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" }, new Date("2026-10-21T11:00:00+05:00"), (p) => `${p}_${n++}`);
    const esc = r.world.notifications.filter((x) => x.kind === "escalation" && x.taskId === "late");
    expect(esc.length).toBeGreaterThan(0);
    expect(esc.every((x) => r.world.people.find((p) => p.id === x.recipientId)?.active !== false)).toBe(true);
  });
});
