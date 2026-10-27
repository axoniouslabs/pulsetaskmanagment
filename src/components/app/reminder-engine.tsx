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
  const snooze = /^snooze(15|30|60)?$/.exec(action);
  if (action === "ack") {
    const r = s.acknowledge(taskId);
    if (r.ok) toast.success("Acknowledged", { description: "Reminders slowed down. Start when you're ready." });
  } else if (action === "start") {
    const r = s.start(taskId);
    if (r.ok) toast.success("Started", { description: "Your timer is running." });
  } else if (snooze) {
    const minutes = Number(snooze[1] ?? 30);
    const r = s.snooze(taskId, minutes);
    if (r.ok) toast(`Snoozed for ${minutes} minutes`);
  } else if (action === "done") s.openTaskDialog(taskId, "submit");
  else if (action === "block") s.openTaskDialog(taskId, "block");
  else if (action === "handover") s.openTaskDialog(taskId, "reassign");
  else if (action === "extend") s.openTaskDialog(taskId, "deadline");
  else s.openTask(taskId);
}

async function showSystem(n: AppNotification) {
  const s = useApp.getState();
  if (!s.local.systemNotifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  const status = n.taskId ? s.tasks.find((t) => t.id === n.taskId)?.status : undefined;
  const actions =
    n.kind === "reminder" || n.kind === "assigned"
      ? status === "assigned"
        ? [
            { action: "ack", title: "Acknowledge" },
            { action: "start", title: "Start" },
            { action: "snooze", title: "Snooze 30 min" },
          ]
        : status === "acknowledged"
          ? [
              { action: "start", title: "Start" },
              { action: "block", title: "I'm blocked" },
            ]
          : status === "in_progress"
            ? [
                { action: "done", title: "Mark done" },
                { action: "block", title: "I'm blocked" },
              ]
            : []
      : n.kind === "escalation"
        ? [
            { action: "handover", title: "Hand over" },
            { action: "extend", title: "Extend" },
          ]
        : [];
  await reg.showNotification(n.title, {
    body: n.body,
    tag: n.taskId ? `task-${n.taskId}` : n.id,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { taskId: n.taskId },
    // browsers show as many buttons as they can, in this order
    ...(n.taskId && actions.length ? ({ actions } as object) : {}),
  } as NotificationOptions);
}

export function showInApp(f: IncomingReminder) {
  const status = useApp.getState().tasks.find((t) => t.id === f.taskId)?.status;
  // the same choices as on a phone notification, for the state the task is in (spec §7)
  const main: { action: string; label: string }[] =
    status === "assigned"
      ? [
          { action: "ack", label: "Acknowledge" },
          { action: "start", label: "Start" },
        ]
      : status === "acknowledged"
        ? [
            { action: "start", label: "Start" },
            { action: "block", label: "I'm blocked" },
          ]
        : status === "in_progress"
          ? [
              { action: "done", label: "Mark done" },
              { action: "block", label: "I'm blocked" },
            ]
          : [];
  const canSnooze = status === "assigned" || status === "acknowledged";
  toast.custom(
    (id) => {
      const act = (action: string) => {
        toast.dismiss(id);
        handleAction(action, f.taskId);
      };
      return (
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
            {main.map((m, i) => (
              <button key={m.action} className={i === 0 ? "h-10 text-[13px] font-semibold text-ink hover:bg-ink-tint" : "h-10 border-l border-line text-[13px] font-medium text-text hover:bg-sunken"} onClick={() => act(m.action)}>
                {m.label}
              </button>
            ))}
            <button className={`h-10 text-[13px] font-medium text-muted hover:bg-sunken ${main.length ? "border-l border-line" : "col-span-3"}`} onClick={() => act("open")}>
              Open
            </button>
          </div>
          {canSnooze && (
            <div className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[12.5px] text-muted">
              Snooze for
              {[15, 30, 60].map((m) => (
                <button key={m} className="rounded-full border border-line px-2.5 py-1 font-medium text-text hover:border-ink/40" onClick={() => act(`snooze${m}`)}>
                  {m} min
                </button>
              ))}
            </div>
          )}
        </div>
      );
    },
    { duration: 15000, id: `rem-${f.taskId}` },
  );
}
