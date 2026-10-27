import { describe, expect, it } from "vitest";
import { runTick } from "@/domain/engine";
import { makeWorld, pkt, task, uid } from "./fixtures";

// Wed 21 Oct 2026, 10:00 PKT: a working day, inside working hours
const MORNING = pkt("2026-10-21T10:00:00");
const ready = {
  day: "2026-10-21",
  morningSent: "2026-10-21",
  eveningSent: "2026-10-21",
};

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
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        remindersSent: 1,
        lastReminderAt: pkt("2026-10-21T09:45:00").toISOString(),
      }),
    ];
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
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        reminder: {
          intervalMin: 30,
          window: "always",
          dailyCap: 12,
          channels: ["push"],
          quietAfterAckMin: 60,
        },
      }),
    ];
    expect(reminders(runTick(w, ready, pkt("2026-10-21T22:00:00"), uid).world, "p_kamran")).toHaveLength(1);
  });

  it("pauses for snooze, leave and the daily cap", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        snoozedUntil: pkt("2026-10-21T10:30:00").toISOString(),
      }),
    ];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);

    w.tasks = [task({ id: "t1", assigneeId: "p_kamran" })];
    w.leaves = [
      {
        id: "l1",
        personId: "p_kamran",
        from: "2026-10-21",
        to: "2026-10-21",
        type: "sick",
        status: "approved",
      },
    ];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);

    w.leaves = [];
    w.tasks = [task({ id: "t1", assigneeId: "p_kamran", remindersToday: 12 })];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
  });

  it("doesn't start reminding before the task's start time", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        startAt: pkt("2026-10-22T09:00:00").toISOString(),
      }),
    ];
    expect(reminders(runTick(w, ready, MORNING, uid).world, "p_kamran")).toHaveLength(0);
  });
});

describe("escalation ladder", () => {
  it("climbs with ignored reminders and tells the right people", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        remindersSent: 5,
        remindersIgnored: 4,
        lastReminderAt: pkt("2026-10-21T09:00:00").toISOString(),
        escalationLevel: 1,
      }),
    ];
    const r = runTick(w, ready, MORNING, uid);
    const t = r.world.tasks[0];
    expect(t.remindersIgnored).toBe(5);
    expect(t.escalationLevel).toBe(2);
    const esc = r.world.notifications.filter((n) => n.kind === "escalation").map((n) => n.recipientId);
    expect(esc).toEqual(["p_usman"]); // L2: the team lead
  });

  it("level 3 reaches the department head", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        remindersSent: 8,
        remindersIgnored: 7,
        lastReminderAt: pkt("2026-10-21T09:00:00").toISOString(),
        escalationLevel: 2,
      }),
    ];
    const r = runTick(w, ready, MORNING, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(3);
    expect(
      r.world.notifications
        .filter((n) => n.kind === "escalation")
        .map((n) => n.recipientId)
        .sort(),
    ).toEqual(["p_hina", "p_usman"]);
  });

  it("silence a day past the deadline goes to the owner (level 4)", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        dueAt: pkt("2026-10-20T09:00:00").toISOString(),
        escalationLevel: 3,
      }),
    ];
    const r = runTick(w, ready, MORNING, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(4);
    expect(r.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_owner")).toBe(true);
  });

  it("a reminder that can't reach any device isn't counted as ignored", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_kamran")!.devices = [
      {
        id: "d1",
        kind: "android",
        label: "Phone",
        lastSeen: "2026-10-01T00:00:00Z",
        healthy: false,
      },
    ];
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        remindersSent: 2,
        remindersIgnored: 1,
        lastReminderAt: pkt("2026-10-21T09:00:00").toISOString(),
      }),
    ];
    const t = runTick(w, ready, MORNING, uid).world.tasks[0];
    expect(t.remindersSent).toBe(3);
    expect(t.remindersIgnored).toBe(1);
  });

  it("an overdue task that was acknowledged tells the reviewer, the head and the owner, once", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        status: "in_progress",
        acknowledgedAt: pkt("2026-10-20T09:00:00").toISOString(),
        dueAt: pkt("2026-10-21T09:30:00").toISOString(),
      }),
    ];
    const r1 = runTick(w, ready, MORNING, uid);
    expect(r1.world.tasks[0].escalationLevel).toBe(3);
    const who = r1.world.notifications
      .filter((n) => n.kind === "escalation")
      .map((n) => n.recipientId)
      .sort();
    expect(who).toEqual(["p_hina", "p_owner", "p_usman"]);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-21T10:05:00"), uid);
    expect(r2.world.notifications.filter((n) => n.kind === "escalation")).toHaveLength(3);
  });

  it("nudges a slow reviewer, then their manager", () => {
    const w = makeWorld();
    w.settings.reviewSlaHours = 24;
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_ali",
        reviewerId: "p_saad",
        status: "submitted",
        submittedAt: pkt("2026-10-20T09:00:00").toISOString(),
      }),
    ];
    const r1 = runTick(w, ready, MORNING, uid);
    expect(r1.world.notifications.filter((n) => n.recipientId === "p_saad")).toHaveLength(1);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-22T10:00:00"), uid);
    expect(r2.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_owner")).toBe(true);
  });
});

describe("daily work", () => {
  it("resets daily counters on a new day", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        status: "acknowledged",
        snoozesToday: 3,
        remindersToday: 9,
      }),
    ];
    const r = runTick(w, { day: "2026-10-20" }, MORNING, uid);
    expect(r.world.tasks[0].snoozesToday).toBe(0);
    expect(r.world.tasks[0].remindersToday).toBe(0);
    expect(r.rollupDates).toContain("2026-10-20");
  });

  it("makes the next copy of a repeating task once, when it's done", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        status: "approved",
        recurrence: "weekly",
        dueAt: pkt("2026-10-21T17:00:00").toISOString(),
      }),
    ];
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
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        dueAt: pkt("2026-10-21T17:00:00").toISOString(),
      }),
    ];
    const r1 = runTick(w, { day: "2026-10-21" }, pkt("2026-10-21T09:00:30"), uid);
    expect(r1.digestIds.length).toBeGreaterThan(0);
    const brief = r1.world.notifications.find((n) => n.kind === "digest" && n.recipientId === "p_kamran");
    expect(brief?.title).toContain("1 task today");
    expect(brief?.body).toContain("1. Test task");
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-21T09:05:00"), uid);
    expect(r2.digestIds).toHaveLength(0);
  });

  it("puts people on leave on their leave day and back afterwards", () => {
    const w = makeWorld();
    w.leaves = [
      {
        id: "l1",
        personId: "p_ali",
        from: "2026-10-21",
        to: "2026-10-21",
        type: "annual",
        status: "approved",
      },
    ];
    const r1 = runTick(w, { day: "2026-10-20" }, MORNING, uid);
    expect(r1.world.people.find((p) => p.id === "p_ali")!.onLeave).toBe(true);
    const r2 = runTick(r1.world, r1.state, pkt("2026-10-22T09:30:00"), uid);
    expect(r2.world.people.find((p) => p.id === "p_ali")!.onLeave).toBe(false);
  });
});

describe("digest timing", () => {
  it("skips a digest that's hours late instead of sending it", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        dueAt: pkt("2026-10-21T17:00:00").toISOString(),
      }),
    ];
    const r = runTick(w, { day: "2026-10-21" }, pkt("2026-10-21T15:00:00"), uid);
    expect(r.world.notifications.filter((n) => n.kind === "digest")).toHaveLength(0);
    expect(r.state.morningSent).toBe("2026-10-21");
  });
});

describe("seen but not started", () => {
  it("nudges gently at twice the interval after the quiet period, without counting it as ignored", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        status: "acknowledged",
        acknowledgedAt: pkt("2026-10-21T08:30:00").toISOString(),
        remindersSent: 2,
      }),
    ];
    // 30 minutes after acknowledging: still inside the quiet period
    expect(reminders(runTick(w, ready, pkt("2026-10-21T09:00:00"), uid).world, "p_kamran")).toHaveLength(0);
    const r = runTick(w, ready, pkt("2026-10-21T09:35:00"), uid);
    const got = reminders(r.world, "p_kamran");
    expect(got).toHaveLength(1);
    expect(got[0].title).toContain("Not started yet");
    expect(r.world.tasks[0].remindersIgnored).toBe(0);
    // and not again until another hour (2 × 30 min) has passed
    expect(reminders(runTick(r.world, r.state, pkt("2026-10-21T10:00:00"), uid).world, "p_kamran")).toHaveLength(1);
    expect(reminders(runTick(r.world, r.state, pkt("2026-10-21T10:40:00"), uid).world, "p_kamran")).toHaveLength(2);
  });

  it("marks a task that's due within two hours and not started", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        dueAt: pkt("2026-10-21T11:30:00").toISOString(),
        lastReminderAt: pkt("2026-10-21T09:55:00").toISOString(),
      }),
    ];
    const r = runTick(w, ready, MORNING, uid);
    expect(r.world.tasks[0].escalationLevel).toBe(2);
    expect(r.world.notifications.some((n) => n.kind === "escalation" && n.recipientId === "p_usman")).toBe(true);
  });

  it("marks a task once a quarter of its time has passed with no response", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        createdAt: pkt("2026-10-20T09:00:00").toISOString(),
        dueAt: pkt("2026-10-23T09:00:00").toISOString(),
        lastReminderAt: pkt("2026-10-21T09:55:00").toISOString(),
      }),
    ];
    expect(runTick(w, ready, MORNING, uid).world.tasks[0].escalationLevel).toBe(1);
  });
});

describe("offered to a team", () => {
  it("reminds every member until someone claims it", () => {
    const w = makeWorld();
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_usman",
        groupClaim: {
          unitName: "Field",
          claimed: false,
          unitType: "team",
          unitId: "t_field",
        },
      }),
    ];
    const r = runTick(w, ready, MORNING, uid);
    const who = r.world.notifications
      .filter((n) => n.kind === "reminder")
      .map((n) => n.recipientId)
      .sort();
    expect(who).toEqual(["p_faisal", "p_hina", "p_kamran", "p_usman"]);
    expect(r.world.notifications[0].title).toContain("Still unclaimed");
    expect(r.world.tasks[0].remindersIgnored).toBe(0);
  });
});

describe("repeating tasks", () => {
  it("'daily' skips days off, and stops piling up after three open copies", () => {
    const w = makeWorld();
    // approved Saturday evening: the next working day is Monday
    w.tasks = [
      task({
        id: "t1",
        assigneeId: "p_kamran",
        status: "approved",
        recurrence: "daily",
        dueAt: pkt("2026-10-24T17:00:00").toISOString(),
        approvedAt: pkt("2026-10-24T16:00:00").toISOString(),
      }),
    ];
    const r = runTick(
      w,
      {
        day: "2026-10-24",
        morningSent: "2026-10-24",
        eveningSent: "2026-10-24",
      },
      pkt("2026-10-24T18:30:00"),
      uid,
    );
    const copy = r.world.tasks.find((t) => t.id !== "t1")!;
    expect(copy).toBeTruthy();
    expect(new Date(copy.dueAt).toISOString()).toBe(pkt("2026-10-26T17:00:00").toISOString());

    // three open copies already: no fourth
    const chain = makeWorld();
    chain.tasks = [
      task({
        id: "a",
        assigneeId: "p_kamran",
        recurrence: "daily",
        recurrenceNextId: "b",
        dueAt: pkt("2026-10-19T17:00:00").toISOString(),
      }),
      task({
        id: "b",
        assigneeId: "p_kamran",
        recurrence: "daily",
        recurrenceNextId: "c",
        dueAt: pkt("2026-10-20T17:00:00").toISOString(),
      }),
      task({
        id: "c",
        assigneeId: "p_kamran",
        recurrence: "daily",
        dueAt: pkt("2026-10-21T08:00:00").toISOString(),
      }),
    ];
    const r2 = runTick(chain, ready, MORNING, uid);
    expect(r2.world.tasks).toHaveLength(3);
  });
});

describe("notices that need an OK", () => {
  it("are chased every four working hours until everyone acknowledges, and the author hears when it's late", () => {
    const w = makeWorld();
    w.announcements = [
      {
        id: "an1",
        channelId: "c_all",
        authorId: "p_owner",
        at: pkt("2026-10-21T09:00:00").toISOString(),
        title: "New leave policy",
        body: "",
        requiresAck: true,
        ackDueAt: pkt("2026-10-21T12:00:00").toISOString(),
        ackBy: { p_hina: "x" },
        readBy: {},
      },
    ];
    // too soon
    expect(runTick(w, ready, pkt("2026-10-21T11:00:00"), uid).world.notifications.filter((n) => n.kind === "announcement")).toHaveLength(0);
    const r = runTick(w, ready, pkt("2026-10-21T13:05:00"), uid);
    const got = r.world.notifications.filter((n) => n.kind === "announcement");
    // five people still owe an OK (not Hina, not the author), plus the author is told it's late
    expect(got.filter((n) => n.recipientId !== "p_owner")).toHaveLength(5);
    expect(got.some((n) => n.recipientId === "p_owner" && n.title.includes("haven't acknowledged"))).toBe(true);
    // not again straight away
    expect(runTick(r.world, r.state, pkt("2026-10-21T13:30:00"), uid).world.notifications.filter((n) => n.kind === "announcement")).toHaveLength(got.length);
  });
});
