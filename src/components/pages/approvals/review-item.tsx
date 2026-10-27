"use client";

import * as React from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { useApp } from "@/lib/store";
import type { HeatLevel, Task } from "@/lib/types";
import { ago, cn, minutesToLabel } from "@/lib/utils";
import { Bar, Tip } from "@/components/ui/primitives";
import { AttachmentThumb } from "@/components/app/attachment-thumb";
import { Avatar } from "@/components/app/avatar";
import { Due, HEAT, HeatEdge, PriorityTag, ProjectTag } from "@/components/app/task-bits";
import { TaskActions } from "@/components/app/task-actions";
import { durationLabel } from "@/components/pages/tasks/filters";

/** heat for a waiting review: calm until the org's review time is up, then it warms */
export function reviewHeat(submittedAt: string | undefined, slaHours: number, now: Date): HeatLevel {
  if (!submittedAt) return 0;
  const hrs = (now.getTime() - new Date(submittedAt).getTime()) / 3600000;
  if (hrs < slaHours) return 0;
  if (hrs < slaHours * 1.5) return 1;
  if (hrs < slaHours * 2) return 2;
  return 3;
}

const TIMES = ["once", "twice"];

export function ReviewItem({ task, now, slaHours, meId }: { task: Task; now: Date; slaHours: number; meId: string }) {
  const openTask = useApp((s) => s.openTask);
  const assignee = useApp((s) => s.people.find((p) => p.id === task.assigneeId));
  const reviewer = useApp((s) => s.people.find((p) => p.id === task.reviewerId));
  const heat = reviewHeat(task.submittedAt, slaHours, now);
  const proofs = task.attachments.filter((a) => a.isProof);
  const first = assignee?.name.split(" ")[0] ?? "They";

  return (
    <article className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface" aria-label={`${task.title}, submitted by ${assignee?.name}`}>
      <HeatEdge level={heat} className="inset-y-0 w-1 rounded-none" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar person={assignee} size="md" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="pt-1 text-[13.5px] leading-snug text-muted">
                <span className="font-medium text-text">{assignee?.name}</span> submitted {ago(task.submittedAt, now)}
              </p>
              <WaitBadge submittedAt={task.submittedAt} heat={heat} slaHours={slaHours} now={now} />
            </div>
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className="relative mt-1.5 block text-left text-[17px] font-semibold leading-snug text-text underline-offset-4 before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] hover:underline"
            >
              {task.title}
            </button>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <ProjectTag id={task.projectId} />
              <PriorityTag priority={task.priority} hideNormal />
              <Due task={task} />
              {reviewer && reviewer.id !== meId && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                  <Avatar person={reviewer} size="xs" /> {reviewer.name.split(" ")[0]} reviews this
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4 sm:pl-11">
          {task.submissionNote ? (
            <p className="rounded-[var(--radius-md)] bg-sunken px-3.5 py-2.5 text-[14px] leading-relaxed text-text">
              <span className="sr-only">Note from {first}: </span>
              {task.submissionNote}
            </p>
          ) : (
            <p className="text-[13.5px] text-faint">No note with this submission.</p>
          )}

          {proofs.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-medium text-text">Proof</p>
              <div className="thin-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
                {proofs.map((a) => (
                  <a
                    key={a.id}
                    href={a.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    onClick={a.url ? undefined : (e) => (e.preventDefault(), openTask(task.id))}
                    className="w-[120px] shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line text-left hover:border-line-strong"
                    aria-label={`Open ${a.name}`}
                  >
                    <AttachmentThumb a={a} iconSize="size-5" />
                    <span className="block truncate px-2 py-1.5 text-[12px] font-medium text-text">{a.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TimeSpent task={task} />
            <History task={task} />
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-sunken/40 px-4 py-3 sm:px-5 sm:pl-[64px]">
        <TaskActions task={task} size="md" />
        <p className="text-[12.5px] text-faint sm:ml-auto">Approving closes the task and tells {first}.</p>
      </footer>
    </article>
  );
}

function WaitBadge({ submittedAt, heat, slaHours, now }: { submittedAt?: string; heat: HeatLevel; slaHours: number; now: Date }) {
  if (!submittedAt) return null;
  const hrs = (now.getTime() - new Date(submittedAt).getTime()) / 3600000;
  const left = Math.max(0, Math.ceil(slaHours - hrs));
  const tip = heat > 0 ? `Past the ${slaHours}-hour review time. Pulse has escalated it to the owner.` : `Reviews are due within ${slaHours} hours. About ${left}h left before it is escalated.`;
  return (
    <Tip label={tip}>
      <span
        className={cn(
          "tabular inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px]",
          heat > 0 ? cn(HEAT[heat].tint, HEAT[heat].text, "font-semibold") : "bg-sunken font-medium text-muted",
        )}
      >
        <Clock3 className="size-3.5" />
        Waiting {durationLabel(submittedAt, now)}
      </span>
    </Tip>
  );
}

function TimeSpent({ task }: { task: Task }) {
  const est = Math.round(task.estimateHours * 60);
  const logged = task.loggedMinutes;
  const ratio = est ? logged / est : 0;
  const judgement = !logged
    ? "No time was logged on this task."
    : !est
      ? `Took ${minutesToLabel(logged)}, no estimate was set.`
      : ratio <= 0.5
        ? "Much quicker than planned. Worth a closer look."
        : ratio <= 1
          ? "Within the estimate."
          : ratio <= 1.25
            ? "A little over the estimate."
            : `${minutesToLabel(logged - est)} over the estimate.`;
  return (
    <div>
      <p className="text-[13px] font-medium text-text">Time spent</p>
      <p className="tabular mt-0.5 text-[14px] text-text">{logged ? `Took ${minutesToLabel(logged)} of ${minutesToLabel(est)}` : `Estimate ${minutesToLabel(est)}`}</p>
      {logged > 0 && <Bar value={logged} max={Math.max(est, logged)} tone={ratio <= 1 ? "ok" : "ink"} className="mt-2 max-w-60" />}
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{judgement}</p>
    </div>
  );
}

function History({ task }: { task: Task }) {
  const n = task.rejections;
  return (
    <div>
      <p className="text-[13px] font-medium text-text">Review history</p>
      {n === 0 ? (
        <p className="mt-0.5 text-[14px] text-text">First submission</p>
      ) : n === 1 ? (
        <>
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-text">
            <RotateCcw className="size-3.5 text-muted" /> Sent back once before
          </p>
          {task.lastRejectionReason && <p className="mt-1 text-[12.5px] leading-snug text-muted">Last time: {task.lastRejectionReason}</p>}
        </>
      ) : (
        <div className="mt-1 rounded-[var(--radius-sm)] bg-heat-1-tint px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-text">
            <RotateCcw className="size-3.5 text-heat-1" />
            Sent back {TIMES[n - 1] ?? `${n} times`} before.
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-text/80">Unclear instructions are the usual cause.{task.lastRejectionReason ? ` Last time: ${task.lastRejectionReason}` : ""}</p>
        </div>
      )}
    </div>
  );
}
