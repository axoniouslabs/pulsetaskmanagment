"use client";

import * as React from "react";
import { BellRing, CalendarClock, CalendarOff, CheckCheck, ShieldCheck } from "lucide-react";
import { isToday } from "date-fns";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import { cn, plural } from "@/lib/utils";
import { Segmented } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Panel, SectionHeading } from "@/components/app/page-header";
import { ReviewItem, reviewHeat } from "@/components/pages/approvals/review-item";
import { ExtensionItem, LeaveItem } from "@/components/pages/approvals/request-items";

type Tab = "review" | "time" | "leave";

function readTab(): Tab {
  try {
    const v = new URLSearchParams(window.location.search).get("tab");
    return v === "time" || v === "leave" ? v : "review";
  } catch {
    return "review";
  }
}

export default function ApprovalsPage() {
  const now = useNow(30000);
  const { role, meId, tasks, people, allTasks } = useScope();
  const slaHours = useApp((s) => s.settings.reviewSlaHours);
  const deadlineRequests = useApp((s) => s.deadlineRequests);
  const leaves = useApp((s) => s.leaves);
  const activity = useApp((s) => s.activity);
  const [tab, setTab] = React.useState<Tab>(() => (typeof window === "undefined" ? "review" : readTab()));

  const reviews = React.useMemo(
    () =>
      tasks
        .filter((t) => t.status === "submitted" && (role === "owner" || t.reviewerId === meId))
        .sort((a, b) => (a.submittedAt ?? a.statusChangedAt).localeCompare(b.submittedAt ?? b.statusChangedAt)),
    [tasks, role, meId],
  );
  const extensions = React.useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    return deadlineRequests.filter((d) => d.status === "pending" && ids.has(d.taskId)).sort((a, b) => a.at.localeCompare(b.at));
  }, [tasks, deadlineRequests]);
  const leaveRequests = React.useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return leaves.filter((l) => l.status === "pending" && ids.has(l.personId) && l.personId !== meId).sort((a, b) => a.from.localeCompare(b.from));
  }, [people, leaves, meId]);

  if (role === "employee") {
    return (
      <Panel>
        <EmptyState icon={ShieldCheck} title="Approvals are for managers" body="Your submissions and requests show up on My day, with their status." />
      </Panel>
    );
  }

  const total = reviews.length + extensions.length + leaveRequests.length;
  const late = reviews.filter((t) => reviewHeat(t.submittedAt, slaHours, now) > 0).length;
  const oldest = reviews[0];
  const decidedToday = activity.filter((x) => x.actorId === meId && (x.kind === "approved" || x.kind === "rejected") && isToday(new Date(x.at)));
  const approvedToday = decidedToday.filter((x) => x.kind === "approved").length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <PageHeader
          title="Approvals"
          description={
            total === 0
              ? "Nothing is waiting for your decision. Pulse tells you the moment something arrives."
              : `${plural(total, "thing is", "things are")} waiting for your decision, oldest first. People can't move on until you answer.`
          }
        />

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="mb-5 flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 [&>button]:justify-center sm:[&>button]:flex-none"
          options={[
            {
              value: "review",
              label: (
                <>
                  <span className="sm:hidden">Reviews</span>
                  <span className="hidden sm:inline">Work to review</span>
                </>
              ),
              count: reviews.length,
            },
            {
              value: "time",
              label: (
                <>
                  <span className="sm:hidden">More time</span>
                  <span className="hidden sm:inline">More time requests</span>
                </>
              ),
              count: extensions.length,
            },
            {
              value: "leave",
              label: (
                <>
                  <span className="sm:hidden">Leave</span>
                  <span className="hidden sm:inline">Leave requests</span>
                </>
              ),
              count: leaveRequests.length,
            },
          ]}
        />

        {tab === "review" && (
          <section aria-label="Work to review">
            <p className="mb-4 flex items-start gap-2 text-[13.5px] leading-snug text-muted">
              <BellRing className="mt-0.5 size-4 shrink-0 text-faint" />
              <span>
                Reviewers are reminded too. Reviews older than {slaHours} hours are escalated to {role === "owner" ? "you" : "the owner"}, the same way ignored tasks are.
              </span>
            </p>
            {reviews.length === 0 ? (
              <Panel>
                <EmptyState icon={CheckCheck} title="Nothing to review" body="Submissions show up here the moment they come in." />
              </Panel>
            ) : (
              <>
                <p className="mb-3 text-[14px] text-text">
                  <span className="font-semibold">{plural(reviews.length, "submission")}</span> waiting
                  {oldest?.submittedAt && reviews.length > 1 ? `, the oldest for ${ageWords(oldest.submittedAt, now)}` : ""}.
                  {late > 0 && (
                    <span className="font-medium text-heat-2">
                      {" "}
                      {late === reviews.length && late > 1 ? "All of them have" : late === 1 ? "1 has" : `${late} have`} passed the {slaHours}-hour review time.
                    </span>
                  )}
                </p>
                <div className="space-y-3">
                  {reviews.map((t) => (
                    <ReviewItem key={t.id} task={t} now={now} slaHours={slaHours} meId={meId} />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "time" && (
          <section aria-label="More time requests">
            <p className="mb-4 text-[13.5px] leading-snug text-muted">
              Approving moves the deadline and records the reason on the task. Declining keeps the deadline and reminders carry on.
            </p>
            {extensions.length === 0 ? (
              <Panel>
                <EmptyState icon={CalendarClock} title="No requests for more time" body="When someone asks to move a deadline, you approve or decline it here in one tap." />
              </Panel>
            ) : (
              <div className="space-y-3">
                {extensions.map((d) => {
                  const task = allTasks.find((t) => t.id === d.taskId);
                  return task ? <ExtensionItem key={d.id} request={d} task={task} now={now} /> : null;
                })}
              </div>
            )}
          </section>
        )}

        {tab === "leave" && (
          <section aria-label="Leave requests">
            <p className="mb-4 text-[13.5px] leading-snug text-muted">
              While someone is on leave, their reminders stop. Check what is due before you approve.
            </p>
            {leaveRequests.length === 0 ? (
              <Panel>
                <EmptyState icon={CalendarOff} title="No leave requests" body="Leave requests from your team show up here for a quick yes or no." />
              </Panel>
            ) : (
              <div className="space-y-3">
                {leaveRequests.map((l) => (
                  <LeaveItem key={l.id} leave={l} tasks={allTasks} now={now} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="hidden lg:block">
        <Panel className="sticky top-24 p-5">
          <SectionHeading title="At a glance" className="mb-4" />
          <dl className="space-y-3.5 text-[14px]">
            <Glance label="Oldest review" value={oldest?.submittedAt ? ageWords(oldest.submittedAt, now) : "None"} warn={!!oldest && reviewHeat(oldest.submittedAt, slaHours, now) > 0} />
            <Glance label={`Past ${slaHours}h review time`} value={String(late)} warn={late > 0} />
            <Glance label="You approved today" value={String(approvedToday)} />
            <Glance label="You sent back today" value={String(decidedToday.length - approvedToday)} />
          </dl>
          <p className="mt-4 border-t border-line pt-4 text-[12.5px] leading-snug text-muted">
            Clear reasons when you send work back get it fixed faster. The reason shows at the top of the task.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function Glance({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular whitespace-nowrap font-display text-[18px] font-semibold leading-none", warn ? "text-heat-2" : "text-text")}>{value}</dd>
    </div>
  );
}

function ageWords(iso: string, now: Date) {
  const hrs = Math.floor((now.getTime() - new Date(iso).getTime()) / 3600000);
  if (hrs < 1) return "less than an hour";
  if (hrs < 48) return plural(hrs, "hour");
  return plural(Math.floor(hrs / 24), "day");
}
