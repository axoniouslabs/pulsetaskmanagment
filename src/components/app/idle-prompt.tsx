"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Pause, Play } from "lucide-react";
import { useApp, useMeId } from "@/lib/store";
import { minutesToLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/primitives";

/** no touch, click, key or scroll for this long while a timer runs: ask */
const IDLE_MIN = 45;

/**
 * "Still working on this?" A timer left running with nobody at the screen
 * gets one question: keep it, or stop it at the moment activity stopped.
 */
export function IdlePrompt() {
  const meId = useMeId();
  const timer = useApp((s) => (meId ? s.timers[meId] : undefined));
  // a new timer starts the watch afresh
  return timer ? <IdleWatch key={timer.startedAt} timer={timer} /> : null;
}

function IdleWatch({ timer }: { timer: { taskId: string; startedAt: string } }) {
  const task = useApp((s) => s.tasks.find((t) => t.id === timer.taskId));
  const stopTimer = useApp((s) => s.stopTimer);
  // 0 until the first interaction: the timer's start counts as the last activity
  const lastActive = React.useRef(0);
  const [asking, setAsking] = React.useState<number | null>(null);
  // when the question was asked, so the dialog shows stable numbers
  const [askedAt, setAskedAt] = React.useState(0);

  React.useEffect(() => {
    const touch = () => {
      if (document.visibilityState === "visible" && asking === null) lastActive.current = Date.now();
    };
    const check = () => {
      if (asking !== null) return;
      const since = Math.max(lastActive.current, new Date(timer.startedAt).getTime());
      if (Date.now() - since >= IDLE_MIN * 60000) {
        setAskedAt(Date.now());
        setAsking(since);
      }
    };
    // coming back to the app after a long time away is the moment to ask
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(check, 60000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [timer, asking]);

  if (asking === null) return null;
  const ranFor = Math.round((askedAt - new Date(timer.startedAt).getTime()) / 60000);
  const quiet = Math.round((askedAt - asking) / 60000);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          lastActive.current = Date.now();
          setAsking(null);
        }
      }}
    >
      <DialogContent
        title={`Still working on ${task?.title ?? "this task"}?`}
        description={`The timer has run for ${minutesToLabel(ranFor)}, but nothing has happened here for ${minutesToLabel(quiet)}.`}
      >
        <p className="text-[13.5px] leading-snug text-muted">
          If you stepped away, stop the timer at {format(new Date(asking), "h:mm a")} so only real work is counted. If you were working away from the screen, keep it running.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              lastActive.current = Date.now();
              setAsking(null);
            }}
          >
            <Play /> Yes, keep it running
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const at = new Date(asking).toISOString();
              setAsking(null);
              if (stopTimer(at).ok) toast("Timer stopped", { description: `Counted up to ${format(new Date(at), "h:mm a")}.` });
            }}
          >
            <Pause /> Stop it at {format(new Date(asking), "h:mm a")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
