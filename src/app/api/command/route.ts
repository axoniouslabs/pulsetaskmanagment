import { eq } from "drizzle-orm";
import type { Command } from "@/domain/commands";
import { db, schema as S } from "@/server/db";
import { getActor, json } from "@/server/session";
import { validateCommand } from "@/server/validate";
import { runCommand } from "@/server/run-command";

/** Every button in Pulse ends up here. */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;

  let cmd: Command;
  try {
    cmd = validateCommand(await req.json());
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "That request didn't make sense." }, 400);
  }
  // files and voice notes are attached by the upload route, which stores the bytes first
  if (cmd.type === "addAttachment" || (cmd.type === "addComment" && cmd.kind === "voice")) {
    return json({ ok: false, error: "Upload the file first." }, 400);
  }
  const r = await runCommand(viewer, cmd);
  if (r.ok) return json({ ok: true });
  // done offline, and the task has moved on since: the change is kept as a comment, never just dropped (spec §19)
  const offlineAt = req.headers.get("x-pulse-offline-at");
  const taskId = "taskId" in cmd ? cmd.taskId : undefined;
  if (offlineAt && taskId && r.status === 422 && cmd.type !== "addComment") {
    const when = new Date(offlineAt);
    const [org] = await db.select({ tz: S.organizations.timezone }).from(S.organizations).where(eq(S.organizations.id, viewer.orgId));
    const at = Number.isNaN(when.getTime())
      ? "while offline"
      : `offline at ${new Intl.DateTimeFormat("en-GB", { timeZone: org?.tz ?? "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(when)}`;
    const note = `${OFFLINE_LABEL[cmd.type] ?? "Made a change"} ${at}, but it couldn't be applied: ${r.error}`;
    const c = await runCommand(viewer, { type: "addComment", taskId, body: note });
    if (c.ok) return json({ ok: false, preserved: true, error: r.error }, 200);
  }
  return json({ ok: false, error: r.error }, r.status);
}

const OFFLINE_LABEL: Partial<Record<Command["type"], string>> = {
  acknowledge: "Acknowledged",
  start: "Started work",
  stopTimer: "Stopped the timer",
  snooze: "Snoozed",
  block: "Marked blocked",
  toggleSubtask: "Ticked a checklist item",
  setProgress: "Updated progress",
};
