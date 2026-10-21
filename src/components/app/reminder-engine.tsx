"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useApp, type FiredReminder } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Demo stand-in for the server reminder engine.
 * - ticks every N seconds (Settings → Demo)
 * - shows an in-app notification with action buttons when the app is visible
 * - shows a real system notification (Windows toast / Android) when hidden,
 *   if the viewer allowed notifications. Buttons work through the service worker.
 */
export function ReminderEngine() {
  const intervalSec = useApp((s) => s.demo.intervalSec);
  const engineOn = useApp((s) => s.demo.engineOn);

  React.useEffect(() => {
    if (!engineOn) return;
    const first = setTimeout(() => fire(), 6000);
    const t = setInterval(() => fire(), intervalSec * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalSec, engineOn]);

  // actions coming back from system notifications (service worker)
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "reminder-action") handleAction(e.data.action, e.data.taskId);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    // opened from a notification while the app was closed
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task");
    if (taskId) {
      handleAction(params.get("action") ?? "open", taskId);
      window.history.replaceState(null, "", window.location.pathname);
    }
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  return null;
}

export function handleAction(action: string, taskId: string) {
  const s = useApp.getState();
  const task = s.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (action === "ack") {
    s.acknowledge(taskId);
    toast.success("Acknowledged", { description: "Reminders slowed down. Start when you're ready." });
  } else if (action === "snooze") {
    const r = s.snooze(taskId, 30);
    if (r.ok) toast("Snoozed for 30 minutes");
    else toast.error(r.error);
  } else {
    s.openTask(taskId);
  }
}

function fire() {
  const s = useApp.getState();
  const fired = s.engineTick();
  if (!fired) return;
  const viewing = s.role === "employee";
  if (!viewing) return;
  if (document.visibilityState === "hidden") showSystem(fired);
  else showInApp(fired);
}

async function showSystem(f: FiredReminder) {
  const s = useApp.getState();
  if (!s.demo.systemNotifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return;
  await reg.showNotification(`Reminder ${f.count}: ${f.title}`, {
    body: f.body,
    tag: f.taskId,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { taskId: f.taskId },
    requireInteraction: false,
    // action buttons: Chrome, Edge and Android show up to two
    ...({ actions: [{ action: "ack", title: "Acknowledge" }, { action: "snooze", title: "Snooze 30 min" }] } as object),
  } as NotificationOptions);
}

export function showInApp(f: FiredReminder) {
  toast.custom(
    (id) => (
      <div className="w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-pop">
        <div className="flex gap-3 px-4 pb-3 pt-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
            <BellRing className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint">Pulse, reminder {f.count}, now</p>
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

/** used by the "Send a test reminder" button */
export function TestReminderButton() {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        const s = useApp.getState();
        if (s.role !== "employee") s.setRole("employee");
        const fired = useApp.getState().engineTick();
        if (fired) showInApp(fired);
        else toast("Nothing to remind about", { description: "Ali has acknowledged all his tasks. Create a new task for Ali to see the loop again." });
      }}
    >
      <BellRing /> Send a test reminder
    </Button>
  );
}
