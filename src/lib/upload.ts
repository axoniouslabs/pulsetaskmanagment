"use client";

import { useApp } from "./store";

const MAX_SIDE = 1600;

/** shrink a photo to at most 1600 px on its long side, as JPEG */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000 && file.type === "image/jpeg") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // e.g. HEIC on a browser that can't decode it: send as is
  }
}

/** upload a file to a task; refreshes the screen when done */
export async function uploadToTask(taskId: string, original: File, opts: { proof?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = await shrink(original);
  const form = new FormData();
  form.set("file", file);
  form.set("taskId", taskId);
  if (opts.proof) form.set("proof", "1");
  try {
    const res = await fetch("/api/files", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: res.status === 413 ? "That file is too big. Files can be up to 4 MB." : body.error ?? "The upload didn't finish." };
    await useApp.getState().load();
    return { ok: true };
  } catch {
    return { ok: false, error: "You're offline. The file wasn't uploaded." };
  }
}

export const ACCEPT = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip";

/** send a recorded voice note as a comment */
export async function uploadVoiceNote(taskId: string, blob: Blob, durationSec: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const type = blob.type.split(";")[0] || "audio/webm";
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.set("file", new File([blob], `voice-note.${ext}`, { type }));
  form.set("taskId", taskId);
  form.set("as", "voice");
  form.set("durationSec", String(durationSec));
  try {
    const res = await fetch("/api/files", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? "The voice note didn't send." };
    await useApp.getState().load();
    return { ok: true };
  } catch {
    return { ok: false, error: "You're offline. The voice note wasn't sent." };
  }
}

/** record from the microphone; stop() resolves with the audio */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const done = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          done();
          resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = done;
      rec.stop();
    },
  };
}
