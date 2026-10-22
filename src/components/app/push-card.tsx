"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Send, Smartphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

export function usePushState() {
  const key = useApp((s) => s.pushPublicKey);
  const [state, setState] = React.useState<PushState | "checking">("checking");
  const refresh = React.useCallback(() => {
    getPushState(key).then(setState).catch(() => setState("unsupported"));
  }, [key]);
  React.useEffect(() => {
    let alive = true;
    getPushState(key)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, [key]);
  return { state, refresh, key };
}

const COPY: Record<PushState, { title: string; body: string }> = {
  on: { title: "Reminders reach this device", body: "Acknowledge and Snooze work right from the notification, even when Pulse is closed." },
  off: { title: "Get reminders on this device", body: "Turn on notifications so reminders pop up with Acknowledge and Snooze buttons, even when Pulse is in the background." },
  denied: { title: "Notifications are blocked", body: "Your browser is blocking notifications for Pulse. Allow them in the site settings (the lock icon in the address bar), then come back." },
  "ios-install": { title: "Add Pulse to your Home Screen first", body: "On iPhone, notifications work once Pulse is installed: tap Share, then Add to Home Screen, and open Pulse from there." },
  unsupported: { title: "This browser can't receive reminders", body: "Use Chrome or Edge on your PC or Android phone, or install Pulse on your iPhone's Home Screen." },
  "no-server": { title: "Push isn't set up yet", body: "The server has no push keys yet. Reminders still show inside Pulse." },
};

/** this device's notification status, with turn on / test / turn off */
export function PushCard({ compact = false, onDismiss }: { compact?: boolean; onDismiss?: () => void }) {
  const { state, refresh, key } = usePushState();
  const [busy, setBusy] = React.useState<"on" | "off" | "test" | null>(null);
  if (state === "checking") return null;
  const c = COPY[state];

  const turnOn = async () => {
    setBusy("on");
    const r = await enablePush(key);
    setBusy(null);
    refresh();
    if (r.ok) toast.success("Notifications on", { description: "Reminders will reach this device. Send a test to check." });
    else toast.error(r.error);
  };
  const test = async () => {
    setBusy("test");
    const r = await sendTestPush();
    setBusy(null);
    if (r.ok) toast.success("Test sent", { description: "It should appear within a few seconds." });
    else toast.error(r.error);
  };
  const turnOff = async () => {
    setBusy("off");
    await disablePush();
    setBusy(null);
    refresh();
    toast("Notifications off on this device");
  };

  return (
    <div className={compact ? "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:flex-row sm:items-center" : "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${state === "on" ? "bg-ok-tint text-ok" : state === "denied" ? "bg-heat-2-tint text-heat-2" : "bg-ink-tint text-ink"}`}>
        {state === "on" ? <BellRing className="size-5" /> : state === "denied" ? <BellOff className="size-5" /> : <Smartphone className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{c.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{c.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onDismiss && state !== "on" && (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Later
          </Button>
        )}
        {state === "off" && (
          <Button size="sm" variant="primary" onClick={turnOn} disabled={!!busy}>
            {busy === "on" ? <Loader2 className="animate-spin" /> : <BellRing />} Turn on
          </Button>
        )}
        {state === "on" && (
          <>
            <Button size="sm" variant="secondary" onClick={test} disabled={!!busy}>
              {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send a test
            </Button>
            {!compact && (
              <Button size="sm" variant="ghost" onClick={turnOff} disabled={!!busy}>
                Turn off
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
