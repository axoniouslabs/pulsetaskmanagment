"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlarmClockOff,
  AlertOctagon,
  Camera,
  Check,
  CircleCheckBig,
  Clock4,
  Hand,
  MessageCircleQuestion,
  MoreHorizontal,
  Pause,
  Play,
  Send,
  Undo2,
  UserRoundCog,
  XCircle,
  CalendarClock,
  Unlock,
  ImagePlus,
  Loader2,
  Pencil,
} from "lucide-react";
import { format, addHours } from "date-fns";
import { useShallow } from "zustand/react/shallow";
import { useApp, useMeId } from "@/lib/store";
import type { Task } from "@/lib/types";
import { scopePeople } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { uploadToTask, ACCEPT } from "@/lib/upload";
import { Dialog, DialogContent, Field, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Select, Textarea } from "@/components/ui/primitives";
import { Avatar } from "./avatar";
import { EditTaskForm } from "./edit-task";

export type DialogKind = "edit" | "block" | "submit" | "reject" | "reassign" | "deadline" | "request" | "cancel" | "ask" | "unblock" | "approve" | null;

const toLocalInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

export function useTaskRole(task: Task) {
  const meId = useMeId();
  const role = useApp((s) => s.role);
  const canManage = useApp((s) => {
    if (s.role === "owner") return true;
    if (s.role === "employee") return false;
    return scopePeople(s, s.role, meId).some((p) => p.id === task.assigneeId) || task.reviewerId === meId;
  });
  const isAssignee = task.assigneeId === meId;
  return {
    meId,
    role,
    isAssignee,
    // the owner may review anything; everyone else never reviews their own work
    isReviewer: role === "owner" || (!isAssignee && (task.reviewerId === meId || canManage)),
    canManage,
    isBlockerOwner: task.blockedOwnerId === meId,
  };
}

export function TaskActions({ task, size = "md", compact, className }: { task: Task; size?: "sm" | "md" | "lg"; compact?: boolean; className?: string }) {
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const r = useTaskRole(task);
  const a = useApp.getState();
  const timer = useApp((s) => s.timers[task.assigneeId]);
  const timing = timer?.taskId === task.id;
  const people = useApp((s) => s.people);
  const blockerName = people.find((p) => p.id === task.blockedOwnerId)?.name.split(" ")[0];

  const snoozeMenu = (
    <Menu>
      <MenuTrigger asChild>
        <Button size={size} variant="secondary" aria-label={compact ? "Snooze reminders" : undefined} title={compact ? "Snooze reminders" : undefined}>
          <AlarmClockOff />
          {!compact && "Snooze"}
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>Pause reminders for</MenuLabel>
        {[15, 30, 60].map((m) => (
          <MenuItem
            key={m}
            onSelect={() => {
              const res = a.snooze(task.id, m);
              if (res.ok)
                toast(`Snoozed for ${m} minutes`, {
                  description: "Reminders resume after that.",
                });
            }}
          >
            <Clock4 /> {m} minutes
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );

  const moreMenu = (items: React.ReactNode) => (
    <Menu>
      <MenuTrigger asChild>
        <Button size={size === "lg" ? "icon" : "iconSm"} variant="ghost" aria-label="More actions" className={compact ? "max-sm:hidden" : undefined}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>{items}</MenuContent>
    </Menu>
  );

  const managerItems = (
    <>
      {!["approved", "cancelled"].includes(task.status) && (
        <MenuItem onSelect={() => setDialog("edit")}>
          <Pencil /> Edit details
        </MenuItem>
      )}
      <MenuItem onSelect={() => setDialog("reassign")}>
        <UserRoundCog /> Hand over to someone else
      </MenuItem>
      <MenuItem onSelect={() => setDialog("deadline")}>
        <CalendarClock /> Change deadline
      </MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => setDialog("cancel")} className="text-heat-3 [&_svg]:text-heat-3">
        <XCircle /> Cancel task
      </MenuItem>
    </>
  );

  const assigneeItems = (
    <>
      <MenuItem onSelect={() => setDialog("ask")}>
        <MessageCircleQuestion /> Ask a question
      </MenuItem>
      <MenuItem onSelect={() => setDialog("request")}>
        <CalendarClock /> Ask for more time
      </MenuItem>
    </>
  );

  let buttons: React.ReactNode = null;
  const open = ["assigned", "acknowledged", "in_progress", "blocked"].includes(task.status);

  if (task.status === "draft" && r.canManage) {
    buttons = (
      <Button
        size={size}
        variant="primary"
        onClick={() => {
          if (a.publishDraft(task.id).ok)
            toast.success("Published", {
              description: "The assignee has been notified.",
            });
        }}
      >
        <Send /> Publish
      </Button>
    );
  } else if (task.groupClaim && !task.groupClaim.claimed && task.status === "assigned" && r.role !== "owner") {
    buttons = (
      <Button
        size={size}
        variant="primary"
        onClick={() => {
          if (a.claimTask(task.id).ok)
            toast.success("Claimed", {
              description: "It's yours now. Reminders go to you only.",
            });
        }}
      >
        <Hand /> Claim
      </Button>
    );
  } else if (r.isAssignee && open) {
    if (task.status === "assigned")
      buttons = (
        <>
          <Button
            size={size}
            variant="primary"
            onClick={() => {
              if (a.acknowledge(task.id).ok)
                toast.success("Acknowledged", {
                  description: "Reminders slowed down. Start when you're ready.",
                });
            }}
          >
            <Check /> Acknowledge
          </Button>
          <Button
            size={size}
            onClick={() => {
              if (a.start(task.id).ok) toast.success("Started", { description: "Timer is running." });
            }}
          >
            <Play /> Start
          </Button>
          {snoozeMenu}
          {moreMenu(
            <>
              <MenuItem onSelect={() => setDialog("block")}>
                <AlertOctagon /> I'm blocked
              </MenuItem>
              {assigneeItems}
            </>,
          )}
        </>
      );
    else if (task.status === "acknowledged")
      buttons = (
        <>
          <Button
            size={size}
            variant="primary"
            onClick={() => {
              if (a.start(task.id).ok) toast.success("Started", { description: "Timer is running." });
            }}
          >
            <Play /> Start
          </Button>
          <Button size={size} onClick={() => setDialog("block")}>
            <AlertOctagon /> {compact ? "Blocked" : "I'm blocked"}
          </Button>
          {moreMenu(assigneeItems)}
        </>
      );
    else if (task.status === "in_progress")
      buttons = (
        <>
          <Button size={size} variant="ok" onClick={() => setDialog("submit")}>
            <CircleCheckBig /> {task.requiresApproval ? "Submit for review" : "Mark done"}
          </Button>
          {timing ? (
            <Button
              size={size}
              onClick={() => {
                if (a.stopTimer().ok) toast("Timer paused");
              }}
            >
              <Pause /> Pause
            </Button>
          ) : (
            <Button
              size={size}
              onClick={() => {
                if (a.start(task.id).ok) toast("Timer running");
              }}
            >
              <Play /> Resume
            </Button>
          )}
          {moreMenu(
            <>
              <MenuItem onSelect={() => setDialog("block")}>
                <AlertOctagon /> I'm blocked
              </MenuItem>
              {assigneeItems}
            </>,
          )}
        </>
      );
    else if (task.status === "blocked")
      buttons = (
        <>
          <Button size={size} onClick={() => setDialog("unblock")}>
            <Unlock /> I can continue
          </Button>
          {moreMenu(assigneeItems)}
        </>
      );
  } else if (task.status === "submitted" && r.isReviewer) {
    buttons = (
      <>
        <Button size={size} variant="ok" onClick={() => setDialog("approve")}>
          <Check /> Approve
        </Button>
        <Button size={size} variant="danger" onClick={() => setDialog("reject")}>
          <Undo2 /> Send back
        </Button>
        {r.canManage &&
          moreMenu(
            <MenuItem onSelect={() => setDialog("reassign")}>
              <UserRoundCog /> Hand over to someone else
            </MenuItem>,
          )}
      </>
    );
  } else if (task.status === "blocked" && (r.canManage || r.isBlockerOwner)) {
    buttons = (
      <>
        <Button size={size} variant="primary" onClick={() => setDialog("unblock")}>
          <Unlock /> Clear blocker
        </Button>
        {r.canManage && moreMenu(managerItems)}
      </>
    );
  } else if (open && r.canManage) {
    buttons = (
      <>
        <Button size={size} onClick={() => setDialog("reassign")}>
          <UserRoundCog /> {compact ? "Hand over" : "Hand over"}
        </Button>
        <Button size={size} onClick={() => setDialog("deadline")}>
          <CalendarClock /> {compact ? "Extend" : "Change deadline"}
        </Button>
        {moreMenu(managerItems)}
      </>
    );
  } else if (task.status === "submitted" && r.isAssignee) {
    buttons = <span className="text-[13px] text-muted">Waiting for {people.find((p) => p.id === task.reviewerId)?.name.split(" ")[0] ?? "the reviewer"} to review</span>;
  } else if (task.status === "blocked" && r.isAssignee) {
    buttons = <span className="text-[13px] text-muted">Waiting on {blockerName}</span>;
  }

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)} onClick={(e) => e.stopPropagation()}>
        {buttons}
      </div>
      <TaskDialogs task={task} kind={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ */

export function TaskDialogs({ task, kind, onClose }: { task: Task; kind: DialogKind; onClose: () => void }) {
  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      {kind && <DialogBody key={kind} task={task} kind={kind} onClose={onClose} />}
    </Dialog>
  );
}

function DialogBody({ task, kind, onClose }: { task: Task; kind: Exclude<DialogKind, null>; onClose: () => void }) {
  const a = useApp.getState();
  const everyone = useApp((s) => s.people);
  const meId = useMeId();
  const people = React.useMemo(() => everyone.filter((p) => p.active !== false), [everyone]);
  // hand-over targets: the owner may pick anyone; a manager only people in their scope
  const scopeIds = useApp(useShallow((s) => (s.role === "owner" ? null : scopePeople(s, s.role, meId).map((p) => p.id))));
  const handoverTargets = React.useMemo(() => people.filter((p) => !scopeIds || scopeIds.includes(p.id)), [people, scopeIds]);
  const askable = React.useMemo(() => people.filter((p) => p.id !== meId && p.role !== "employee"), [people, meId]);
  const [text, setText] = React.useState("");
  const [when, setWhen] = React.useState(() => toLocalInput(addHours(new Date(Math.max(Date.now(), new Date(task.dueAt).getTime())), 24).toISOString()));
  const [person, setPerson] = React.useState(() => {
    if (kind === "reassign") return "";
    if (kind === "ask") return askable.some((p) => p.id === task.reviewerId) ? task.reviewerId : (askable[0]?.id ?? "");
    const preferred = task.blockedOwnerId ?? task.reviewerId;
    return people.some((p) => p.id === preferred && p.id !== meId) ? preferred : (people.find((p) => p.id !== meId)?.id ?? "");
  });
  const [proof, setProof] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const pickProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    setError(null);
    const r = await uploadToTask(task.id, f, { proof: true });
    setUploading(false);
    if (r.ok) setProof(f.name);
    else setError(r.error);
  };
  const [error, setError] = React.useState<string | null>(null);

  const done = (msg: string, desc?: string) => {
    toast.success(msg, desc ? { description: desc } : undefined);
    onClose();
  };
  const assignee = people.find((p) => p.id === task.assigneeId);
  const reviewer = people.find((p) => p.id === task.reviewerId);
  const quick = (opts: string[]) => (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button key={o} type="button" onClick={() => setText(o)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12.5px] text-muted hover:border-ink/40 hover:text-text">
          {o}
        </button>
      ))}
    </div>
  );

  const footer = (
    label: string,
    onConfirm: () => void,
    opts: {
      variant?: "primary" | "ok" | "dangerSolid";
      disabled?: boolean;
    } = {},
  ) => (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onClose}>
        Keep as is
      </Button>
      <Button variant={opts.variant ?? "primary"} disabled={opts.disabled} onClick={onConfirm}>
        {label}
      </Button>
    </div>
  );

  const content = (() => {
    switch (kind) {
      case "block":
        return (
          <DialogContent title="What's stopping you?" description="Reminders pause and the person who can help is told straight away. This never counts against you.">
            {quick(["Waiting for a file from another department", "Need approval before I can continue", "Customer not answering", "Missing stock / material"])}
            <Field label="One line is enough">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Waiting for the new rates from Accounts" />
            </Field>
            <Field label="Who can unblock you?" className="mt-4">
              <Select value={person} onChange={(e) => setPerson(e.target.value)}>
                {people
                  .filter((p) => p.id !== meId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.title}
                    </option>
                  ))}
              </Select>
            </Field>
            {footer(
              "Mark as blocked",
              () => {
                if (a.block(task.id, text.trim(), person).ok) done("Marked as blocked", `${people.find((p) => p.id === person)?.name.split(" ")[0] ?? "Your manager"} has been told.`);
              },
              { disabled: !text.trim() || !person },
            )}
          </DialogContent>
        );
      case "unblock":
        return (
          <DialogContent title="Clear the blocker" description={`${assignee?.name.split(" ")[0]} can continue and reminders resume.`}>
            <Field label="What changed? (optional)">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Access given, check your email" />
            </Field>
            {footer("Clear blocker", () => {
              if (a.unblock(task.id, text.trim() || undefined).ok) done("Blocker cleared");
            })}
          </DialogContent>
        );
      case "submit":
        return (
          <DialogContent
            title={task.requiresApproval ? "Submit for review" : "Mark as done"}
            description={task.requiresApproval ? `${reviewer?.name.split(" ")[0]} will review it. Reminders for this task stop now.` : "This is a routine task, so it closes straight away."}
          >
            {task.requiresProof && (
              <div
                className={cn(
                  "mb-4 rounded-[var(--radius-md)] border border-dashed p-4",
                  proof || task.attachments.some((x) => x.isProof) ? "border-ok/40 bg-ok-tint" : "border-line-strong bg-sunken",
                )}
              >
                {proof || task.attachments.some((x) => x.isProof) ? (
                  <p className="flex items-center gap-2 text-[13.5px] font-medium text-ok">
                    <Check className="size-4" /> Proof attached
                    {proof ? `: ${proof}` : ""}
                  </p>
                ) : (
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[13.5px] text-text">This task needs a photo or file as proof.</p>
                    <div className="flex gap-2">
                      <label className={cn(buttonVariants({ variant: "primary", size: "sm" }), "cursor-pointer", uploading && "pointer-events-none opacity-60")}>
                        {uploading ? <Loader2 className="animate-spin" /> : <Camera />} Take photo
                        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickProof} disabled={uploading} />
                      </label>
                      <label className={cn(buttonVariants({ size: "sm" }), "cursor-pointer", uploading && "pointer-events-none opacity-60")}>
                        <ImagePlus /> Upload
                        <input type="file" accept={ACCEPT} className="sr-only" onChange={pickProof} disabled={uploading} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
            <Field
              label={task.requiresResult ? "Result report" : "Note for the reviewer (optional)"}
              hint={task.requiresResult ? "This task asks for a short report of the result when you submit." : undefined}
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={task.requiresResult ? "What was the result? Numbers, outcome, anything the reviewer should know." : "What did you do? Anything they should check?"}
              />
            </Field>
            {error && <p className="mt-3 text-[13px] text-heat-3">{error}</p>}
            {footer(
              task.requiresApproval ? "Submit for review" : "Mark done",
              () => {
                const res = a.dispatch({
                  type: "submit",
                  taskId: task.id,
                  note: text.trim(),
                });
                if (!res.ok) return setError(res.error);
                done(task.requiresApproval ? "Submitted for review" : "Marked done", task.requiresApproval ? `${reviewer?.name.split(" ")[0] ?? "The reviewer"} has been told.` : undefined);
              },
              {
                variant: "ok",
                disabled: uploading || (task.requiresResult && !text.trim()),
              },
            )}
          </DialogContent>
        );
      case "approve":
        return (
          <DialogContent title="Approve this work" description={`${assignee?.name.split(" ")[0]} is told right away and the task closes.`}>
            <Field label="Feedback for later (optional)" hint="Saved on the task and shows in their review history.">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Good, next time add the invoice number in the file name" />
            </Field>
            {footer(
              "Approve",
              () => {
                if (a.approve(task.id, text.trim() || undefined).ok) done("Approved", "The task is closed.");
              },
              { variant: "ok" },
            )}
          </DialogContent>
        );
      case "reject":
        return (
          <DialogContent title="Send back with a reason" description="The reason shows at the top of the task. Clear reasons get it fixed faster.">
            {quick(["Photo is not clear, please retake", "Missing some items, see checklist", "Wrong file attached"])}
            <Field label="What needs to change?">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            {task.rejections >= 1 && (
              <p className="mt-3 rounded-[var(--radius-sm)] bg-heat-1-tint px-3 py-2 text-[13px] text-text">
                This task has already been sent back {task.rejections} time
                {task.rejections > 1 ? "s" : ""}. If the instructions were unclear, consider adding detail to the task.
              </p>
            )}
            {footer(
              "Send back",
              () => {
                if (a.reject(task.id, text.trim()).ok) done("Sent back", `${assignee?.name.split(" ")[0]} has been told why.`);
              },
              { variant: "dangerSolid", disabled: !text.trim() },
            )}
          </DialogContent>
        );
      case "reassign":
        return (
          <DialogContent title="Hand over to someone else" description="The full history, comments and files go with the task. The current person stays as a watcher.">
            <Field label="New assignee">
              <div className="thin-scrollbar max-h-60 overflow-y-auto rounded-[var(--radius-md)] border border-line">
                {handoverTargets
                  .filter((p) => p.id !== task.assigneeId)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPerson(p.id)}
                      className={cn("flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-sunken", person === p.id && "bg-ink-tint")}
                    >
                      <Avatar person={p} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">{p.name}</span>
                        <span className="block text-[12.5px] text-muted">{p.onLeave ? "On leave today" : p.title}</span>
                      </span>
                      {person === p.id && <Check className="size-4 text-ink" />}
                    </button>
                  ))}
              </div>
            </Field>
            <Field label="Reason" className="mt-4" hint="Recorded on the task, so the history explains itself later.">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Kamran is on a field visit all day" />
            </Field>
            {footer(
              "Hand over",
              () => {
                if (a.reassign(task.id, person, text.trim()).ok) done("Handed over", `${people.find((p) => p.id === person)?.name.split(" ")[0] ?? "They"} has been told.`);
              },
              {
                disabled: !person || person === task.assigneeId || !text.trim(),
              },
            )}
          </DialogContent>
        );
      case "deadline":
      case "request":
        return (
          <DialogContent
            title={kind === "deadline" ? "Change the deadline" : "Ask for more time"}
            description={kind === "deadline" ? "The change and its reason are recorded on the task." : `${reviewer?.name.split(" ")[0]} gets an approve / decline request.`}
          >
            <p className="mb-3 text-[13px] text-muted">Currently due {format(new Date(task.dueAt), "EEE d MMM, h:mm a")}</p>
            <Field label="New deadline">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Reason" className="mt-4">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Why is more time needed?" />
            </Field>
            {error && <p className="mt-3 text-[13px] text-heat-3">{error}</p>}
            {footer(
              kind === "deadline" ? "Change deadline" : "Send request",
              () => {
                const picked = new Date(when);
                if (!when || Number.isNaN(picked.getTime())) return setError("Pick the new date and time first.");
                const iso = picked.toISOString();
                if (kind === "deadline") {
                  if (a.changeDeadline(task.id, iso, text.trim() || "No reason given").ok) done("Deadline changed");
                } else {
                  if (a.requestDeadline(task.id, iso, text.trim()).ok) done("Request sent", `${reviewer?.name.split(" ")[0]} will approve or decline.`);
                }
              },
              { disabled: kind === "request" && !text.trim() },
            )}
          </DialogContent>
        );
      case "edit":
        return <EditTaskForm task={task} onClose={onClose} />;
      case "cancel":
        return (
          <DialogContent title="Cancel this task?" description="It stays in the history and reports, marked as cancelled.">
            <Field label="Reason">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Customer cancelled the order" />
            </Field>
            {footer(
              "Cancel task",
              () => {
                if (a.cancel(task.id, text.trim()).ok) done("Task cancelled");
              },
              { variant: "dangerSolid", disabled: !text.trim() },
            )}
          </DialogContent>
        );
      case "ask":
        return (
          <DialogContent title="Ask a question" description="Your question goes straight to their phone and PC. You get a notification when they answer.">
            <Field label="Ask">
              <Select value={person} onChange={(e) => setPerson(e.target.value)}>
                {askable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Your question" className="mt-4">
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What's unclear?" />
            </Field>
            {footer(
              "Send question",
              () => {
                if (
                  a.askQuestion({
                    toId: person,
                    body: text.trim(),
                    taskId: task.id,
                  }).ok
                )
                  done("Question sent");
              },
              { disabled: !text.trim() || !person },
            )}
          </DialogContent>
        );
      default:
        return null;
    }
  })();

  return content;
}
