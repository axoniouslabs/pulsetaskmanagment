"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useApp } from "@/lib/store";
import type { AppNotification } from "@/lib/types";

export interface IncomingReminder {
  taskId: string;
  title: string;
  body: string;
}

/**
 * Reminders are created on the server. This listens for new ones arriving with
 * each refresh and shows them: an in-app card while Pulse is open, or a system
 * notification when it's in the background and the person turned them on.
 * It also handles the Acknowledge / Snooze buttons on system notifications.
 */
export function ReminderEngine() {
  React.useEffect(() => {
    let seen: Set<string> | null = null;
    const unsub = useApp.subscribe((s) => {
      if (s.status !== "ready" || !s.viewer) return;
      const mine = s.notifications.filter((n) => n.recipientId === s.viewer!.personId);
      if (!seen) {
        seen = new Set(mine.map((n) => n.id));
        return;
      }
      const fresh = mine.filter((n) => !seen!.has(n.id) && !n.read);
      for (const n of mine) seen.add(n.id);
      // ids made in this browser are replaced by the server's on refresh; only surface server-made, recent ones
      for (const n of fresh.filter((x) => Date.now() - new Date(x.at).getTime() < 10 * 60_000).slice(0, 3)) surface(n);
    });
    return unsub;
  }, []);

  // actions coming back from system notifications (service worker)
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "reminder-action") handleAction(e.data.action, e.data.taskId);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // opened from a notification while the app was closed: wait for data, then act
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task");
    if (!taskId) return;
    const action = params.get("action") ?? "open";
    window.history.replaceState(null, "", window.location.pathname);
    const run = () => {
      if (useApp.getState().status !== "ready") return false;
      handleAction(action, taskId);
      return true;
    };
    if (run()) return;
    const unsub = useApp.subscribe(() => run() && unsub());
    return unsub;
  }, []);

  return null;
}

function surface(n: AppNotification) {
  const s = useApp.getState();
  if (s.notifications.find((x) => x.id === n.id)?.read) return;
  if (document.visibilityState === "hidden") return void showSystem(n);
  if (n.kind === "reminder" && n.taskId) return showInApp({ taskId: n.taskId, title: n.title, body: n.body });
  toast(n.title, {
    description: n.body,
    duration: 8000,
    action: n.taskId ? { label: "Open", onClick: () => useApp.getState().openTask(n.taskId!) } : undefined,
  });
}

export function handleAction(action: string, taskId: string) {
  const s = useApp.getState();
  const task = s.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (action === "ack") {
    const r = s.acknowledge(taskId);
    if (r.ok) toast.success("Acknowledged", { description: "Reminders slowed down. Start when you're ready." });
  } else if (action === "snooze") {
    const r = s.snooze(taskId, 30);
    if (r.ok) toast("Snoozed for 30 minutes");
  } else {
    s.openTask(taskId);
  }
}

async function showSystem(n: AppNotification) {
  const s = useApp.getState();
  if (!s.local.systemNotifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  const actionable = n.kind === "reminder" || n.kind === "assigned";
  await reg.showNotification(n.title, {
    body: n.body,
    tag: n.taskId ?? n.id,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { taskId: n.taskId },
    // action buttons: Chrome, Edge and Android show up to two
    ...(actionable && n.taskId ? ({ actions: [{ action: "ack", title: "Acknowledge" }, { action: "snooze", title: "Snooze 30 min" }] } as object) : {}),
  } as NotificationOptions);
}

export function showInApp(f: IncomingReminder) {
  toast.custom(
    (id) => (
      <div className="w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-pop">
        <div className="flex gap-3 px-4 pb-3 pt-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
            <BellRing className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint">Pulse, now</p>
            <p className="mt-0.5 text-[14px] font-semibold leading-snug text-text">{f.title}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{f.body}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-line">
          <button
            className="h-10 text-[13px] font-semibold text-ink hover:bg-ink-tint"
            onClick={() => {
              toast.dismiss(id);
              handleAction("ack", f.taskId);
            }}
          >
            Acknowledge
          </button>
          <button
            className="h-10 border-x border-line text-[13px] font-medium text-text hover:bg-sunken"
            onClick={() => {
              toast.dismiss(id);
              handleAction("snooze", f.taskId);
            }}
          >
            Snooze 30
          </button>
          <button
            className="h-10 text-[13px] font-medium text-muted hover:bg-sunken"
            onClick={() => {
              toast.dismiss(id);
              handleAction("open", f.taskId);
            }}
          >
            Open
          </button>
        </div>
      </div>
    ),
    { duration: 15000, id: `rem-${f.taskId}` },
  );
}
