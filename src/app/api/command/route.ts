import type { Command } from "@/domain/commands";
import { getViewer, json } from "@/server/session";
import { validateCommand } from "@/server/validate";
import { runCommand } from "@/server/run-command";

/** Every button in Pulse ends up here. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Your session ended. Sign in again." }, 401);

  let cmd: Command;
  try {
    cmd = validateCommand(await req.json());
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "That request didn't make sense." }, 400);
  }
  const r = await runCommand(viewer, cmd);
  return r.ok ? json({ ok: true }) : json({ ok: false, error: r.error }, r.status);
}
