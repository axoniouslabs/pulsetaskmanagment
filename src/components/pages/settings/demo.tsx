"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/primitives";
import { SettingRow } from "./parts";

const STEPS = [
  { title: "Open Pulse twice", body: "Sign in as Ali (employee) on your phone and as Saad (manager) or Imran (owner) on a computer. Use a private window if both are on one computer." },
  { title: "Assign Ali a task", body: "As the manager, press New task, pick Ali and save. It lands on Ali's My day within seconds." },
  { title: "Acknowledge, start, submit", body: "As Ali, work through the task. Each step shows up for the manager and is written to the activity log." },
  { title: "Review it", body: "As the manager, open Approvals and approve or send it back. Nobody can edit or delete the history." },
];

export function DemoControls() {
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function reset() {
    setBusy(true);
    const res = await fetch("/api/demo/reset", { method: "POST" }).catch(() => null);
    setBusy(false);
    setConfirm(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast.error(body?.error ?? "The reset didn't finish. Try again.");
      return;
    }
    await useApp.getState().load();
    toast.success("Demo data reset", { description: "Everything is back to the starting story, with times moved to today." });
  }

  return (
    <>
      <SettingRow label="Reset demo data" hint="Puts every task, person and message back to the starting story, for everyone using the demo. Logins stay the same.">
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset demo data
        </Button>
      </SettingRow>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <h3 className="text-[14px] font-semibold text-text">How to demo</h3>
        <ol className="mt-3 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-tint text-[12px] font-bold text-ink">{i + 1}</span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13.5px] font-medium text-text">{s.title}</p>
                <p className="text-[12.5px] leading-snug text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Dialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        {confirm && (
          <DialogContent title="Reset demo data?" description="Every change made in the demo company, by anyone, is replaced with the starting data. This can't be undone.">
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="dangerSolid" onClick={reset} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset demo data
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
