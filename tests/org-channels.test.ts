import { describe, expect, it } from "vitest";
import { applyCommand, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { runTick } from "@/domain/engine";
import { channelMembersOf, type World } from "@/domain/world";
import { makeWorld, pkt, uid } from "./fixtures";

const NOW = pkt("2026-10-21T10:00:00");
/** what the server does: check, then apply */
function run(w: World, actorId: string, cmd: Command) {
  const ok = authorize(w, actorId, cmd);
  if (!ok.ok) throw new Error(ok.error);
  return applyCommand(w, cmd, { actorId, now: NOW, uid });
}
const denied = (w: World, actorId: string, cmd: Command) => !authorize(w, actorId, cmd).ok;

describe("units come with their channels", () => {
  it("a new team gets a channel and a task feed; a group gets one channel", () => {
    let w = run(makeWorld(), "p_hina", { type: "addTeam", name: "Inside", departmentId: "d_sales", leadId: "p_kamran" });
    const team = w.teams.find((t) => t.name === "Inside")!;
    expect(
      w.channels
        .filter((c) => c.unitId === team.id)
        .map((c) => c.kind)
        .sort(),
    ).toEqual(["open", "task_feed"]);
    w = run(w, "p_saad", { type: "addGroup", name: "Expo", description: "", memberIds: ["p_ali", "p_kamran"] });
    expect(w.channels.filter((c) => c.unitType === "group")).toHaveLength(1);
  });

  it("archiving a group archives its channel; history stays", () => {
    let w = run(makeWorld(), "p_saad", { type: "addGroup", name: "Expo", description: "", memberIds: ["p_ali"] });
    const g = w.groups[0];
    expect(denied(w, "p_hina", { type: "archiveGroup", groupId: g.id, archived: true })).toBe(true);
    w = run(w, "p_saad", { type: "archiveGroup", groupId: g.id, archived: true });
    expect(w.groups[0].archivedAt).toBeTruthy();
    expect(w.channels.find((c) => c.unitId === g.id)!.archivedAt).toBeTruthy();
    const ch = w.channels.find((c) => c.unitId === g.id)!;
    expect(() => run(w, "p_saad", { type: "postAnnouncement", channelId: ch.id, title: "Hi", body: "x", requiresAck: false })).toThrow(/archived/);
  });
});

describe("private channels", () => {
  it("only invited people are members, can post or see it", () => {
    let w = run(makeWorld(), "p_hina", { type: "addChannel", name: "Heads", kind: "private", unitType: "org", unitId: "org", description: "", memberIds: ["p_saad"] });
    const ch = w.channels.find((c) => c.kind === "private")!;
    expect(channelMembersOf(w, ch).sort()).toEqual(["p_hina", "p_saad"]);
    expect(denied(w, "p_owner", { type: "postAnnouncement", channelId: ch.id, title: "x", body: "y", requiresAck: false })).toBe(true);
    expect(denied(w, "p_kamran", { type: "replyNotice", id: "none", body: "x" })).toBe(true);
    w = run(w, "p_saad", { type: "postAnnouncement", channelId: ch.id, title: "Budget", body: "Draft attached", requiresAck: false });
    expect(w.notifications.filter((n) => n.recipientId === "p_hina")).toHaveLength(1);
    expect(denied(w, "p_kamran", { type: "addChannel", name: "x", kind: "private", unitType: "org", unitId: "org", description: "", memberIds: ["p_ali"] })).toBe(true);
  });
});

describe("posts, replies, mentions and mutes", () => {
  const withTeamChannel = () => {
    const w = makeWorld();
    w.channels.push({ id: "c_field", name: "Field", kind: "open", unitType: "team", unitId: "t_field", description: "" });
    return w;
  };

  it("a muted member isn't told about ordinary posts, but is told when mentioned or asked to acknowledge", () => {
    let w = withTeamChannel();
    w.prefs.p_kamran = { "mute:c_field": true };
    w = run(w, "p_usman", { type: "postAnnouncement", channelId: "c_field", title: "Route change", body: "New route from Monday", requiresAck: false });
    expect(w.notifications.some((n) => n.recipientId === "p_kamran")).toBe(false);
    expect(w.notifications.some((n) => n.recipientId === "p_faisal")).toBe(true);
    w = run(w, "p_usman", { type: "postAnnouncement", channelId: "c_field", title: "Stock", body: "@Kamran please count rack B", requiresAck: false });
    expect(w.notifications.some((n) => n.recipientId === "p_kamran" && n.kind === "mention")).toBe(true);
    w = run(w, "p_usman", { type: "postAnnouncement", channelId: "c_field", title: "Policy", body: "Read this", requiresAck: true });
    expect(w.notifications.filter((n) => n.recipientId === "p_kamran" && n.kind === "announcement")).toHaveLength(1);
  });

  it("any member of an open channel posts; replies reach whoever posted", () => {
    let w = withTeamChannel();
    w = run(w, "p_kamran", { type: "postAnnouncement", channelId: "c_field", title: "Van 2 is in the workshop", body: "Use van 3 today", requiresAck: false });
    const post = w.announcements[0];
    w = run(w, "p_faisal", { type: "replyNotice", id: post.id, body: "OK, taking van 3" });
    expect(w.announcements[0].replies).toHaveLength(1);
    expect(w.notifications.some((n) => n.recipientId === "p_kamran" && n.title.includes("replied"))).toBe(true);
    expect(denied(w, "p_ali", { type: "replyNotice", id: post.id, body: "hi" })).toBe(true);
  });

  it("@everyone reaches the whole channel; '@ali' doesn't match 'alison'", () => {
    let w = withTeamChannel();
    w = run(w, "p_usman", { type: "postAnnouncement", channelId: "c_field", title: "All hands", body: "@everyone meet at 4", requiresAck: false });
    expect(
      w.notifications
        .filter((n) => n.kind === "mention")
        .map((n) => n.recipientId)
        .sort(),
    ).toEqual(["p_faisal", "p_hina", "p_kamran"].filter((id) => channelMembersOf(w, w.channels[1]).includes(id)).sort());
    w = run(w, "p_usman", { type: "postAnnouncement", channelId: "c_field", title: "Note", body: "@alison not a person", requiresAck: false });
    expect(w.notifications.some((n) => n.recipientId === "p_ali")).toBe(false);
  });

  it("pins: members pin links, only the pinner or whoever runs the unit removes them", () => {
    let w = withTeamChannel();
    w = run(w, "p_kamran", { type: "addPin", channelId: "c_field", title: "Price list", url: "https://drive.google.com/x" });
    const pin = w.channels.find((c) => c.id === "c_field")!.pins![0];
    expect(denied(w, "p_faisal", { type: "removePin", channelId: "c_field", pinId: pin.id })).toBe(true);
    w = run(w, "p_usman", { type: "removePin", channelId: "c_field", pinId: pin.id });
    expect(w.channels.find((c) => c.id === "c_field")!.pins).toHaveLength(0);
    expect(() => run(w, "p_kamran", { type: "addPin", channelId: "c_field", title: "Bad", url: "javascript:alert(1)" })).toThrow();
  });
});

describe("membership, availability and privacy", () => {
  it("a team lead adds people from their own department, not from another", () => {
    const w = makeWorld();
    w.teams.push({ id: "t_inside", name: "Inside", departmentId: "d_sales", leadId: "p_usman" });
    const next = run(w, "p_usman", { type: "setTeamMember", teamId: "t_inside", personId: "p_faisal", member: true });
    expect(next.people.find((p) => p.id === "p_faisal")!.secondaryTeamIds).toEqual(["t_inside"]);
    expect(denied(w, "p_usman", { type: "setTeamMember", teamId: "t_inside", personId: "p_ali", member: true })).toBe(true);
    expect(denied(w, "p_kamran", { type: "setTeamMember", teamId: "t_inside", personId: "p_faisal", member: true })).toBe(true);
  });

  it("availability notes clear themselves when their time is up", () => {
    let w = run(makeWorld(), "p_kamran", { type: "setAvailability", personId: "p_kamran", note: "At the Multan depot", until: pkt("2026-10-21T12:00:00").toISOString() });
    expect(w.people.find((p) => p.id === "p_kamran")!.availability?.note).toBe("At the Multan depot");
    expect(denied(w, "p_faisal", { type: "setAvailability", personId: "p_kamran", note: "x" })).toBe(true);
    w = runTick(w, { day: "2026-10-21", morningSent: "2026-10-21", eveningSent: "2026-10-21" }, pkt("2026-10-21T12:05:00"), uid).world;
    expect(w.people.find((p) => p.id === "p_kamran")!.availability).toBeUndefined();
  });

  it("contact details are wiped only for people who have left, and only by the owner", () => {
    const w = makeWorld();
    w.people.find((p) => p.id === "p_faisal")!.phone = "+92 300 0000000";
    expect(() => run(w, "p_owner", { type: "purgeContact", personId: "p_faisal" })).toThrow(/Deactivate them first/);
    w.people.find((p) => p.id === "p_faisal")!.active = false;
    expect(denied(w, "p_hina", { type: "purgeContact", personId: "p_faisal" })).toBe(true);
    const next = run(w, "p_owner", { type: "purgeContact", personId: "p_faisal" });
    expect(next.people.find((p) => p.id === "p_faisal")!.phone).toBe("");
  });

  it("a manager sets where their people's notifications go, but never switches off escalations", () => {
    const w = makeWorld();
    expect(run(w, "p_usman", { type: "setPrefFor", personId: "p_kamran", key: "push:digest", value: false }).prefs.p_kamran["push:digest"]).toBe(false);
    expect(denied(w, "p_usman", { type: "setPrefFor", personId: "p_kamran", key: "push:escalation", value: false })).toBe(true);
    expect(denied(w, "p_usman", { type: "setPrefFor", personId: "p_ali", key: "push:digest", value: false })).toBe(true);
    expect(denied(w, "p_usman", { type: "setPrefFor", personId: "p_kamran", key: "pin:t1", value: true })).toBe(true);
  });
});
