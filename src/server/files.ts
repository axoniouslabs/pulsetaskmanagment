import "server-only";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db, schema as S } from "./db";
import { newId } from "./ids";

// Vercel functions accept request bodies up to 4.5 MB; photos are shrunk in the browser first
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|text\/csv|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|zip)|audio\/(webm|ogg|mpeg|mp4))$/;

export function checkFile(file: File): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES) return "Files can be up to 4 MB. Photos are made smaller automatically; for big documents, share a link in a comment.";
  if (!ALLOWED.test(file.type)) return "Pulse accepts photos, PDFs, Office documents, text, CSV and voice notes.";
  return null;
}

/**
 * Store an upload. With BLOB_READ_WRITE_TOKEN set (a Vercel Blob store), the bytes
 * go to Blob; otherwise they're kept in Postgres. Either way the file is served
 * through /api/files/<id>, which checks the viewer belongs to the organisation.
 */
export async function storeFile(input: { orgId: string; taskId?: string; byId: string; file: File }) {
  const id = newId("f");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const name = input.file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  let blobUrl: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const res = await put(`${input.orgId}/${id}/${name}`, bytes, { access: "public", contentType: input.file.type, addRandomSuffix: true });
    blobUrl = res.url;
  }
  await db.insert(S.files).values({
    id,
    orgId: input.orgId,
    taskId: input.taskId ?? null,
    byId: input.byId,
    name,
    contentType: input.file.type,
    size: bytes.length,
    data: blobUrl ? null : bytes,
    blobUrl,
  });
  return { id, name, url: `/api/files/${id}`, sizeKb: Math.max(1, Math.round(bytes.length / 1024)), contentType: input.file.type };
}

/** undo a stored upload that never made it onto a task */
export async function removeFile(id: string) {
  try {
    const [row] = await db.delete(S.files).where(eq(S.files.id, id)).returning({ blobUrl: S.files.blobUrl });
    if (row?.blobUrl && process.env.BLOB_READ_WRITE_TOKEN) await del(row.blobUrl);
  } catch (e) {
    console.error("remove file", e);
  }
}
