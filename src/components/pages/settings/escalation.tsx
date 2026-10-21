"use client";

import { BellRing, Info } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { NumberSetting, SettingRow, useSave } from "./parts";

const LEVEL_DOT = ["bg-ink", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];

/** the real escalation sequence, with its thresholds editable in place */
export function EscalationLadder() {
  const esc = useApp((s) => s.settings.escalation);
  const interval = useApp((s) => s.settings.defaultReminder.intervalMin);
  const reviewSla = useApp((s) => s.settings.reviewSlaHours);
  const save = useSave();
  const set = (patch: Partial<typeof esc>) => save({ escalation: { ...esc, ...patch } });

  const steps = [
    {
      level: 0,
      title: "The assignee is reminded",
      body: `Every ${interval < 60 ? `${interval} minutes` : interval === 60 ? "hour" : `${interval / 60} hours`} on their phone and PC until they acknowledge.`,
      control: null,
    },
    {
      level: 1,
      title: "Marked as slipping",
      body: "Still only the assignee is told. The task turns amber on every board.",
      control: (
        <NumberSetting
          label="Level 1 after this many ignored reminders"
          value={esc.l1Ignored}
          min={1}
          max={30}
          suffix="ignored reminders"
          validate={(n) => (n >= esc.l2Ignored ? `Must be fewer than level 2 (${esc.l2Ignored}).` : null)}
          onCommit={(n) => set({ l1Ignored: n })}
        />
      ),
    },
    {
      level: 2,
      title: "Team lead is told",
      body: "The lead gets a notification with the task and how long it has been ignored.",
      control: (
        <NumberSetting
          label="Level 2 after this many ignored reminders"
          value={esc.l2Ignored}
          min={2}
          max={40}
          suffix="ignored reminders"
          validate={(n) => (n <= esc.l1Ignored ? `Must be more than level 1 (${esc.l1Ignored}).` : n >= esc.l3Ignored ? `Must be fewer than level 3 (${esc.l3Ignored}).` : null)}
          onCommit={(n) => set({ l2Ignored: n })}
        />
      ),
    },
    {
      level: 3,
      title: "Department head is told",
      body: "The head of the department joins the lead. Overdue work always shows at this level.",
      control: (
        <NumberSetting
          label="Level 3 after this many ignored reminders"
          value={esc.l3Ignored}
          min={3}
          max={50}
          suffix="ignored reminders"
          validate={(n) => (n <= esc.l2Ignored ? `Must be more than level 2 (${esc.l2Ignored}).` : null)}
          onCommit={(n) => set({ l3Ignored: n })}
        />
      ),
    },
    {
      level: 4,
      title: "You are told",
      body: "If a task is past its deadline and still never acknowledged, it reaches the owner.",
      control: (
        <NumberSetting
          label="Level 4 after this many hours past the deadline"
          value={esc.l4HoursPastDue}
          min={1}
          max={168}
          suffix="hours past due"
          onCommit={(n) => set({ l4HoursPastDue: n })}
        />
      ),
    },
  ];

  return (
    <>
      <div className="flex items-start gap-2.5 border-b border-line bg-ink-tint/50 px-4 py-3 text-[13.5px] leading-snug text-ink sm:px-5">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-semibold">Escalation widens who is told. It never makes reminders more frequent.</span> Acknowledging the task stops the climb at once.
        </p>
      </div>
      <ol className="px-4 py-2 sm:px-5">
        {steps.map((s, i) => (
          <li key={s.level} className="relative flex gap-4 py-3.5">
            {i < steps.length - 1 && <span className="absolute bottom-0 left-[13px] top-[46px] w-px bg-line" aria-hidden />}
            <span
              className={cn(
                "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white",
                LEVEL_DOT[s.level],
              )}
            >
              {s.level === 0 ? <BellRing className="size-3.5" /> : s.level}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 pt-0.5">
                <p className="text-[14px] font-medium text-text">
                  {s.level === 0 ? "Start" : `Level ${s.level}`}: {s.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.body}</p>
              </div>
              {s.control}
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-line">
        <SettingRow label="Review deadline" hint="Work waiting for review longer than this is flagged on the Overview, against the reviewer.">
          <NumberSetting label="Review deadline in hours" value={reviewSla} min={1} max={168} suffix="hours" onCommit={(n) => save({ reviewSlaHours: n })} />
        </SettingRow>
      </div>
    </>
  );
}
