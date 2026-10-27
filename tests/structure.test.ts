import { describe, expect, it } from "vitest";
import { applyCommand, tryCommand, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { runTick } from "@/domain/engine";
import { scopePeople } from "@/lib/selectors";
import { isWorkingTimeFor, timerCutoff } from "@/domain/time";
import { makeWorld, pkt, task, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00"); // Wed, inside working hours
const ctx = (actorId: string, now = NOW) => ({ actorId, now, uid });
const due = pkt("2026-10-22T17:00:00").toISOString();
const ready = { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" };
const newTask = (input: Partial<Extract<Command, { type: "createTask" }>["input"]>, id = "t_new"): Command => ({
  type: "createTask",
  id,
  input: { title: "Call the client", assigneeId: "", priority: "normal", dueAt: due, ...input },
});

describe("working hours per person", () => {
  it("uses the person's own hours, then the department's, then the company's", () => {
    const w = makeWorld();
    w.departments[0].settings = { workStart: "07:00", workEnd: "15:00" };
    expect(isWorkingTimeFor(w, "p_kamran", pkt("2026-10-21T07:30:00"))).toBe(true); // Sales starts early
    expect(isWorkingTimeFor(w, "p_ali", pkt("2026-10-21T07:30:00"))).toBe(false); // Development keeps company hours
    w.people.find((p) => p.id === "p_kamran")!.schedule = { workStart: "12:00", workEnd: "20:00" };
    expect(isWorkingTimeFor(w, "p_kamran", pkt("2026-10-21T07:30:00"))).toBe(false);
    expect(isWorkingTimeFor(w, "p_kamran", pkt("2026-10-21T19:00:00"))).toBe(true);
  });

  it("follows a remote worker's own time zone", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_ali")!.schedule = { timezone: "Europe/London" };
    // 10:00 in Karachi is 06:00 in London (BST, UTC+1): before Ali's day starts
    expect(isWorkingTimeFor(w, "p_ali", NOW)).toBe(false);
    expect(isWorkingTimeFor(w, "p_ali", pkt("2026-10-21T14:00:00"))).toBe(true); // 10:00 London
  });

  it("only reminds inside the assignee's own hours", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_kamran")!.schedule = { workStart: "12:00", workEnd: "20:00" };
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" }), task({ id: "t2", assigneeId: "p_faisal" })];
    const r = runTick(w, ready, NOW, uid);
    const to = (id: string) => r.world.notifications.filter((n) => n.recipientId === id && n.kind === "reminder").length;
    expect(to("p_kamran")).toBe(0);
    expect(to("p_faisal")).toBe(1);
  });

  it("lets a person change their own time zone but not their hours", () => {
    const w = makeWorld();
    expect(authorize(w, "p_kamran", { type: "setPersonSchedule", personId: "p_kamran", schedule: { timezone: "Asia/Dubai" } }).ok).toBe(true);
    expect(authorize(w, "p_kamran", { type: "setPersonSchedule", personId: "p_kamran", schedule: { workStart: "11:00" } }).ok).toBe(false);
    expect(authorize(w, "p_usman", { type: "setPersonSchedule", personId: "p_kamran", schedule: { workStart: "11:00" } }).ok).toBe(true);
    expect(authorize(w, "p_saad", { type: "setPersonSchedule", personId: "p_kamran", schedule: { workStart: "11:00" } }).ok).toBe(false);
  });

  it("judges lateness against the person's own start", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_kamran")!.schedule = { workStart: "11:00" };
    const on = applyCommand(w, { type: "checkIn" }, ctx("p_kamran", pkt("2026-10-21T11:10:00")));
    expect(on.attendance.find((a) => a.personId === "p_kamran")?.status).toBe("present");
    const late = applyCommand(w, { type: "checkIn" }, ctx("p_faisal", pkt("2026-10-21T11:10:00")));
    expect(late.attendance.find((a) => a.personId === "p_faisal")?.status).toBe("late");
  });
});

describe("department rules", () => {
  it("fill in approval and reminder defaults for new tasks", () => {
    const w = makeWorld();
    w.departments[0].settings = { approvalByDefault: false, defaultReminder: { intervalMin: 120 } };
    const out = applyCommand(w, newTask({ assigneeId: "p_kamran" }), ctx("p_usman"));
    const t = out.tasks.find((x) => x.id === "t_new")!;
    expect(t.requiresApproval).toBe(false);
    expect(t.reminder.intervalMin).toBe(120);
    const dev = applyCommand(w, newTask({ assigneeId: "p_ali" }, "t_dev"), ctx("p_saad"));
    expect(dev.tasks.find((x) => x.id === "t_dev")!.requiresApproval).toBe(true);
  });

  it("can be changed by the owner or the head, not a team lead", () => {
    const w = makeWorld();
    const cmd: Command = { type: "updateDepartment", departmentId: "d_sales", patch: { settings: { workStart: "08:00" } } };
    expect(authorize(w, "p_owner", cmd).ok).toBe(true);
    expect(authorize(w, "p_hina", cmd).ok).toBe(true);
    expect(authorize(w, "p_usman", cmd).ok).toBe(false);
    expect(tryCommand(w, { type: "updateDepartment", departmentId: "d_sales", patch: { settings: { workStart: "18:00", workEnd: "09:00" } } }, ctx("p_owner")).result.ok).toBe(false);
  });
});

describe("work aimed at a unit", () => {
  it("takes turns: whoever got work from the pool longest ago is next", () => {
    let w = makeWorld();
    const pool = { unitType: "team" as const, unitId: "t_field", mode: "roundrobin" as const };
    const picked: string[] = [];
    for (let i = 0; i < 4; i++) {
      w = applyCommand(w, newTask({ pool }, `t_rr${i}`), ctx("p_usman", new Date(NOW.getTime() + i * 60000)));
      picked.push(w.tasks.find((t) => t.id === `t_rr${i}`)!.assigneeId);
    }
    // Field has Hina, Usman (its lead), Kamran and Faisal: the lead hands work out, the other three take turns
    expect(picked.slice(0, 3).sort()).toEqual(["p_faisal", "p_hina", "p_kamran"]);
    expect(picked[3]).toBe(picked[0]);
    expect(picked).not.toContain("p_owner");
    expect(picked).not.toContain("p_usman");
  });

  it("skips people who are away when taking turns", () => {
    const w = makeWorld();
    for (const id of ["p_hina", "p_faisal"]) w.people.find((p) => p.id === id)!.onLeave = true;
    const out = applyCommand(w, newTask({ pool: { unitType: "team", unitId: "t_field", mode: "roundrobin" } }), ctx("p_owner"));
    expect(out.tasks.find((t) => t.id === "t_new")!.assigneeId).toBe("p_kamran");
  });

  it("routes to the unit's head, who passes it on to someone in the unit", () => {
    const w = applyCommand(makeWorld(), newTask({ pool: { unitType: "department", unitId: "d_sales", mode: "route" } }), ctx("p_owner"));
    const t = w.tasks.find((x) => x.id === "t_new")!;
    expect(t.assigneeId).toBe("p_hina");
    expect(w.notifications.some((n) => n.recipientId === "p_hina" && n.kind === "assigned")).toBe(true);
    expect(tryCommand(w, { type: "routeTask", taskId: "t_new", toId: "p_ali" }, ctx("p_hina")).result.ok).toBe(false); // not in Sales
    expect(authorize(w, "p_usman", { type: "routeTask", taskId: "t_new", toId: "p_kamran" }).ok).toBe(false);
    const passed = applyCommand(w, { type: "routeTask", taskId: "t_new", toId: "p_kamran" }, ctx("p_hina"));
    const after = passed.tasks.find((x) => x.id === "t_new")!;
    expect(after.assigneeId).toBe("p_kamran");
    expect(after.watcherIds).toContain("p_hina");
    expect(after.pool?.routedAt).toBeTruthy();
    expect(tryCommand(passed, { type: "routeTask", taskId: "t_new", toId: "p_faisal" }, ctx("p_kamran")).result.ok).toBe(false);
  });

  it("only lets whoever runs a unit send it work", () => {
    const w = makeWorld();
    expect(authorize(w, "p_usman", newTask({ pool: { unitType: "team", unitId: "t_field", mode: "roundrobin" } })).ok).toBe(true);
    expect(authorize(w, "p_usman", newTask({ pool: { unitType: "department", unitId: "d_sales", mode: "route" } })).ok).toBe(false);
    expect(authorize(w, "p_saad", newTask({ pool: { unitType: "team", unitId: "t_field", mode: "roundrobin" } })).ok).toBe(false);
    expect(authorize(w, "p_kamran", newTask({ pool: { unitType: "team", unitId: "t_field", mode: "roundrobin" } })).ok).toBe(false);
  });

  it("can offer work to a whole department to claim", () => {
    const w = applyCommand(makeWorld(), newTask({ assigneeId: "p_hina", claim: { unitType: "department", unitId: "d_sales" } }), ctx("p_owner"));
    expect(w.tasks.find((t) => t.id === "t_new")!.groupClaim?.unitName).toBe("Sales");
    expect(w.notifications.filter((n) => n.kind === "assigned").map((n) => n.recipientId)).toEqual(expect.arrayContaining(["p_kamran", "p_faisal", "p_usman"]));
  });
});

describe("projects", () => {
  it("can be created, and a project rule picks who its tasks go to", () => {
    let w = applyCommand(makeWorld(), { type: "addProject", id: "prj_1", name: "Dealer app", leadId: "p_usman", defaultAssigneeId: "p_kamran" }, ctx("p_owner"));
    expect(w.projects).toHaveLength(1);
    expect(tryCommand(w, { type: "addProject", id: "prj_2", name: "dealer APP", leadId: "p_usman" }, ctx("p_owner")).result.ok).toBe(false);
    w = applyCommand(w, newTask({ projectId: "prj_1" }), ctx("p_usman"));
    expect(w.tasks.find((t) => t.id === "t_new")!.assigneeId).toBe("p_kamran");
  });

  it("only send work automatically to someone the creator manages", () => {
    const w = makeWorld();
    expect(authorize(w, "p_saad", { type: "addProject", id: "prj_1", name: "X", leadId: "p_saad", defaultAssigneeId: "p_kamran" }).ok).toBe(false);
    expect(authorize(w, "p_kamran", { type: "addProject", id: "prj_1", name: "X", leadId: "p_kamran" }).ok).toBe(false);
  });
});

describe("secondary teams", () => {
  it("bring a person into another team's view, while escalation stays with the home team", () => {
    const w = applyCommand(makeWorld(), { type: "setSecondaryTeams", personId: "p_kamran", teamIds: ["t_product"] }, ctx("p_owner"));
    expect(scopePeople(w, "manager", "p_saad").map((p) => p.id)).toContain("p_kamran");
    expect(authorize(w, "p_saad", newTask({ assigneeId: "p_kamran" })).ok).toBe(true);
    // a reminder ignored long enough still climbs to Kamran's own lead
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersSent: 4, remindersIgnored: 4, lastReminderAt: pkt("2026-10-21T09:00:00").toISOString() })];
    w.people.find((p) => p.id === "p_kamran")!.devices = [{ id: "d1", kind: "android", label: "Phone", lastSeen: NOW.toISOString(), healthy: true }];
    const r = runTick(w, ready, NOW, uid);
    const esc = r.world.notifications.filter((n) => n.kind === "escalation").map((n) => n.recipientId);
    expect(esc).toContain("p_usman");
    expect(esc).not.toContain("p_saad");
  });

  it("a head can attach someone only to teams in their own department", () => {
    const w = makeWorld();
    w.teams.push({ id: "t_inside", name: "Inside sales", departmentId: "d_sales", leadId: "p_hina" });
    expect(authorize(w, "p_hina", { type: "setSecondaryTeams", personId: "p_kamran", teamIds: ["t_inside"] }).ok).toBe(true);
    expect(authorize(w, "p_hina", { type: "setSecondaryTeams", personId: "p_kamran", teamIds: ["t_product"] }).ok).toBe(false);
  });
});

describe("time", () => {
  it("records each work session and stops a forgotten timer at the end of the day", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress", startedAt: NOW.toISOString() })];
    w.timers.p_kamran = { taskId: "t1", startedAt: pkt("2026-10-21T16:00:00").toISOString() };
    expect(runTick(w, ready, pkt("2026-10-21T17:59:00"), uid).world.timers.p_kamran).toBeTruthy();
    const r = runTick(w, ready, pkt("2026-10-21T23:00:00"), uid);
    const t = r.world.tasks[0];
    expect(r.world.timers.p_kamran).toBeUndefined();
    expect(t.loggedMinutes).toBe(120); // 16:00 to 18:00, not to 23:00
    expect(t.timeEntries?.[0]).toMatchObject({ minutes: 120, autoStopped: true });
    expect(r.world.notifications.some((n) => n.recipientId === "p_kamran" && n.title === "Your timer was stopped")).toBe(true);
  });

  it("gives overtime started after hours a few hours, not the whole night", () => {
    const w = makeWorld();
    const cut = timerCutoff(w, "p_kamran", pkt("2026-10-21T19:00:00").toISOString());
    expect(cut.toISOString()).toBe(pkt("2026-10-21T22:00:00").toISOString());
  });

  it("counts a stopped timer only up to the last activity when asked", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress", startedAt: NOW.toISOString() })];
    w.timers.p_kamran = { taskId: "t1", startedAt: pkt("2026-10-21T08:00:00").toISOString() };
    const out = applyCommand(w, { type: "stopTimer", at: pkt("2026-10-21T09:00:00").toISOString() }, ctx("p_kamran"));
    expect(out.tasks[0].loggedMinutes).toBe(60);
  });

  it("adds manual entries, flagged, with a reason, never for the future", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress" })];
    const out = applyCommand(w, { type: "addTimeEntry", taskId: "t1", minutes: 90, date: "2026-10-20", note: "Site visit" }, ctx("p_kamran"));
    expect(out.tasks[0].loggedMinutes).toBe(90);
    expect(out.tasks[0].timeEntries?.[0]).toMatchObject({ manual: true, note: "Site visit", minutes: 90 });
    expect(out.activity[0].text).toMatch(/manual entry/);
    expect(tryCommand(w, { type: "addTimeEntry", taskId: "t1", minutes: 30, date: "2026-10-25", note: "x" }, ctx("p_kamran")).result.ok).toBe(false);
    expect(tryCommand(w, { type: "addTimeEntry", taskId: "t1", minutes: 30, date: "2026-10-20", note: " " }, ctx("p_kamran")).result.ok).toBe(false);
    expect(authorize(w, "p_faisal", { type: "addTimeEntry", taskId: "t1", minutes: 30, date: "2026-10-20", note: "x" }).ok).toBe(false);
    expect(authorize(w, "p_usman", { type: "addTimeEntry", taskId: "t1", minutes: 30, date: "2026-10-20", note: "x" }).ok).toBe(true);
  });

  it("breaks pause the timer and don't count as worked", () => {
    let w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", status: "in_progress" })];
    w = applyCommand(w, { type: "checkIn" }, ctx("p_kamran", pkt("2026-10-21T09:00:00")));
    w.timers.p_kamran = { taskId: "t1", startedAt: pkt("2026-10-21T09:00:00").toISOString() };
    expect(tryCommand(w, { type: "endBreak" }, ctx("p_kamran")).result.ok).toBe(false);
    w = applyCommand(w, { type: "startBreak" }, ctx("p_kamran", pkt("2026-10-21T13:00:00")));
    expect(w.timers.p_kamran).toBeUndefined();
    expect(tryCommand(w, { type: "startBreak" }, ctx("p_kamran", pkt("2026-10-21T13:05:00"))).result.ok).toBe(false);
    w = applyCommand(w, { type: "endBreak" }, ctx("p_kamran", pkt("2026-10-21T13:40:00")));
    expect(w.attendance.find((a) => a.personId === "p_kamran")?.breakMin).toBe(40);
  });

  it("flags work in progress that has gone quiet, once", () => {
    const w = makeWorld();
    const old = pkt("2026-10-17T10:00:00").toISOString();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", reviewerId: "p_usman", status: "in_progress", startedAt: old, statusChangedAt: old })];
    const r = runTick(w, ready, NOW, uid);
    expect(r.world.tasks[0].idleFlaggedAt).toBeTruthy();
    expect(r.world.notifications.some((n) => n.recipientId === "p_usman" && n.kind === "escalation")).toBe(true);
    expect(runTick(r.world, r.state, NOW, uid).world.notifications.length).toBe(r.world.notifications.length);
    // any human action clears it
    const after = applyCommand(r.world, { type: "addComment", taskId: "t1", body: "Still on it" }, ctx("p_kamran"));
    expect(after.tasks[0].idleFlaggedAt).toBeUndefined();
    // recent activity in the log keeps it from being flagged at all
    expect(runTick(w, ready, NOW, uid, { lastTouch: { t1: pkt("2026-10-20T16:00:00").toISOString() } }).world.tasks[0].idleFlaggedAt).toBeUndefined();
  });
});

describe("comments", () => {
  it("thread replies one level deep and tell the person replied to", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", comments: [{ id: "c1", authorId: "p_usman", body: "Status?", at: NOW.toISOString(), kind: "text" }] })];
    let out = applyCommand(w, { type: "addComment", taskId: "t1", body: "Almost done", parentId: "c1" }, ctx("p_kamran"));
    const reply = out.tasks[0].comments[1];
    expect(reply.parentId).toBe("c1");
    expect(out.notifications.some((n) => n.recipientId === "p_usman" && n.title.includes("replied"))).toBe(true);
    out = applyCommand(out, { type: "addComment", taskId: "t1", body: "Thanks", parentId: reply.id }, ctx("p_usman"));
    expect(out.tasks[0].comments[2].parentId).toBe("c1");
  });

  it("can be edited only by their author, keeping every earlier version", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", comments: [{ id: "c1", authorId: "p_kamran", body: "Done by 3", at: NOW.toISOString(), kind: "text" }] })];
    expect(tryCommand(w, { type: "editComment", taskId: "t1", commentId: "c1", body: "Done by 5" }, ctx("p_usman")).result.ok).toBe(false);
    const out = applyCommand(w, { type: "editComment", taskId: "t1", commentId: "c1", body: "Done by 5" }, ctx("p_kamran"));
    const c = out.tasks[0].comments[0];
    expect(c.body).toBe("Done by 5");
    expect(c.history).toEqual([{ body: "Done by 3", at: NOW.toISOString() }]);
    expect(c.editedAt).toBeTruthy();
  });
});

describe("a few bugs that were fixed", () => {
  it("the person who marked someone on leave hears about their open work", () => {
    const w = makeWorld();
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    const out = applyCommand(w, { type: "setOnLeave", personId: "p_kamran", onLeave: true }, ctx("p_usman"));
    expect(out.notifications.some((n) => n.recipientId === "p_usman" && n.title.includes("open"))).toBe(true);
  });

  it("a named backup can be set and is where new work goes", () => {
    let w = applyCommand(makeWorld(), { type: "setBackup", personId: "p_kamran", backupId: "p_faisal" }, ctx("p_usman"));
    w.people.find((p) => p.id === "p_kamran")!.onLeave = true;
    w = applyCommand(w, newTask({ assigneeId: "p_kamran" }), ctx("p_usman"));
    expect(w.tasks.find((t) => t.id === "t_new")!.assigneeId).toBe("p_faisal");
    expect(authorize(makeWorld(), "p_kamran", { type: "setBackup", personId: "p_kamran", backupId: "p_faisal" }).ok).toBe(false);
  });
});
