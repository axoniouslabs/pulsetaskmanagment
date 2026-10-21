"use client";

import * as React from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Activity as ActivityIcon, ChevronLeft, Info, Megaphone, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { Activity, ChannelSpace } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/app/page-header";
import { AvatarStack } from "@/components/app/avatar";
import { ActivityLine } from "@/components/app/task-detail";
import { Notice } from "./notice";
import { PostNoticeDialog } from "./post-notice-dialog";
import { audienceOf, canPostIn, channelLead, channelMembers, type Org } from "./lib";

export function ChannelDetail({ channel, org, onBack }: { channel: ChannelSpace; org: Org; onBack: () => void }) {
  const { role, meId, people: scoped } = useScope();
  const now = useNow();
  const announcements = useApp((s) => s.announcements);
  const readAnnouncement = useApp((s) => s.readAnnouncement);
  const [posting, setPosting] = React.useState(false);

  const members = React.useMemo(() => channelMembers(org, channel), [org, channel]);
  const leadId = channelLead(org, channel);
  const lead = org.people.find((p) => p.id === leadId);
  const canPost = canPostIn(org, channel, role, meId);
  const scopeIds = React.useMemo(() => (role === "manager" ? new Set(scoped.map((p) => p.id)) : undefined), [role, scoped]);

  const notices = React.useMemo(
    () =>
      announcements
        .filter((a) => a.channelId === channel.id)
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at.localeCompare(a.at)),
    [announcements, channel.id],
  );

  /* opening a channel counts as reading its notices (never during render) */
  const unreadKey = notices
    .filter((a) => a.authorId !== meId && !a.readBy[meId])
    .map((a) => a.id)
    .join(",");
  React.useEffect(() => {
    if (!unreadKey) return;
    unreadKey.split(",").forEach((id) => readAnnouncement(id));
  }, [unreadKey, readAnnouncement]);

  const audienceCount = members.filter((id) => id !== meId).length;
  const who =
    channel.kind === "announcement"
      ? `Only ${lead?.name.split(" ")[0] ?? "the owner"} posts here. Every notice reaches everyone's phone and PC.`
      : channel.kind === "task_feed"
        ? "Pulse posts here by itself whenever a task changes. Nobody can post or edit."
        : `${lead?.name.split(" ")[0] ?? "The lead"} and the owner post notices here. Questions and quick replies stay on WhatsApp.`;

  return (
    <div className="min-w-0 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex h-10 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[14px] font-medium text-muted hover:bg-sunken hover:text-text lg:hidden"
      >
        <ChevronLeft className="size-4" /> All channels
      </button>

      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold leading-tight text-text sm:text-[24px]">{channel.name}</h2>
            <p className="mt-1 text-[14px] leading-snug text-muted">
              {channel.description}
            </p>
            <div className="mt-3.5 flex items-center gap-2.5">
              <AvatarStack ids={members} max={6} />
              <span className="text-[13px] text-muted">{plural(members.length, "member")}</span>
            </div>
          </div>
          {canPost && (
            <Button variant="primary" className="h-10 self-start sm:h-9" onClick={() => setPosting(true)}>
              <Plus /> Post notice
            </Button>
          )}
        </div>
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3.5 text-[13px] leading-snug text-muted">
          <Info className="mt-px size-4 shrink-0 text-faint" /> {who}
        </p>
      </Panel>

      {channel.kind === "task_feed" ? (
        <TaskFeed channel={channel} members={members} />
      ) : notices.length ? (
        <Panel className="divide-y divide-line overflow-hidden">
          {notices.map((n) => (
            <Notice
              key={n.id}
              notice={n}
              audience={audienceOf(members, n)}
              meId={meId}
              now={now}
              canManage={role === "owner" || role === "manager" || n.authorId === meId}
              scopeIds={n.authorId === meId || canPost ? undefined : scopeIds}
            />
          ))}
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={Megaphone}
            title="No notices yet"
            body={
              canPost
                ? `Post a notice when something applies to everyone in ${channel.name}. Turn on acknowledgment when you need proof that each person has read it.`
                : `Notices from ${lead?.name.split(" ")[0] ?? "your manager"} will show up here. If one needs your OK, you'll get a reminder.`
            }
            action={
              canPost ? (
                <Button variant="primary" onClick={() => setPosting(true)}>
                  <Plus /> Post notice
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}

      {canPost && <PostNoticeDialog channel={channel} audienceCount={audienceCount} open={posting} onOpenChange={setPosting} />}
    </div>
  );
}

/* ---------- automatic task feed ---------- */
function TaskFeed({ channel, members }: { channel: ChannelSpace; members: string[] }) {
  const activity = useApp((s) => s.activity);
  const tasks = useApp((s) => s.tasks);
  const unitName = useApp((s) =>
    channel.unitType === "department" ? s.departments.find((d) => d.id === channel.unitId)?.name : undefined,
  );

  const days = React.useMemo(() => {
    const inUnit = new Set(
      tasks
        .filter((t) => (channel.unitType === "department" ? t.departmentId === channel.unitId : members.includes(t.assigneeId)))
        .map((t) => t.id),
    );
    const items = activity
      .filter((a) => a.taskId && inUnit.has(a.taskId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 60);
    const groups: { key: string; label: string; items: Activity[] }[] = [];
    for (const a of items) {
      const d = new Date(a.at);
      const key = format(d, "yyyy-MM-dd");
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEEE d MMMM"), items: [] };
        groups.push(g);
      }
      g.items.push(a);
    }
    return groups;
  }, [activity, tasks, channel.unitType, channel.unitId, members]);

  if (!days.length)
    return (
      <Panel>
        <EmptyState
          icon={ActivityIcon}
          title="No task events yet"
          body={`When someone in ${unitName ?? channel.name} is assigned a task, acknowledges it or submits work, it appears here automatically.`}
        />
      </Panel>
    );

  return (
    <Panel className="px-5 py-5 sm:px-6">
      <p className="mb-5 text-[13px] text-muted">Latest 60 events from {unitName ?? "this unit"}&apos;s tasks, newest first. Tap a task to open it.</p>
      <div className="space-y-6">
        {days.map((g) => (
          <section key={g.key}>
            <h3 className="mb-3 text-[13px] font-semibold text-text">{g.label}</h3>
            <ol>
              {g.items.map((a) => (
                <ActivityLine key={a.id} a={a} showTask />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Panel>
  );
}
