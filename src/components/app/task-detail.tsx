"use client";

import * as React from "react";
import { uploadToTask, uploadVoiceNote, startRecording, ACCEPT } from "@/lib/upload";
import { AttachmentThumb } from "./attachment-thumb";
import { format } from "date-fns";
import {
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  BellOff,
  BellRing,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock4,
  Eye,
  Loader2,
  Hand,
  MessageSquare,
  Mic,
  PauseCircle,
  Plus,
  Send,
  Undo2,
  UserRoundCog,
  X,
  XCircle,
  CalendarClock,
  LogIn,
  LogOut,
  Megaphone,
  MessageCircleQuestion,
  Square,
  Play,
  Timer,
  AlertTriangle,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useApp, useMeId } from "@/lib/store";
import type { Activity, ActivityKind, Task } from "@/lib/types";
import { heatOf, isOverdue } from "@/lib/selectors";
import { ago, cn, dueLabel, formatWhen, minutesToLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Segmented, Sheet, SheetClose, Textarea, Bar } from "@/components/ui/primitives";
import { Avatar } from "./avatar";
import { HEAT, HeatBadge, PriorityTag, ProjectTag, RecurrenceTag, StatusPill } from "./task-bits";
import { TaskActions, useTaskRole } from "./task-actions";

export function TaskDetailSheet() {
  const openId = useApp((s) => s.openTaskId);
  const task = useApp((s) => s.tasks.find((t) => t.id === s.openTaskId));
  const openTask = useApp((s) => s.openTask);
  return (
    <Sheet open={!!openId && !!task} onOpenChange={(o) => !o && openTask(null)} title={task?.title ?? "Task"}>
      {task && <TaskDetail task={task} />}
    </Sheet>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const people = useApp((s) => s.people);
  const r = useTaskRole(task);
  const heat = heatOf(task);
  const person = (id?: string) => people.find((p) => p.id === id);
  const assignee = person(task.assigneeId)!;
  const reviewer = person(task.reviewerId);
  const blocker = person(task.blockedOwnerId);
  const overdue = isOverdue(task);
  const timer = useApp((s) => s.timers[task.assigneeId]);
  const [tab, setTab] = React.useState<"comments" | "history">("comments");

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-5 pb-4 pt-3 backdrop-blur sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={task.status} />
            <HeatBadge level={heat} />
            <PriorityTag priority={task.priority} />
            <RecurrenceTag task={task} />
          </div>
          <SheetClose className="-mr-2 rounded-[var(--radius-sm)] p-2 text-faint hover:bg-sunken hover:text-text" aria-label="Close">
            <X className="size-5" />
          </SheetClose>
        </div>
        <h2 className="mt-3 font-display text-[22px] font-semibold leading-tight text-text sm:text-[24px]">{task.title}</h2>
        <div className="mt-4 hidden md:block">
          <TaskActions task={task} />
        </div>
      </div>

      <div className="flex-1 space-y-6 px-5 py-5 sm:px-7">
        {/* situation banners */}
        {task.status === "blocked" && (
          <Banner tone="heat-2" icon={AlertOctagon} title={`Blocked ${ago(task.blockedAt)}. Waiting on ${blocker?.name.split(" ")[0] ?? "someone"}.`}>
            {task.blockedReason} Reminders are paused, and this time counts against the blocker, not {assignee.name.split(" ")[0]}.
          </Banner>
        )}
        {task.status === "in_progress" && task.lastRejectionReason && task.rejections > 0 && (
          <Banner tone="heat-1" icon={Undo2} title={`Sent back by ${reviewer?.name.split(" ")[0]}`}>
            {task.lastRejectionReason}
          </Banner>
        )}
        {task.status === "submitted" && (
          <Banner tone="info" icon={Send} title={`Submitted ${ago(task.submittedAt)}, waiting for ${reviewer?.name.split(" ")[0]}`}>
            {task.submissionNote || "No note added."}
          </Banner>
        )}
        {overdue && task.status !== "blocked" && (
          <Banner tone="heat-3" icon={AlertTriangle} title={dueLabel(task.dueAt)}>
            {heat >= 4 ? "The owner has been told this task got no response." : heat >= 3 ? "The department head has been told." : "Escalation is running."}
          </Banner>
        )}
        {task.groupClaim && !task.groupClaim.claimed && (
          <Banner tone="heat-1" icon={Users} title={`Offered to ${task.groupClaim.unitName}, not claimed yet`}>
            Everyone in it has been told. The first person to claim it owns it and gets the reminders.
          </Banner>
        )}
        <WaitsFor task={task} />

        {/* key facts */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Fact label="Assigned to">
            <span className="flex items-center gap-2">
              <Avatar person={assignee} size="sm" />
              <span className="truncate">{assignee.name}</span>
            </span>
          </Fact>
          <Fact label="Reviewer">
            <span className="flex items-center gap-2">
              {reviewer && <Avatar person={reviewer} size="sm" />}
              <span className="truncate">{task.requiresApproval ? reviewer?.name : "Auto-approve"}</span>
            </span>
          </Fact>
          <Fact label="Due">
            <span className={cn("tabular", overdue && "font-semibold text-heat-3")}>{format(new Date(task.dueAt), "EEE d MMM, h:mm a")}</span>
          </Fact>
          <Fact label="Project">{task.projectId ? <ProjectTag id={task.projectId} /> : <span className="text-faint">None</span>}</Fact>
          <Fact label="Time">
            <span className="tabular">
              {minutesToLabel(task.loggedMinutes)} of {task.estimateHours}h
              {timer?.taskId === task.id && <span className="ml-2 inline-flex items-center gap-1 text-ok"><span className="size-1.5 animate-pulse-dot rounded-full bg-ok" />running</span>}
            </span>
          </Fact>
          <Fact label="Created">
            <span className="text-muted">{formatWhen(task.createdAt, { withDay: true })} by {person(task.createdById)?.name.split(" ")[0]}</span>
          </Fact>
        </dl>

        <ReminderPanel task={task} />

        {task.description && (
          <section>
            <SectionTitle>Instructions</SectionTitle>
            <p className="max-w-[68ch] whitespace-pre-line text-[14.5px] leading-relaxed text-text">{task.description}</p>
          </section>
        )}

        <Checklist task={task} canEdit={r.isAssignee || r.canManage} />

        <Files task={task} />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <Segmented
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: "comments", label: "Comments", count: task.comments.length },
                { value: "history", label: "History" },
              ]}
            />
          </div>
          {tab === "comments" ? <Comments task={task} /> : <History taskId={task.id} />}
        </section>
      </div>

      {/* thumb-zone action bar on phones */}
      <div className="safe-bottom sticky bottom-0 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur md:hidden">
        <TaskActions task={task} size="lg" className="pb-3 [&>button]:flex-1" />
      </div>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, children }: { tone: "heat-1" | "heat-2" | "heat-3" | "info" | "ok"; icon: React.ElementType; title: string; children: React.ReactNode }) {
  const cls = {
    "heat-1": "bg-heat-1-tint text-heat-1",
    "heat-2": "bg-heat-2-tint text-heat-2",
    "heat-3": "bg-heat-3-tint text-heat-3",
    info: "bg-info-tint text-info",
    ok: "bg-ok-tint text-ok",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius-md)] px-4 py-3", cls)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-text/85">{children}</p>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="mt-1 text-[14px] text-text">{children}</dd>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-text">{children}</h3>
      {aside && <span className="text-[12.5px] text-muted">{aside}</span>}
    </div>
  );
}

/* ---------- reminders & escalation ladder ---------- */
function ReminderPanel({ task }: { task: Task }) {
  const settings = useApp((s) => s.settings);
  const heat = heatOf(task);
  const rule = task.reminder;
  const active = ["assigned", "acknowledged"].includes(task.status);
  const snoozed = task.snoozedUntil && new Date(task.snoozedUntil) > new Date();
  const steps = [
    { level: 0, who: "Assignee only", when: "Normal" },
    { level: 1, who: "Assignee, more prominent", when: `${settings.escalation.l1Ignored} ignored` },
    { level: 2, who: "+ Team lead", when: `${settings.escalation.l2Ignored} ignored or 2h left` },
    { level: 3, who: "+ Department head", when: `${settings.escalation.l3Ignored} ignored or overdue` },
    { level: 4, who: "Owner, flagged", when: `${settings.escalation.l4HoursPastDue}h overdue, no reply` },
  ];
  return (
    <section className="rounded-[var(--radius-lg)] border border-line">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 flex size-8 items-center justify-center rounded-full", active && !snoozed ? "bg-ink-tint text-ink" : "bg-sunken text-faint")}>
            {active && !snoozed ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
          </span>
          <div>
            <p className="text-[14px] font-medium text-text">
              {snoozed
                ? `Snoozed until ${format(new Date(task.snoozedUntil!), "h:mm a")}`
                : task.status === "assigned"
                  ? `Reminding every ${rule.intervalMin} min until acknowledged`
                  : task.status === "acknowledged"
                    ? `Seen. Gentle reminder every ${rule.intervalMin * 2} min until started`
                    : task.status === "in_progress"
                      ? "Reminders only near the deadline"
                      : task.status === "submitted"
                        ? "Reviewer is being reminded now"
                        : task.status === "blocked"
                          ? "Reminders paused while blocked"
                          : "No reminders"}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {rule.window === "working" ? "Working hours only" : "Any time"}, up to {rule.dailyCap} a day, by {rule.channels.map((c) => ({ push: "phone & PC", inapp: "in-app", email: "email", whatsapp: "WhatsApp" })[c]).join(", ")}
            </p>
          </div>
        </div>
        <div className="flex gap-5 pl-11 text-[12.5px] sm:pl-0">
          <Stat n={task.remindersSent} label="sent" />
          <Stat n={task.status === "assigned" ? task.remindersIgnored : 0} label="unanswered" warn={task.status === "assigned" && task.remindersIgnored >= settings.escalation.l1Ignored} />
          <Stat n={task.snoozesToday} label="snoozes" />
        </div>
      </div>
      <ol className="grid grid-cols-5">
        {steps.map((s) => {
          const reached = heat >= s.level;
          const current = heat === s.level;
          return (
            <li key={s.level} className={cn("relative border-r border-line px-2.5 py-2.5 last:border-r-0 sm:px-3", current && s.level > 0 && HEAT[s.level as 1].tint)}>
              <span className={cn("absolute inset-x-0 top-0 h-[3px]", reached && s.level > 0 ? HEAT[s.level as 1].bar : reached ? "bg-ink/30" : "bg-transparent")} />
              <p className={cn("text-[12px] font-semibold", current ? (s.level ? HEAT[s.level as 1].text : "text-ink") : "text-faint")}>L{s.level}</p>
              <p className="mt-0.5 hidden text-[11.5px] leading-snug text-muted sm:block">{s.who}</p>
              <p className="mt-0.5 hidden text-[11px] leading-snug text-faint lg:block">{s.when}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className={cn("tabular font-display text-[18px] font-semibold leading-none", warn ? "text-heat-2" : "text-text")}>{n}</span>
      <span className="mt-1 text-faint">{label}</span>
    </span>
  );
}

/* ---------- checklist ---------- */
function Checklist({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const toggle = useApp((s) => s.toggleSubtask);
  const add = useApp((s) => s.addSubtask);
  const [draft, setDraft] = React.useState("");
  const done = task.subtasks.filter((s) => s.done).length;
  if (!task.subtasks.length && !canEdit) return null;
  return (
    <section>
      <SectionTitle aside={task.subtasks.length ? `${done} of ${task.subtasks.length}` : undefined}>Checklist</SectionTitle>
      {task.subtasks.length > 0 && <Bar value={done} max={task.subtasks.length} tone="ok" className="mb-2" />}
      <ul>
        {task.subtasks.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-1 py-2 hover:bg-sunken">
              <Checkbox checked={s.done} disabled={!canEdit} onCheckedChange={() => toggle(task.id, s.id)} />
              <span className={cn("text-[14px]", s.done && "text-muted line-through decoration-line-strong")}>{s.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && !["approved", "cancelled"].includes(task.status) && (
        <form
          className="mt-1 flex items-center gap-2 px-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            add(task.id, draft.trim());
            setDraft("");
          }}
        >
          <Plus className="size-4 text-faint" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a step" className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
        </form>
      )}
    </section>
  );
}

/* ---------- dependencies ---------- */
function WaitsFor({ task }: { task: Task }) {
  const all = useApp((s) => s.tasks);
  const openTask = useApp((s) => s.openTask);
  const deps = (task.dependsOn ?? []).map((id) => all.find((t) => t.id === id));
  const open = deps.filter((d) => !d || !["approved", "cancelled"].includes(d.status));
  if (!task.dependsOn?.length || ["approved", "cancelled"].includes(task.status)) return null;
  return (
    <Banner tone={open.length ? "info" : "ok"} icon={Clock4} title={open.length ? "Waits for other work first" : "Ready: everything it waited for is done"}>
      <ul className="mt-1 space-y-1">
        {deps.map((d, i) =>
          d ? (
            <li key={d.id}>
              <button type="button" onClick={() => openTask(d.id)} className="text-left underline-offset-2 hover:underline">
                {d.title}
              </button>{" "}
              <span className="opacity-75">({["approved", "cancelled"].includes(d.status) ? "done" : d.status.replace("_", " ")})</span>
            </li>
          ) : (
            <li key={i}>A task outside your view</li>
          ),
        )}
      </ul>
    </Banner>
  );
}

/* ---------- files & proof ---------- */
function Files({ task }: { task: Task }) {
  const r = useTaskRole(task);
  const [busy, setBusy] = React.useState(false);
  const canAdd = (r.isAssignee || r.isReviewer || r.canManage) && !["approved", "cancelled"].includes(task.status);
  if (!task.attachments.length && !canAdd) return null;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      const res = await uploadToTask(task.id, f, { proof: r.isAssignee && task.requiresProof && f.type.startsWith("image/") });
      if (!res.ok) toast.error(`${f.name}: ${res.error}`);
      else toast.success("Added", { description: `${f.name}. The time it was added is recorded.` });
    }
    setBusy(false);
  };

  return (
    <section>
      <SectionTitle aside={task.requiresProof ? "Proof required to submit" : undefined}>Files and proof</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {task.attachments.map((a) => {
          const body = (
            <>
              <AttachmentThumb a={a} />
              <div className="px-2.5 py-2">
                <p className="truncate text-[12.5px] font-medium">{a.name}</p>
                <p className="text-[11.5px] text-faint">
                  {a.isProof ? "Proof, " : ""}
                  {format(new Date(a.at), "d MMM, h:mm a")}
                </p>
              </div>
            </>
          );
          return a.url ? (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[var(--radius-md)] border border-line hover:border-line-strong">
              {body}
            </a>
          ) : (
            <div key={a.id} className="overflow-hidden rounded-[var(--radius-md)] border border-line">
              {body}
            </div>
          );
        })}
        {canAdd && (
          <label
            className={cn(
              "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-line-strong text-[12.5px] text-muted hover:border-ink/40 hover:text-text",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {busy ? "Uploading..." : "Add photo or file"}
            <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={onPick} disabled={busy} />
          </label>
        )}
      </div>
    </section>
  );
}

/* ---------- comments ---------- */
function Comments({ task }: { task: Task }) {
  const add = useApp((s) => s.addComment);
  const people = useApp((s) => s.people);
  const meId = useMeId();
  const [text, setText] = React.useState("");
  const [recording, setRecording] = React.useState<number | null>(null);
  const [sending, setSending] = React.useState(false);
  const recorder = React.useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);

  const startVoice = async () => {
    try {
      recorder.current = await startRecording();
      setRecording(0);
    } catch {
      toast.error("Pulse can't use the microphone", { description: "Allow microphone access for this site, then try again." });
    }
  };
  const discardVoice = () => {
    recorder.current?.cancel();
    recorder.current = null;
    setRecording(null);
  };
  const sendVoice = async () => {
    const rec = recorder.current;
    const secs = Math.max(1, recording ?? 1);
    recorder.current = null;
    setRecording(null);
    if (!rec) return;
    setSending(true);
    const blob = await rec.stop();
    const r = await uploadVoiceNote(task.id, blob, secs);
    setSending(false);
    if (!r.ok) toast.error(r.error);
  };

  React.useEffect(() => {
    if (recording === null) return;
    const t = setInterval(() => setRecording((r) => (r === null ? null : r + 1)), 1000);
    return () => clearInterval(t);
  }, [recording]);

  return (
    <div>
      {task.comments.length === 0 && <p className="py-2 text-[13.5px] text-muted">No comments yet. Use @name to bring someone in.</p>}
      <ul className="space-y-4">
        {task.comments.map((c) => {
          const p = people.find((x) => x.id === c.authorId);
          return (
            <li key={c.id} className="flex gap-3">
              <Avatar person={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  <span className="font-semibold">{p?.name}</span> <span className="text-faint">{formatWhen(c.at)}</span>
                </p>
                {c.kind === "voice" && c.body.startsWith("/api/files/") ? (
                  <audio controls preload="none" src={c.body} className="mt-1.5 h-10 w-full max-w-xs" aria-label={`Voice note, ${c.durationSec ?? 0} seconds`} />
                ) : c.kind === "voice" ? (
                  <div className="mt-1.5 inline-flex items-center gap-3 rounded-full bg-ink-tint px-3 py-1.5">
                    <Play className="size-3.5 fill-ink text-ink" />
                    <span className="flex h-4 items-center gap-[2px]">
                      {Array.from({ length: 22 }).map((_, i) => (
                        <span key={i} className="w-[2px] rounded-full bg-ink/60" style={{ height: `${4 + ((i * 7) % 11)}px` }} />
                      ))}
                    </span>
                    <span className="tabular text-[12px] text-ink">0:{String(c.durationSec ?? 0).padStart(2, "0")}</span>
                  </div>
                ) : (
                  <p className="mt-0.5 text-[14px] leading-relaxed text-text">{c.body}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!["cancelled"].includes(task.status) && (
        <div className="mt-4 flex items-end gap-2">
          <Avatar id={meId} size="md" className="mb-1 hidden sm:inline-flex" />
          {recording !== null ? (
            <div className="flex h-11 flex-1 items-center gap-3 rounded-[var(--radius-md)] border border-heat-3/40 bg-heat-3-tint px-3">
              <span className="size-2.5 animate-pulse rounded-full bg-heat-3" />
              <span className="tabular text-[14px] text-heat-3">
                Recording {Math.floor(recording / 60)}:{String(recording % 60).padStart(2, "0")}
              </span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={discardVoice}>Discard</Button>
              <Button size="sm" variant="primary" onClick={() => void sendVoice()}>
                <Square className="fill-current" /> Send
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a comment"
                className="min-h-11 flex-1 resize-none py-2.5"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                    e.preventDefault();
                    add(task.id, text.trim());
                    setText("");
                  }
                }}
              />
              <Button size="icon" variant="secondary" className="h-11 w-11" aria-label="Record a voice note" disabled={sending} onClick={() => void startVoice()}>
                {sending ? <Loader2 className="animate-spin" /> : <Mic />}
              </Button>
              <Button
                size="icon"
                variant="primary"
                className="h-11 w-11"
                aria-label="Send comment"
                disabled={!text.trim()}
                onClick={() => {
                  add(task.id, text.trim());
                  setText("");
                }}
              >
                <Send />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- history (append-only) ---------- */
export const ACTIVITY_ICON: Record<ActivityKind, { icon: React.ElementType; cls: string }> = {
  created: { icon: Plus, cls: "text-muted" },
  assigned: { icon: ArrowUpRight, cls: "text-ink" },
  reassigned: { icon: UserRoundCog, cls: "text-ink" },
  acknowledged: { icon: Eye, cls: "text-info" },
  started: { icon: CircleDot, cls: "text-ink" },
  reminder_sent: { icon: BellRing, cls: "text-faint" },
  reminder_seen: { icon: Eye, cls: "text-faint" },
  reminder_failed: { icon: BellOff, cls: "text-heat-2" },
  snoozed: { icon: Clock4, cls: "text-muted" },
  blocked: { icon: AlertOctagon, cls: "text-heat-2" },
  unblocked: { icon: CheckCircle2, cls: "text-ok" },
  submitted: { icon: Send, cls: "text-review" },
  approved: { icon: CheckCircle2, cls: "text-ok" },
  rejected: { icon: Undo2, cls: "text-heat-2" },
  cancelled: { icon: XCircle, cls: "text-faint" },
  escalated: { icon: ArrowUpRight, cls: "text-heat-3" },
  deescalated: { icon: ArrowDownRight, cls: "text-ok" },
  commented: { icon: MessageSquare, cls: "text-muted" },
  deadline_changed: { icon: CalendarClock, cls: "text-heat-1" },
  deadline_requested: { icon: CalendarClock, cls: "text-muted" },
  reminders_paused: { icon: PauseCircle, cls: "text-faint" },
  check_in: { icon: LogIn, cls: "text-ok" },
  check_out: { icon: LogOut, cls: "text-muted" },
  announcement: { icon: Megaphone, cls: "text-ink" },
  question: { icon: MessageCircleQuestion, cls: "text-info" },
  answered: { icon: MessageCircleQuestion, cls: "text-ok" },
  subtask_done: { icon: CheckCircle2, cls: "text-ok" },
  timer: { icon: Timer, cls: "text-muted" },
};

export function ActivityLine({ a, showTask }: { a: Activity; showTask?: boolean }) {
  const actor = useApp((s) => s.people.find((p) => p.id === a.actorId));
  const task = useApp((s) => (showTask && a.taskId ? s.tasks.find((t) => t.id === a.taskId) : undefined));
  const openTask = useApp((s) => s.openTask);
  const I = ACTIVITY_ICON[a.kind] ?? ACTIVITY_ICON.created;
  const Icon = I.icon;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute bottom-0 left-[13px] top-7 w-px bg-line last:hidden" aria-hidden />
      <span className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
        <Icon className={cn("size-3.5", I.cls)} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13.5px] leading-snug text-text">
          <span className="font-medium">{a.actorId === "system" ? "Pulse" : actor?.name ?? "Someone"}</span>{" "}
          <span className="text-text/85">{a.text}</span>
        </p>
        <p className="mt-0.5 text-[12px] text-faint">
          {formatWhen(a.at, { withDay: true })}
          {task && (
            <>
              {" in "}
              <button className="text-muted underline-offset-2 hover:text-text hover:underline" onClick={() => openTask(task.id)}>
                {task.title}
              </button>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

function History({ taskId }: { taskId: string }) {
  const all = useApp((s) => s.activity);
  const items = React.useMemo(() => all.filter((a) => a.taskId === taskId), [all, taskId]);
  return (
    <div>
      <p className="mb-3 flex items-center gap-1.5 text-[12.5px] text-muted">
        <Hand className="size-3.5" /> This history can't be edited or deleted by anyone, including the owner.
      </p>
      <ol>
        {items.map((a) => (
          <ActivityLine key={a.id} a={a} />
        ))}
      </ol>
    </div>
  );
}

export { Input };
