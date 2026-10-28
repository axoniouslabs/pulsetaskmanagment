import { getActor, json } from "@/server/session";
import { authorize } from "@/domain/permissions";
import { db } from "@/server/db";
import { checkFile, removeFile, storeFile } from "@/server/files";
import { loadWorld } from "@/server/repo";
import { runCommand } from "@/server/run-command";

/** Upload a photo or file and attach it to a task (multipart: file, taskId, proof). */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const taskId = String(form?.get("taskId") ?? "");
  const channelId = String(form?.get("channelId") ?? "");
  if (file instanceof File && channelId) return shareWithChannel(viewer, channelId, String(form?.get("title") ?? "") || file.name, file);
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
    capturedAt: captured(form?.get("capturedAt")),
    location: located(form?.get("location")),
  });
  if (!r.ok) {
    await removeFile(stored.id);
    return json({ ok: false, error: r.error }, r.status);
  }
  return json({ ok: true, file: stored });
}

/** the time a photo was taken, if it's believable (not in the future, not years old) */
function captured(v: FormDataEntryValue | null | undefined) {
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 60000 || Date.now() - d.getTime() > 366 * 24 * 3600000) return undefined;
  return d.toISOString();
}

function located(v: FormDataEntryValue | null | undefined) {
  if (typeof v !== "string") return undefined;
  try {
    const p = JSON.parse(v) as { lat?: unknown; lng?: unknown; accuracyM?: unknown };
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
    const acc = Number(p.accuracyM);
    return { lat, lng, ...(Number.isFinite(acc) && acc >= 0 ? { accuracyM: Math.min(100000, acc) } : {}) };
  } catch {
    return undefined;
  }
}

/** a file shared with a unit: pinned in its channel for everyone in it */
async function shareWithChannel(viewer: Parameters<typeof runCommand>[0], channelId: string, title: string, file: File) {
  const problem = checkFile(file);
  if (problem) return json({ ok: false, error: problem }, 400);
  const world = await loadWorld(db, viewer.orgId);
  const pin = { type: "addPin" as const, channelId, title: title.slice(0, 120), fileId: "pending", fileName: file.name };
  const check = authorize(world, viewer.personId, pin);
  if (!check.ok) return json({ ok: false, error: check.error }, 403);
  const stored = await storeFile({ orgId: viewer.orgId, channelId, byId: viewer.personId, file });
  const r = await runCommand(viewer, { ...pin, fileId: stored.id, fileName: stored.name, url: stored.url });
  if (!r.ok) {
    await removeFile(stored.id);
    return json({ ok: false, error: r.error }, r.status);
  }
  return json({ ok: true, file: stored });
}
