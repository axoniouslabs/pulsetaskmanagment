"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { FileEdit } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Person, Role, Task, TaskStatus } from "@/lib/types";
import { STATUS_LABEL, heatOf } from "@/lib/selectors";
import { cn, plural } from "@/lib/utils";
import { Avatar } from "@/components/app/avatar";
import { Due, HeatEdge, PriorityTag, StatusIcon } from "@/components/app/task-bits";
import { TaskDialogs, type DialogKind } from "@/components/app/task-actions";
import { LIFECYCLE } from "./filters";

/* ------------------------------------------------------------------ */
/* which drops are allowed, and what they do                          */
/* ------------------------------------------------------------------ */

type Plan =
  | { type: "none" }
  | { type: "run"; run: () => void }
  | { type: "dialog"; kind: Exclude<DialogKind, null> }
  | { type: "deny"; title: string; body?: string };

interface MoveContext {
  role: Role;
  meId: string;
  scopeIds: Set<string>;
  people: Person[];
}

const first = (people: Person[], id?: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";

export function planMove(t: Task, to: TaskStatus, ctx: MoveContext): Plan {
  const from = t.status;
  if (from === to) return { type: "none" };
  const a = useApp.getState();
  const isAssignee = t.assigneeId === ctx.meId;
  const canManage = ctx.role === "owner" || (ctx.role === "manager" && (ctx.scopeIds.has(t.assigneeId) || t.reviewerId === ctx.meId));
  const isReviewer = t.reviewerId === ctx.meId || (ctx.role !== "employee" && canManage);
  const who = first(ctx.people, t.assigneeId);
  const reviewer = first(ctx.people, t.reviewerId);
  const closed = from === "approved" || from === "cancelled";

  if (closed) return { type: "deny", title: "Finished tasks stay finished", body: "Create a new task if more work is needed." };

  switch (to) {
    case "assigned":
      return { type: "deny", title: "Tasks can't go back to Not seen yet", body: "To give it to someone else, open the task and choose Hand over." };

    case "acknowledged":
      if (from !== "assigned") return { type: "deny", title: "Work can't move back to Seen", body: `${who} has already moved past that step.` };
      if (!isAssignee) return { type: "deny", title: `Only ${who} can acknowledge their own task`, body: "Pulse keeps reminding them until they do." };
      return {
        type: "run",
        run: () => {
          a.acknowledge(t.id);
          toast.success("Acknowledged", { description: "Reminders slowed down. Start when you're ready." });
        },
      };

    case "in_progress":
      if (from === "assigned" || from === "acknowledged") {
        if (!isAssignee) return { type: "deny", title: `Only ${who} can start this task`, body: "The timer runs on their device, so starting is up to them." };
        return {
          type: "run",
          run: () => {
            a.start(t.id);
            toast.success("Started", { description: "Timer is running." });
          },
        };
      }
      if (from === "blocked") {
        if (isAssignee || canManage || t.blockedOwnerId === ctx.meId) return { type: "dialog", kind: "unblock" };
        return { type: "deny", title: `Only ${first(ctx.people, t.blockedOwnerId)} or a manager can clear this blocker` };
      }
      if (from === "submitted") {
        if (isReviewer) return { type: "dialog", kind: "reject" };
        return { type: "deny", title: `${reviewer} reviews this task`, body: "Only the reviewer can send work back." };
      }
      return { type: "none" };

    case "blocked":
      if (from === "submitted") return { type: "deny", title: "Work waiting for review can't be blocked", body: "Approve it or send it back with a reason." };
      if (!isAssignee) return { type: "deny", title: `Only ${who} can mark this task as blocked`, body: "Ask them what's in the way, or open the task to hand it over." };
      return { type: "dialog", kind: "block" };

    case "submitted":
      if (from === "blocked") return { type: "deny", title: "Clear the blocker first", body: "Blocked work can be submitted once it moves again." };
      if (from !== "in_progress") return { type: "deny", title: "Start the task before submitting it", body: isAssignee ? "Drag it to In progress first." : `${who} needs to start it first.` };
      if (!isAssignee) return { type: "deny", title: `Only ${who} can submit this task`, body: "Submitting attaches their note and proof." };
      return { type: "dialog", kind: "submit" };

    case "approved":
      if (from === "submitted") {
        if (!isReviewer) return { type: "deny", title: `${reviewer} reviews this task`, body: "Only the reviewer or a manager can approve it." };
        return {
          type: "run",
          run: () => {
            a.approve(t.id);
            toast.success("Approved", { description: `${who} has been told. The task is closed.` });
          },
        };
      }
      if (from === "in_progress" && isAssignee) {
        if (!t.requiresApproval) return { type: "dialog", kind: "submit" };
        return { type: "deny", title: "Submit it for review first", body: `${reviewer} approves it, then it moves to Done.` };
      }
      return { type: "deny", title: "Only approved work moves to Done", body: "Tasks reach Done after they are submitted and reviewed." };

    default:
      return { type: "none" };
  }
}

/* ------------------------------------------------------------------ */
/* board                                                               */
/* ------------------------------------------------------------------ */

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

export function BoardView({
  tasks,
  role,
  meId,
  scopeIds,
  people,
  showDone,
  onShowDone,
  draftCount,
  onShowDrafts,
}: {
  tasks: Task[];
  role: Role;
  meId: string;
  scopeIds: Set<string>;
  people: Person[];
  showDone: boolean;
  onShowDone: () => void;
  draftCount: number;
  onShowDrafts: () => void;
}) {
  const sensors = useSensors(
    // mouse + touch (not pointer) so a swipe on a phone scrolls the columns instead of dragging a card
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{ taskId: string; kind: Exclude<DialogKind, null> } | null>(null);
  const allTasks = useApp((s) => s.tasks);
  const ctx = React.useMemo<MoveContext>(() => ({ role, meId, scopeIds, people }), [role, meId, scopeIds, people]);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;
  const pendingTask = pending ? allTasks.find((t) => t.id === pending.taskId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const t = tasks.find((x) => x.id === String(e.active.id));
    if (!t || !e.over) return;
    const plan = planMove(t, e.over.id as TaskStatus, ctx);
    if (plan.type === "run") plan.run();
    else if (plan.type === "dialog") setPending({ taskId: t.id, kind: plan.kind });
    else if (plan.type === "deny") toast.error(plan.title, plan.body ? { description: plan.body } : undefined);
  };

  return (
    <div>
      {draftCount > 0 && (
        <p className="mb-3 flex items-center gap-2 text-[13px] text-muted">
          <FileEdit className="size-4 text-faint" />
          {plural(draftCount, "draft")} {draftCount === 1 ? "isn't" : "aren't"} on the board.
          <button type="button" onClick={onShowDrafts} className="font-medium text-ink underline-offset-4 hover:underline">
            Show in list
          </button>
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div
          className={cn(
            "thin-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0",
            !activeId && "snap-x snap-mandatory scroll-px-4 sm:snap-none",
          )}
        >
          {LIFECYCLE.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            const plan = active ? planMove(active, status, ctx) : null;
            const state: ColumnState = !plan ? "idle" : plan.type === "run" || plan.type === "dialog" ? "valid" : plan.type === "none" ? "home" : "invalid";
            return (
              <Column key={status} status={status} count={items.length} state={state}>
                {status === "approved" && !showDone ? (
                  <div className="px-2 py-6 text-center">
                    <p className="text-[13px] leading-snug text-muted">{active && state === "valid" ? "Drop here to approve" : "Finished work is hidden."}</p>
                    {!active && (
                      <button type="button" onClick={onShowDone} className="mt-1.5 text-[13px] font-medium text-ink underline-offset-4 hover:underline">
                        Show done
                      </button>
                    )}
                  </div>
                ) : items.length ? (
                  items.map((t) => <DraggableCard key={t.id} task={t} showAssignee={role !== "employee" || t.assigneeId !== meId} />)
                ) : (
                  <p className="px-2 py-6 text-center text-[13px] text-faint">{active && state === "valid" ? "Drop here" : "Nothing here"}</p>
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
          {active ? <CardBody task={active} showAssignee={role !== "employee"} lifted /> : null}
        </DragOverlay>
      </DndContext>
      <p className="mt-2 hidden text-[12.5px] text-faint sm:block">
        Drag a card to move it. Pulse only allows moves the person is allowed to make, and logs each one.
      </p>
      <p className="mt-1 text-[12.5px] text-faint sm:hidden">Press and hold a card to move it. Swipe to see more columns.</p>
      {pending && pendingTask && <TaskDialogs task={pendingTask} kind={pending.kind} onClose={() => setPending(null)} />}
    </div>
  );
}

type ColumnState = "idle" | "valid" | "invalid" | "home";

function Column({ status, count, state, children }: { status: TaskStatus; count: number; state: ColumnState; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={`${STATUS_LABEL[status]}, ${plural(count, "task")}`}
      className={cn(
        "flex w-[84%] max-w-[320px] shrink-0 snap-start flex-col sm:w-[264px] xl:w-auto xl:min-w-[168px] xl:max-w-none xl:flex-1",
        state === "invalid" && "opacity-45",
      )}
    >
      <header className="mb-2 flex items-center gap-2 px-1">
        <StatusIcon status={status} className="size-4" />
        <h2 className="truncate text-[13.5px] font-semibold text-text">{STATUS_LABEL[status]}</h2>
        <span className="tabular text-[13px] text-muted">{count}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-40 flex-1 flex-col gap-2 rounded-[var(--radius-lg)] border border-transparent bg-sunken/70 p-2 transition-colors",
          state === "valid" && "border-dashed border-ink/35 bg-ink-tint/50",
          state === "valid" && isOver && "border-solid border-ink bg-ink-tint",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function DraggableCard({ task, showAssignee }: { task: Task; showAssignee: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const openTask = useApp((s) => s.openTask);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable task"
      aria-label={`${task.title}. Press Enter to open, Space to pick up.`}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          openTask(task.id);
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={cn("touch-manipulation rounded-[var(--radius-md)] outline-none focus-visible:ring-2 focus-visible:ring-ink", isDragging && "opacity-40")}
    >
      <CardBody task={task} showAssignee={showAssignee} />
    </div>
  );
}

function CardBody({ task, showAssignee, lifted }: { task: Task; showAssignee: boolean; lifted?: boolean }) {
  const assignee = useApp((s) => s.people.find((p) => p.id === task.assigneeId));
  const heat = heatOf(task);
  const done = task.status === "approved" || task.status === "cancelled";
  return (
    <div
      className={cn(
        "relative cursor-grab overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface py-2.5 pl-3.5 pr-3 transition-colors hover:border-line-strong active:cursor-grabbing",
        lifted && "rotate-[1.5deg] cursor-grabbing border-line-strong shadow-pop",
      )}
    >
      <HeatEdge level={heat} />
      <p className={cn("line-clamp-2 text-[13.5px] font-medium leading-snug text-text", done && "text-muted line-through decoration-line-strong")}>{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {showAssignee && assignee && <Avatar person={assignee} size="xs" tip />}
        <Due task={task} className="text-[12px]" />
        <PriorityTag priority={task.priority} hideNormal />
      </div>
    </div>
  );
}
