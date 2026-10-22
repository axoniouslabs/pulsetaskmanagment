"use client";

import * as React from "react";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BellRing,
  Check,
  CheckCircle2,
  GripVertical,
  LogIn,
  LogOut,
  Megaphone,
  MessageCircleQuestion,
  Pause,
  Play,
  Sparkles,
  CircleCheckBig,
  ChevronDown,
} from "lucide-react";
import { PushCard, usePushState } from "@/components/app/push-card";
import { useApp, membersOf } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import { NEXT_UP_SCORE, isOpenWork } from "@/lib/selectors";
import type { Task } from "@/lib/types";
import { ago, cn, dueLabel, minutesToLabel, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Select, Textarea } from "@/components/ui/primitives";
import { Panel, SectionHeading, EmptyState } from "@/components/app/page-header";
import { TaskList, TaskRow } from "@/components/app/task-row";
import { Due, HeatEdge, PriorityTag, ProjectTag } from "@/components/app/task-bits";
import { TaskActions, TaskDialogs } from "@/components/app/task-actions";
import { heatOf } from "@/lib/selectors";

export default function TodayPage() {
  const now = useNow(15000);
  const { me, meId, allTasks } = useScope();
  const s = useApp();
  const mine = React.useMemo(() => allTasks.filter((t) => t.assigneeId === meId), [allTasks, meId]);
  const toAck = mine.filter((t) => t.status === "assigned").sort((a, b) => NEXT_UP_SCORE(a, now) - NEXT_UP_SCORE(b, now));
  const working = mine.filter((t) => ["acknowledged", "in_progress"].includes(t.status) && (!t.startAt || new Date(t.startAt) <= now));
  const waiting = mine.filter((t) => t.status === "blocked" || t.status === "submitted");
  const doneToday = mine.filter((t) => t.status === "approved" && t.approvedAt && isToday(new Date(t.approvedAt)));
  const timer = s.timers[meId];
  const timerTask = timer ? mine.find((t) => t.id === timer.taskId) : undefined;
  const today = format(now, "yyyy-MM-dd");
  const att = s.attendance.find((a) => a.personId === meId && a.date === today);
  const notices = s.announcements.filter((a) => {
    if (!a.requiresAck || a.ackBy[meId] || a.authorId === meId) return false;
    const ch = s.channels.find((c) => c.id === a.channelId);
    return !!ch && membersOf(s, ch.unitType, ch.unitId).includes(meId);
  });
  const myQuestions = s.questions.filter((q) => q.fromId === meId).slice(0, 3);

  // manual order with a smart default
  const saved = s.dayOrder[meId];
  const workingKey = working.map((t) => t.id + t.status).join();
  const ordered = React.useMemo(() => {
    const auto = [...working].sort((a, b) => NEXT_UP_SCORE(a, now) - NEXT_UP_SCORE(b, now));
    if (!saved) return auto;
    const pos = (id: string) => {
      const i = saved.indexOf(id);
      return i === -1 ? 999 : i;
    };
    return [...auto].sort((a, b) => pos(a.id) - pos(b.id));
    // the key captures every change that matters; `now` only nudges the default order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingKey, saved]);

  const nextUp = timerTask ?? toAck[0] ?? ordered[0];
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const leadId = s.teams.find((t) => t.id === me.teamId)?.leadId;
  const lead = s.people.find((p) => p.id === (leadId === meId ? s.departments.find((d) => d.id === me.departmentId)?.headId ?? "p_imran" : leadId));
  const [askOpen, setAskOpen] = React.useState(() => typeof window !== "undefined" && window.location.hash === "#ask");
  const [showDone, setShowDone] = React.useState(false);

  const brief =
    toAck.length + ordered.length === 0
      ? "Nothing on your list right now."
      : `${plural(toAck.length + ordered.length, "task")} today.${nextUp ? ` Start with “${nextUp.title}”${nextUp.priority === "urgent" ? ", it's urgent" : ""}.` : ""}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-8">
        <header>
          <p className="text-[14px] text-muted">{format(now, "EEEE d MMMM")}</p>
          <h1 className="mt-1.5 font-display text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">
            {greet}, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-muted">{brief}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!att?.checkIn ? (
              <Button variant="primary" size="lg" onClick={() => { s.checkIn(); toast.success("Checked in", { description: `at ${format(new Date(), "h:mm a")}` }); }}>
                <LogIn /> Check in
              </Button>
            ) : (
              <>
                <span className="inline-flex h-9 items-center gap-2 rounded-full bg-ok-tint px-3.5 text-[13.5px] font-medium text-ok">
                  <span className="size-2 animate-pulse-dot rounded-full bg-ok" />
                  {att.checkOut ? `Checked out at ${format(new Date(att.checkOut), "h:mm a")}` : `Checked in at ${format(new Date(att.checkIn), "h:mm a")}`}
                  {att.status === "late" && !att.checkOut && <span className="text-heat-1">, late</span>}
                </span>
                {!att.checkOut && (
                  <Button variant="ghost" size="sm" onClick={() => { s.checkOut(); toast("Checked out", { description: "Any running timer was stopped." }); }}>
                    <LogOut /> Check out
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setAskOpen(true)}>
              <MessageCircleQuestion /> Ask {lead?.name.split(" ")[0] ?? "your manager"}
            </Button>
          </div>
        </header>

        <NotifyPrompt />

        {/* notices that need an OK */}
        {notices.map((n) => (
          <div key={n.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-ink/15 bg-ink-tint/50 p-4 sm:flex-row sm:items-center">
            <Megaphone className="size-5 shrink-0 text-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[13.5px] text-muted">{n.body}</p>
            </div>
            <Button size="sm" variant="primary" onClick={() => { s.ackAnnouncement(n.id); toast.success("Acknowledged", { description: `${s.people.find((p) => p.id === n.authorId)?.name.split(" ")[0]} can see you've read it.` }); }}>
              <Check /> I've read this
            </Button>
          </div>
        ))}

        {/* now / next up */}
        {nextUp && <FocusCard task={nextUp} running={!!timerTask && timerTask.id === nextUp.id} startedAt={timer?.startedAt} />}

        {toAck.length > 0 && (
          <section>
            <SectionHeading title={<span className="flex items-center gap-2"><BellRing className="size-4 text-heat-1" /> Needs your OK</span>} aside="Acknowledge so reminders stop" />
            <TaskList>
              {toAck.map((t) => (
                <TaskRow key={t.id} task={t} showAssignee={false} showStatus={false} showActions />
              ))}
            </TaskList>
          </section>
        )}

        <section>
          <SectionHeading title="Your list" aside={ordered.length > 1 ? "Drag to set your own order" : undefined} />
          {ordered.length ? <SortableList tasks={ordered} onReorder={(ids) => s.setDayOrder(ids)} /> : (
            <Panel>
              <EmptyState icon={CheckCircle2} title="Nothing in progress" body="Tasks you acknowledge or start show up here, in the order you choose." />
            </Panel>
          )}
        </section>

        {waiting.length > 0 && (
          <section>
            <SectionHeading title="Waiting on others" aside="Not counted against you" />
            <TaskList>
              {waiting.map((t) => (
                <TaskRow key={t.id} task={t} showAssignee={false} />
              ))}
            </TaskList>
          </section>
        )}

        {doneToday.length > 0 && (
          <section>
            <button className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold" onClick={() => setShowDone((v) => !v)}>
              <ChevronDown className={cn("size-4 text-faint transition-transform", !showDone && "-rotate-90")} />
              Done today <span className="tabular font-normal text-muted">{doneToday.length}</span>
            </button>
            {showDone && (
              <TaskList>
                {doneToday.map((t) => (
                  <TaskRow key={t.id} task={t} showAssignee={false} />
                ))}
              </TaskList>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <DaySummary />
        {myQuestions.length > 0 && (
          <Panel className="p-5">
            <SectionHeading title="Your questions" />
            <ul className="space-y-4">
              {myQuestions.map((q) => (
                <li key={q.id} className="text-[13.5px]">
                  <p className="text-text">{q.body}</p>
                  {q.answer ? (
                    <p className="mt-1.5 rounded-[var(--radius-sm)] bg-ok-tint px-2.5 py-2 text-text">
                      <span className="font-medium text-ok">{s.people.find((p) => p.id === q.toId)?.name.split(" ")[0]}:</span> {q.answer}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-faint">Sent to {s.people.find((p) => p.id === q.toId)?.name.split(" ")[0]} {ago(q.at)}, waiting for an answer</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>

      <AskDialog open={askOpen} onOpenChange={setAskOpen} defaultTo={lead?.id} tasks={[...toAck, ...ordered]} />
    </div>
  );
}

/* ---------- the one thing to do now ---------- */
function FocusCard({ task, running, startedAt }: { task: Task; running: boolean; startedAt?: string }) {
  const now = useNow(1000);
  const elapsed = running && startedAt ? Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000) : 0;
  const openTask = useApp((s) => s.openTask);
  const total = task.loggedMinutes * 60 + elapsed;
  const done = task.subtasks.filter((x) => x.done).length;
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-xl)] bg-ink text-white">
      <div className="absolute inset-y-0 right-0 w-1/2 opacity-[0.07]" aria-hidden>
        <svg viewBox="0 0 200 100" className="h-full w-full" preserveAspectRatio="none">
          <path d="M0 55h55l10-25 18 45 11-20h106" fill="none" stroke="white" strokeWidth="6" />
        </svg>
      </div>
      <div className="relative p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[13px] font-medium text-white/70">
          {running ? (
            <>
              <span className="size-2 animate-pulse-dot rounded-full bg-[#4ade80]" /> Working on now
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Next up
            </>
          )}
        </p>
        <button onClick={() => openTask(task.id)} className="mt-2 block text-left font-display text-[22px] font-semibold leading-snug hover:underline sm:text-[26px]">
          {task.title}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/75">
          <span className={cn(new Date(task.dueAt) < now && "font-semibold text-[#ffb4a8]")}>{dueLabel(task.dueAt)}</span>
          <span>{task.priority[0].toUpperCase() + task.priority.slice(1)} priority</span>
          {task.subtasks.length > 0 && <span>{done} of {task.subtasks.length} steps</span>}
          <span className="tabular">
            {running
              ? `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
              : minutesToLabel(task.loggedMinutes)}{" "}
            of {task.estimateHours}h
          </span>
        </div>
        <div className="mt-5 [&_button]:border-white/20 [&_.bg-surface]:bg-white/10 [&_.bg-surface]:text-white">
          <FocusActions task={task} running={running} />
        </div>
      </div>
    </section>
  );
}

function FocusActions({ task, running }: { task: Task; running: boolean }) {
  const s = useApp.getState();
  const [submitOpen, setSubmitOpen] = React.useState(false);
  if (task.status === "assigned")
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="bg-white text-ink hover:bg-white/90" onClick={() => { s.acknowledge(task.id); toast.success("Acknowledged", { description: "Reminders slowed down." }); }}>
          <Check /> Acknowledge
        </Button>
        <Button size="lg" className="border border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={() => { s.start(task.id); toast.success("Started", { description: "Timer is running." }); }}>
          <Play /> Start now
        </Button>
      </div>
    );
  if (task.status === "acknowledged" || (task.status === "in_progress" && !running))
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="bg-white text-ink hover:bg-white/90" onClick={() => { s.start(task.id); toast.success(task.startedAt ? "Resumed" : "Started", { description: "Timer is running." }); }}>
          <Play /> {task.startedAt ? "Resume" : "Start"}
        </Button>
        {task.status === "in_progress" && (
          <>
            <Button size="lg" className="border border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={() => setSubmitOpen(true)}>
              <CircleCheckBig /> {task.requiresApproval ? "Submit" : "Mark done"}
            </Button>
            <SubmitBridge task={task} open={submitOpen} onClose={() => setSubmitOpen(false)} />
          </>
        )}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" className="bg-[#4ade80] text-ink hover:brightness-105" onClick={() => setSubmitOpen(true)}>
        <CircleCheckBig /> {task.requiresApproval ? "Submit for review" : "Mark done"}
      </Button>
      <Button size="lg" className="border border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={() => { s.stopTimer(); toast("Timer paused"); }}>
        <Pause /> Pause
      </Button>
      <SubmitBridge task={task} open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </div>
  );
}

function SubmitBridge({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  return <TaskDialogs task={task} kind={open ? "submit" : null} onClose={onClose} />;
}

/* ---------- sortable list ---------- */
function SortableList({ tasks, onReorder }: { tasks: Task[]; onReorder: (ids: string[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = tasks.map((t) => t.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <TaskList>
          {tasks.map((t, i) => (
            <SortableTask key={t.id} task={t} index={i} />
          ))}
        </TaskList>
      </SortableContext>
    </DndContext>
  );
}

function SortableTask({ task, index }: { task: Task; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const openTask = useApp((s) => s.openTask);
  const timer = useApp((s) => s.timers[task.assigneeId]);
  const running = timer?.taskId === task.id;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative flex items-center gap-2 border-b border-line bg-surface py-3 pl-2 pr-4 last:border-b-0", isDragging && "z-10 shadow-pop")}
    >
      <HeatEdge level={heatOf(task)} />
      <button {...attributes} {...listeners} className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:bg-sunken hover:text-muted active:cursor-grabbing" aria-label={`Move ${task.title}`}>
        <GripVertical className="size-4" />
      </button>
      <span className="tabular w-5 shrink-0 text-[13px] font-semibold text-faint">{index + 1}</span>
      <button className="min-w-0 flex-1 text-left" onClick={() => openTask(task.id)}>
        <p className="truncate text-[14.5px] font-medium">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {running && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-ok" /> Timer running
            </span>
          )}
          <Due task={task} />
          <PriorityTag priority={task.priority} hideNormal />
          <ProjectTag id={task.projectId} />
          {task.status === "acknowledged" && <span className="text-[12.5px] text-info">Seen, not started</span>}
        </div>
      </button>
      <div className="hidden shrink-0 sm:block">
        <TaskActions task={task} size="sm" compact />
      </div>
    </div>
  );
}

/* ---------- side summary ---------- */
function DaySummary() {
  const { meId, allTasks } = useScope();
  const stats = useApp((s) => s.stats);
  const mine = allTasks.filter((t) => t.assigneeId === meId);
  const week = stats.filter((x) => x.personId === meId).slice(-6);
  const approved = week.reduce((s, x) => s + x.approved, 0);
  const onTime = week.reduce((s, x) => s + x.onTime, 0);
  const ackFirst = week.reduce((s, x) => s + x.ackFirst, 0);
  const assigned = week.reduce((s, x) => s + x.assigned, 0);
  return (
    <Panel className="p-5">
      <SectionHeading title="Your week" aside="Last 6 working days" />
      <dl className="mt-1 space-y-3 text-[14px]">
        <Row label="Tasks done" value={String(approved)} />
        <Row label="On time" value={approved ? `${Math.round((onTime / approved) * 100)}%` : "–"} />
        <Row label="Answered the first reminder" value={assigned ? `${Math.min(100, Math.round((ackFirst / assigned) * 100))}%` : "–"} />
        <Row label="Open now" value={String(mine.filter(isOpenWork).length)} />
      </dl>
      <p className="mt-4 text-[12.5px] leading-snug text-muted">These are the same numbers your manager sees. Blocked time never counts against you.</p>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-display text-[20px] font-semibold leading-none">{value}</dd>
    </div>
  );
}

/* ---------- notifications permission ---------- */
function NotifyPrompt() {
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return sessionStorage.getItem("pulse-notify-later") === "1";
    } catch {
      return false;
    }
  });
  const { state } = usePushState();
  if (dismissed || state === "checking" || state === "on" || state === "no-server") return null;
  return (
    <PushCard
      compact
      onDismiss={() => {
        setDismissed(true);
        try {
          sessionStorage.setItem("pulse-notify-later", "1");
        } catch {}
      }}
    />
  );
}

/* ---------- ask a question ---------- */
function AskDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; defaultTo?: string; tasks: Task[] }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <AskForm {...props} />}
    </Dialog>
  );
}

function AskForm({ onOpenChange, defaultTo, tasks }: { onOpenChange: (o: boolean) => void; defaultTo?: string; tasks: Task[] }) {
  const people = useApp((s) => s.people);
  const meId = useApp((s) => s.userIds[s.role]);
  const ask = useApp((s) => s.askQuestion);
  const [to, setTo] = React.useState(defaultTo ?? "p_imran");
  const [taskId, setTaskId] = React.useState("");
  const [body, setBody] = React.useState("");
  return (
        <DialogContent title="Ask a question" description="It goes straight to their phone and PC, and they're reminded until they answer.">
          <Field label="Ask">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {people.filter((p) => p.id !== meId && p.role !== "employee").map((p) => (
                <option key={p.id} value={p.id}>{p.name}, {p.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="About a task (optional)" className="mt-4">
            <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Not about a specific task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Your question" className="mt-4">
            <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's unclear?" />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!body.trim()}
              onClick={() => {
                ask({ toId: to, body: body.trim(), taskId: taskId || undefined });
                onOpenChange(false);
                toast.success("Question sent", { description: `${people.find((p) => p.id === to)?.name.split(" ")[0]} has been notified.` });
              }}
            >
              Send question
            </Button>
          </div>
        </DialogContent>
  );
}
