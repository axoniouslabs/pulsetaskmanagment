"use client";

import * as React from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Switch } from "@/components/ui/primitives";
import { TestReminderButton } from "@/components/app/reminder-engine";
import { Chips, SettingRow } from "./parts";

const steps = (sec: number) => [
  { title: "Switch to Employee", body: "Use the role switcher at the bottom of the sidebar, or top right on a phone. You are now Ali Raza." },
  { title: "Wait for a reminder", body: `One arrives every ${sec < 60 ? `${sec} seconds` : `${sec / 60} min`} for Ali's most urgent unacknowledged task, or send one now with the button above.` },
  { title: "Tap Acknowledge", body: "Reminders stop for that task and the owner's view updates at once." },
  { title: "Switch to Owner and see it in the history", body: "Open the Activity log: every reminder and the acknowledgment are recorded there." },
];

export function DemoControls() {
  const demo = useApp((s) => s.demo);
  const setDemo = useApp((s) => s.setDemo);
  const resetDemo = useApp((s) => s.resetDemo);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <>
      <SettingRow htmlFor="demo-engine" label="Reminder engine" hint="Fires simulated reminders to Ali while this tab is open. The real engine runs on the server.">
        <Switch
          id="demo-engine"
          checked={demo.engineOn}
          onCheckedChange={(v) => {
            setDemo({ engineOn: v });
            toast.success(v ? "Reminder engine on" : "Reminder engine off", { id: "settings-saved", duration: 1600 });
          }}
        />
      </SettingRow>
      <SettingRow label="Demo reminder interval" hint="Real reminders follow the interval set above. The demo speeds it up so you can watch the loop.">
        <Chips
          label="Demo reminder interval"
          value={demo.intervalSec}
          onChange={(v) => {
            setDemo({ intervalSec: v });
            toast.success("Saved", { id: "settings-saved", duration: 1600 });
          }}
          options={[15, 30, 45, 60, 120].map((n) => ({ value: n, label: n < 60 ? `${n}s` : `${n / 60} min` }))}
        />
      </SettingRow>
      <SettingRow label="Try it now" hint="Switches to Employee and delivers the next reminder straight away.">
        <TestReminderButton />
      </SettingRow>
      <SettingRow label="Reset demo data" hint="Puts every task, person and message back to the starting story. Your role and demo settings stay.">
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset demo data
        </Button>
      </SettingRow>
      <div className="border-t border-line px-4 py-4 sm:px-5">
        <h3 className="text-[14px] font-semibold text-text">How to demo</h3>
        <ol className="mt-3 space-y-3">
          {steps(demo.intervalSec).map((s, i) => (
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

      <Dialog open={confirm} onOpenChange={setConfirm}>
        {confirm && (
          <DialogContent title="Reset demo data?" description="Every change made during this demo is replaced with the starting data. This can't be undone.">
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="dangerSolid"
                onClick={() => {
                  resetDemo();
                  setConfirm(false);
                  toast.success("Demo data reset", { description: "Everything is back to the starting story." });
                }}
              >
                <RotateCcw /> Reset demo data
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
