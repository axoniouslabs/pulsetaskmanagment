"use client";

/**
 * Turning reminders on for this device: service worker + Web Push subscription,
 * saved on the server against the signed-in person.
 */
export type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "no-server";

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushState(publicKey: string | null): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return isIosSafe() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (!publicKey) return "no-server";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function isIosSafe() {
  try {
    return isIos();
  } catch {
    return false;
  }
}

async function save(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save this device.");
}

export async function enablePush(publicKey: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!publicKey) return { ok: false, error: "Push isn't set up on the server yet." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: isIos() ? "On iPhone, first add Pulse to your Home Screen (Share → Add to Home Screen), then open it from there." : "This browser can't receive push notifications. Try Chrome or Edge." };
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notifications are blocked. Allow them for this site in your browser settings, then try again." };
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await save(sub);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't turn on notifications." };
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * On every app open: if this device already allowed notifications, renew the
 * subscription on the server (it may have expired or moved to a new person).
 */
export async function syncPush(publicKey: string | null) {
  try {
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return;
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await save(sub);
  } catch {
    /* best effort */
  }
}

export async function sendTestPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/push/test", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return res.ok ? { ok: true } : { ok: false, error: body.error ?? "The test didn't go through." };
}
