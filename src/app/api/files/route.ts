import { getViewer, json } from "@/server/session";
import { authorize } from "@/domain/permissions";
import { db } from "@/server/db";
import { checkFile, removeFile, storeFile } from "@/server/files";
import { loadWorld } from "@/server/repo";
import { runCommand } from "@/server/run-command";

/** Upload a photo or file and attach it to a task (multipart: file, taskId, proof). */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Sign in again." }, 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const taskId = String(form?.get("taskId") ?? "");
  if (!(file instanceof File) || !taskId) return json({ ok: false, error: "Pick a file to upload." }, 400);
  const problem = checkFile(file);
  if (problem) return json({ ok: false, error: problem }, 400);

  // check first, so a refused upload is never stored
  const voice = form?.get("as") === "voice";
  const world = await loadWorld(db, viewer.orgId);
  const check = authorize(world, viewer.personId, voice ? { type: "addComment", taskId, body: "-" } : { type: "addAttachment", taskId, name: file.name, kind: "file" });
  if (!check.ok) return json({ ok: false, error: check.error }, 403);

  const stored = await storeFile({ orgId: viewer.orgId, taskId, byId: viewer.personId, file });
  if (voice) {
    const durationSec = Math.min(600, Math.max(1, Math.round(Number(form.get("durationSec")) || 1)));
    const r = await runCommand(viewer, { type: "addComment", taskId, body: stored.url, kind: "voice", durationSec });
    if (!r.ok) await removeFile(stored.id);
    return r.ok ? json({ ok: true, file: stored }) : json({ ok: false, error: r.error }, r.status);
  }
  const r = await runCommand(viewer, {
    type: "addAttachment",
    taskId,
    name: stored.name,
    kind: file.type.startsWith("image/") ? "image" : "file",
    fileId: stored.id,
    url: stored.url,
    sizeKb: stored.sizeKb,
    contentType: stored.contentType,
    proof: form?.get("proof") === "1" ? true : undefined,
  });
  if (!r.ok) {
    await removeFile(stored.id);
    return json({ ok: false, error: r.error }, r.status);
  }
  return json({ ok: true, file: stored });
}
