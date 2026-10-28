/**
 * Offline support (spec §19): the last snapshot is kept on the device so the
 * task list opens without a connection, and a few actions made offline are
 * kept in an outbox and sent, in order, when the connection is back.
 */
import type { Command } from "@/domain/commands";

const CACHE = "pulse-data";
const SNAPSHOT = "/__pulse/snapshot";
const OUTBOX = "pulse:outbox";

/** what can safely wait: the everyday actions an employee takes in the field */
export const QUEUEABLE = new Set<Command["type"]>(["acknowledge", "start", "stopTimer", "snooze", "block", "addComment", "toggleSubtask", "checkIn", "checkOut", "setProgress"]);

export interface Queued {
  cmd: Command;
  /** when it was done on the device */
  at: string;
  personId: string;
}

export async function saveSnapshot(personId: string, data: unknown) {
  try {
    const c = await caches.open(CACHE);
    await c.put(SNAPSHOT, new Response(JSON.stringify({ personId, savedAt: new Date().toISOString(), data }), { headers: { "content-type": "application/json" } }));
  } catch {
    /* private mode or storage full: offline just won't have a copy */
  }
}

export async function readSnapshot<T>(): Promise<{ personId: string; savedAt: string; data: T } | null> {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(SNAPSHOT);
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

/** on sign-out nothing about this person stays on the device */
export async function forgetDevice() {
  try {
    await caches.delete(CACHE);
    localStorage.removeItem(OUTBOX);
  } catch {
    /* nothing to clear */
  }
}

export function outbox(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

export function setOutbox(items: Queued[]) {
  try {
    if (items.length) localStorage.setItem(OUTBOX, JSON.stringify(items));
    else localStorage.removeItem(OUTBOX);
  } catch {
    /* storage unavailable */
  }
}

/** a connection failure, as opposed to the server saying no */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
