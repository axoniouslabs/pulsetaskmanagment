"use client";

import * as React from "react";
import Link from "next/link";
import { Count } from "@/components/app/count";
import { isToday, differenceInHours, format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, MessageCircleQuestion, ChevronRight, Plus, CalendarClock, Check } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import { attention, heatOf, isOpenWork } from "@/lib/selectors";
import type { Task } from "@/lib/types";
import { ago, cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { TaskList, TaskRow } from "@/components/app/task-row";
import { Avatar } from "@/components/app/avatar";
import { HEAT } from "@/components/app/task-bits";

export default function OverviewPage() {
  const now = useNow();
  const { role, me, meId, tasks, people, allPeople } = useScope();
  const state = useApp();
  const a = React.useMemo(() => attention(state, tasks, people, now), [state, tasks, people, now]);
  const total = a.overdue.length + a.unseen.length + a.blocked.length + a.slowReview.length + a.quiet.length;
  const open = tasks.filter(isOpenWork);
  const doneToday = tasks.filter((t) => t.status === "approved" && t.approvedAt && isToday(new Date(t.approvedAt)));
  const waitingMe = tasks.filter((t) => t.status === "submitted" && (role === "owner" || t.reviewerId === meId));
  const questions = state.questions.filter((q) => q.toId === meId && !q.answer);
  const extensions = state.deadlineRequests.filter((d) => d.status === "pending" && (role === "owner" || tasks.find((t) => t.id === d.taskId)?.reviewerId === meId));
  const name = (id: string) => allPeople.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const scopeLabel = role === "owner" ? "the company" : (state.departments.find((d) => d.headId === meId)?.name ?? "your team");
  // a company that has just been created: guide the owner through the first steps
  const starting = role === "owner" && (state.departments.length === 0 || state.people.length <= 1 || state.tasks.length === 0) && total === 0;

  const reasonFor = (t: Task, kind: "overdue" | "unseen" | "blocked" | "review") => {
    if (kind === "blocked")
      return (
        <>
          <span className="font-medium text-heat-2">Waiting on {name(t.blockedOwnerId!)}</span> for {ago(t.blockedAt).replace(" ago", "")}: {t.blockedReason}
        </>
      );
    if (kind === "review")
      return (
        <>
          Submitted {ago(t.submittedAt)}. <span className="font-medium text-heat-2">{name(t.reviewerId)} hasn't reviewed it.</span>
        </>
      );
    if (kind === "unseen")
      return (
        <>
          {plural(t.remindersSent, "reminder")} delivered, {t.remindersIgnored} not answered.{" "}
          {heatOf(t) >= 2 ? `${name(state.teams.find((x) => x.id === allPeople.find((p) => p.id === t.assigneeId)?.teamId)?.leadId ?? "")} has been told.` : "Still on the assignee only."}
        </>
      );
    const late = differenceInHours(now, new Date(t.dueAt));
    return (
      <>
        {late >= 1 ? `${late}h past the deadline. ` : "Just went past the deadline. "}
        {t.acknowledgedAt ? (
          t.startedAt ? (
            "Started but not submitted."
          ) : (
            "Seen but not started."
          )
        ) : (
          <span className="font-medium text-heat-3">Never opened, {t.remindersSent} reminders delivered.</span>
        )}
      </>
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {starting ? (
          <GettingStarted
            greeting={`${greet}, ${me.name.split(" ")[0]}. ${format(now, "EEEE d MMMM")}.`}
            hasDepartments={state.departments.length > 0}
            hasPeople={state.people.length > 1}
            hasTasks={state.tasks.length > 0}
            onAssign={() => state.openCreate()}
          />
        ) : (
          <>
            {/* the status line is the hero */}
            <p className="text-[14px] text-muted">
              {greet}, {me.name.split(" ")[0]}. {format(now, "EEEE d MMMM")}.
            </p>
            <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-text sm:text-[44px]">
              {total === 0 ? (
                "Everything is moving."
              ) : (
                <>
                  <Count value={total} /> {total === 1 ? "thing needs" : "things need"} you.
                </>
              )}
            </h1>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
              {total === 0
                ? `No overdue, ignored or blocked work in ${scopeLabel}. You can close the app.`
                : `The rest of ${scopeLabel} is on track: ${plural(open.length, "open task")}, ${doneToday.length} done today. Below is only what has stalled, most urgent first.`}
            </p>
          </>
        )}

        <div className="mt-8 space-y-8">
          {a.overdue.length > 0 && (
            <Block title="Overdue" count={a.overdue.length} tone={4}>
              {a.overdue.map((t) => (
                <TaskRow key={t.id} task={t} reason={reasonFor(t, "overdue")} showStatus={false} showActions />
              ))}
            </Block>
          )}
          {a.unseen.length > 0 && (
            <Block title="Assigned but never acknowledged" count={a.unseen.length} tone={2}>
              {a.unseen.map((t) => (
                <TaskRow key={t.id} task={t} reason={reasonFor(t, "unseen")} showStatus={false} showActions />
              ))}
            </Block>
          )}
          {a.blocked.length > 0 && (
            <Block title="Blocked, waiting on someone" count={a.blocked.length} tone={2} note="Blocked time counts against the blocker, not the assignee.">
              {a.blocked.map((t) => (
                <TaskRow key={t.id} task={t} reason={reasonFor(t, "blocked")} showStatus={false} showActions />
              ))}
            </Block>
          )}
          {a.slowReview.length > 0 && (
            <Block title={`Waiting on a reviewer for over ${state.settings.reviewSlaHours} hours`} count={a.slowReview.length} tone={1}>
              {a.slowReview.map((t) => (
                <TaskRow key={t.id} task={t} reason={reasonFor(t, "review")} showStatus={false} showActions />
              ))}
            </Block>
          )}
          {a.quiet.length > 0 && (
            <Block title="No activity today" count={a.quiet.length} tone={1} note="They have open tasks but haven't opened, started or commented on anything today.">
              {a.quiet.map((p) => {
                const theirs = tasks.filter((t) => t.assigneeId === p.id && isOpenWork(t));
                return (
                  <Link key={p.id} href={`/team?person=${p.id}`} className="relative flex items-center gap-3 border-b border-line px-4 py-3 pl-5 last:border-0 hover:bg-hover">
                    <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", HEAT[1].bar)} />
                    <Avatar person={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-medium">{p.name}</p>
                      <p className="text-[13px] text-muted">
                        {p.title}, {plural(theirs.length, "open task")}.
                        {p.workType === "field" ? (p.devices[0]?.lastSeen ? ` Field staff, last seen on phone ${ago(p.devices[0].lastSeen)}.` : " Field staff, phone not set up yet.") : ""}
                        {p.devices.some((d) => !d.healthy) && <span className="font-medium text-heat-2"> Phone isn't receiving notifications.</span>}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-faint" />
                  </Link>
                );
              })}
            </Block>
          )}

          {!starting && (
            <ClearList
              items={
                [
                  !a.overdue.length && "Nothing overdue",
                  !a.unseen.length && "Every task has been acknowledged",
                  !a.blocked.length && "Nobody is blocked",
                  !a.slowReview.length && "Reviews are on time",
                  !a.quiet.length && "Everyone has been active today",
                ].filter(Boolean) as string[]
              }
            />
          )}
        </div>
      </div>

      {/* side column */}
      <aside className="space-y-6">
        <Panel className="p-5">
          <SectionHeading title="Today" className="mb-4" />
          <dl className="space-y-3.5 text-[14px]">
            <Glance label="Done" value={doneToday.length} sub="approved today" />
            <Glance label="Open" value={open.length} sub={`${tasks.filter((t) => t.status === "in_progress").length} in progress`} />
            <Glance label="Waiting for you" value={waitingMe.length + extensions.length} sub="reviews and requests" href="/approvals" highlight={waitingMe.length + extensions.length > 0} />
            <Glance
              label="Reminders sent"
              value={state.activity.filter((x) => x.kind === "reminder_sent" && isToday(new Date(x.at)) && tasks.some((t) => t.id === x.taskId)).length}
              sub="by Pulse, so you didn't have to"
            />
          </dl>
          <Button variant="primary" className="mt-5 w-full" onClick={() => state.openCreate()}>
            <Plus /> Assign a task
          </Button>
        </Panel>

        {questions.length > 0 && (
          <Panel>
            <div className="px-5 pt-4">
              <SectionHeading title="Questions for you" aside={questions.length} />
            </div>
            <ul>
              {questions.map((q) => (
                <QuestionItem key={q.id} id={q.id} />
              ))}
            </ul>
          </Panel>
        )}

        {extensions.length > 0 && (
          <Panel>
            <div className="px-5 pt-4">
              <SectionHeading title="Asking for more time" aside={extensions.length} />
            </div>
            <ul>
              {extensions.map((d) => {
                const t = state.tasks.find((x) => x.id === d.taskId)!;
                return (
                  <li key={d.id} className="border-t border-line px-5 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <Avatar id={d.byId} size="sm" className="mt-0.5" />
                      <div className="min-w-0 text-[13.5px]">
                        <p>
                          <span className="font-medium">{name(d.byId)}</span> wants until {format(new Date(d.newDueAt), "EEE h:mm a")}
                        </p>
                        <button className="mt-0.5 block truncate text-left text-muted hover:text-text hover:underline" onClick={() => state.openTask(t.id)}>
                          {t.title}
                        </button>
                        <p className="mt-1 text-text/80">“{d.reason}”</p>
                        <div className="mt-2.5 flex gap-2">
                          <Button
                            size="sm"
                            variant="ok"
                            onClick={() => {
                              if (state.decideDeadline(d.id, true).ok) toast.success("Extension approved");
                            }}
                          >
                            <CalendarClock /> Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (state.decideDeadline(d.id, false).ok) toast("Extension declined");
                            }}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        <DepartmentHealth />
      </aside>
    </div>
  );
}

function Block({ title, count, tone, note, children }: { title: string; count: number; tone: 1 | 2 | 3 | 4; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span className={cn("tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12.5px] font-bold", HEAT[tone].tint, HEAT[tone].text)}>{count}</span>
        <h2 className="text-[16px] font-semibold text-text">{title}</h2>
      </div>
      {note && <p className="-mt-1 mb-2.5 text-[13px] text-muted">{note}</p>}
      <TaskList>{children}</TaskList>
    </section>
  );
}

function ClearList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5">
      {items.map((i) => (
        <li key={i} className="flex items-center gap-1.5 text-[13.5px] text-muted">
          <CheckCircle2 className="size-4 text-ok" /> {i}
        </li>
      ))}
    </ul>
  );
}

function Glance({ label, value, sub, href, highlight }: { label: string; value: number; sub: string; href?: string; highlight?: boolean }) {
  const inner = (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <dt className="font-medium text-text">{label}</dt>
        <dd className="text-[12.5px] text-muted">{sub}</dd>
      </div>
      <span className={cn("tabular font-display text-[26px] font-semibold leading-none", highlight ? "text-ink" : "text-text")}>
        <Count value={value} />
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded-[var(--radius-sm)] px-2 py-1 transition-colors duration-150 hover:bg-sunken">
      {inner}
    </Link>
  ) : (
    <div className="py-1">{inner}</div>
  );
}

function QuestionItem({ id }: { id: string }) {
  const q = useApp((s) => s.questions.find((x) => x.id === id)!);
  const from = useApp((s) => s.people.find((p) => p.id === q.fromId));
  const task = useApp((s) => s.tasks.find((t) => t.id === q.taskId));
  const answer = useApp((s) => s.answerQuestion);
  const openTask = useApp((s) => s.openTask);
  const [replying, setReplying] = React.useState(false);
  const [text, setText] = React.useState("");
  return (
    <li className="border-t border-line px-5 py-3.5">
      <div className="flex items-start gap-2.5">
        <Avatar person={from} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1 text-[13.5px]">
          <p>
            <span className="font-medium">{from?.name.split(" ")[0]}</span> <span className="text-faint">{ago(q.at)}</span>
          </p>
          <p className="mt-0.5 leading-snug text-text">{q.body}</p>
          {task && (
            <button type="button" className="relative mt-1 flex items-center gap-1 text-[12.5px] text-muted before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] hover:text-text" onClick={() => openTask(task.id)}>
              <MessageCircleQuestion className="size-3.5" /> {task.title}
            </button>
          )}
          {replying ? (
            <form
              className="mt-2.5 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                if (!answer(q.id, text.trim()).ok) return;
                toast.success("Answer sent", {
                  description: `${from?.name.split(" ")[0]} has been notified.`,
                });
              }}
            >
              <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} className="min-h-16 text-[13.5px]" placeholder="Your answer" />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" type="submit" disabled={!text.trim()}>
                  Send answer
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setReplying(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button size="sm" className="mt-2.5" onClick={() => setReplying(true)}>
              Answer
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function DepartmentHealth() {
  const { role, meId, tasks } = useScope();
  const departments = useApp((s) => s.departments);
  const people = useApp((s) => s.people);
  const visible = role === "owner" ? departments : departments.filter((d) => d.headId === meId);
  if (!visible.length) return null;
  return (
    <Panel className="p-5">
      <SectionHeading title={role === "owner" ? "Departments" : "Department"} className="mb-4" />
      <ul className="space-y-4">
        {visible.map((d) => {
          const dt = tasks.filter((t) => t.departmentId === d.id && isOpenWork(t));
          const hot = dt.filter((t) => heatOf(t) >= 2).length;
          const blocked = dt.filter((t) => t.status === "blocked").length;
          const segs = [
            { n: dt.filter((t) => heatOf(t) >= 3).length, c: "bg-heat-3" },
            {
              n: dt.filter((t) => heatOf(t) === 2 || heatOf(t) === 1).length,
              c: "bg-heat-1",
            },
            { n: blocked, c: "bg-heat-2" },
            {
              n: dt.length - dt.filter((t) => heatOf(t) >= 1).length - blocked,
              c: "bg-ink/70",
            },
          ];
          const head = people.find((p) => p.id === d.headId);
          return (
            <li key={d.id}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="font-medium">{d.name}</span>
                <span className="text-[12.5px] text-muted">
                  {dt.length} open{hot ? `, ${hot} stalled` : ""}
                </span>
              </div>
              <div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full bg-sunken">{segs.map((s, i) => (s.n > 0 ? <span key={i} className={s.c} style={{ flex: s.n }} /> : null))}</div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
                <Avatar person={head} size="xs" /> {head?.name}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-center gap-3 text-[11.5px] text-faint">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-ink/70" />
          On track
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-heat-1" />
          Slipping
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-heat-2" />
          Blocked
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-heat-3" />
          Overdue
        </span>
      </p>
    </Panel>
  );
}

function GettingStarted({ greeting, hasDepartments, hasPeople, hasTasks, onAssign }: { greeting: string; hasDepartments: boolean; hasPeople: boolean; hasTasks: boolean; onAssign: () => void }) {
  const steps = [
    {
      done: hasPeople,
      title: "Add your people",
      body: "Each person gets a sign-in and a temporary password to share with them. Teams can come later.",
      href: "/team",
      action: "Open Team",
    },
    {
      done: hasDepartments,
      title: "Group them into departments",
      body: "Each department has a head, who hears about it when work there stalls.",
      href: "/organisation",
      action: "Open Organisation",
    },
    {
      done: hasTasks,
      title: "Assign the first task",
      body: "Pick a person, a deadline and how often Pulse should remind them.",
      action: "Assign a task",
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <>
      <p className="text-[14px] text-muted">{greeting}</p>
      <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-text sm:text-[44px]">Welcome to Pulse.</h1>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">Three steps and your team is on automatic follow-up. You can come back to this page at any time.</p>
      <ol className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]">
        {steps.map((st, i) => (
          <li key={st.title} className={cn("flex gap-4 border-b border-line px-5 py-4 last:border-0", i === next && "bg-ink-tint/35")}>
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular",
                st.done ? "bg-ok-tint text-ok" : i === next ? "bg-ink text-white" : "bg-sunken text-muted",
              )}
              aria-hidden
            >
              {st.done ? <Check className="size-4" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-semibold", st.done ? "text-muted line-through decoration-line-strong" : "text-text")}>{st.title}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{st.body}</p>
              {i === next &&
                (st.href ? (
                  <Link
                    href={st.href}
                    className="press mt-3 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-ink px-3.5 text-[13.5px] font-medium text-white transition-colors hover:bg-ink-soft"
                  >
                    {st.action}
                  </Link>
                ) : (
                  <Button variant="primary" size="sm" className="mt-3" onClick={onAssign}>
                    <Plus /> {st.action}
                  </Button>
                ))}
            </div>
            <span className="sr-only">{st.done ? "Done" : "To do"}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
