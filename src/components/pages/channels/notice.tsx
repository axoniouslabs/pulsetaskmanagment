"use client";

import * as React from "react";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { BellRing, Check, CheckCircle2, ChevronDown, Eye, MessageSquare, Pin, Send } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Announcement } from "@/lib/types";
import { cn, formatWhen, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bar } from "@/components/ui/primitives";
import { Avatar, AvatarStack } from "@/components/app/avatar";
import { MentionInput, WithMentions } from "./mention-input";

export function Notice({
  notice,
  audience,
  meId,
  canManage,
  scopeIds,
  now,
  replyTo,
}: {
  /** channel members who can reply; omitted where replies are off (archived channels) */
  replyTo?: string[];
  notice: Announcement;
  /** channel members minus the author */
  audience: string[];
  meId: string;
  /** owner, manager or the author: sees who hasn't acknowledged */
  canManage: boolean;
  /** limit the "Not yet" list to these people (managers outside their own notices) */
  scopeIds?: Set<string>;
  now: Date;
}) {
  const author = useApp((s) => s.people.find((p) => p.id === notice.authorId));
  const needsMe = notice.requiresAck && audience.includes(meId) && !notice.ackBy[meId];

  return (
    <article className={cn("relative px-5 py-5 sm:px-6", needsMe && "bg-ink-tint/35")}>
      {needsMe && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-ink" aria-hidden />}
      <header className="flex items-center gap-3">
        <Avatar person={author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-text">{author?.name ?? "Someone"}</p>
          <p className="truncate text-[12.5px] text-faint">
            <time dateTime={notice.at}>{formatWhen(notice.at, { withDay: true })}</time>
          </p>
        </div>
        {notice.pinned && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-muted">
            <Pin className="size-3" /> Pinned
          </span>
        )}
      </header>

      <h3 className="mt-3.5 text-[17px] font-semibold leading-snug text-text">{notice.title}</h3>
      <p className="mt-1.5 max-w-[68ch] whitespace-pre-line text-[14.5px] leading-relaxed text-text/85">
        <WithMentions text={notice.body} />
      </p>

      {notice.requiresAck ? (
        <AckBlock notice={notice} audience={audience} meId={meId} canManage={canManage} scopeIds={scopeIds} now={now} authorFirst={author?.name.split(" ")[0] ?? "The author"} />
      ) : (
        <p className="mt-3.5 flex items-center gap-1.5 text-[12.5px] text-faint">
          <Eye className="size-3.5" /> Read by <span className="tabular">{audience.filter((id) => notice.readBy[id]).length}</span>
          {audience.length > 0 && <span>of {audience.length}</span>}
        </p>
      )}
      <Replies notice={notice} memberIds={replyTo} />
    </article>
  );
}

/** discussion under a post: replies notify whoever posted and anyone already in the thread */
function Replies({ notice, memberIds }: { notice: Announcement; memberIds?: string[] }) {
  const people = useApp((s) => s.people);
  const act = useApp((s) => s.act);
  const replies = notice.replies ?? [];
  const [open, setOpen] = React.useState(replies.length > 0 && replies.length <= 3);
  const [text, setText] = React.useState("");
  if (!replies.length && !memberIds) return null;
  const send = () => {
    if (!text.trim()) return;
    if (act({ type: "replyNotice", id: notice.id, body: text }).ok) setText("");
  };
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium text-muted hover:bg-sunken hover:text-text"
      >
        <MessageSquare className="size-4" /> {replies.length ? plural(replies.length, "reply", "replies") : "Reply"}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {replies.map((r) => {
            const p = people.find((x) => x.id === r.authorId);
            return (
              <div key={r.id} className="flex gap-2.5">
                <Avatar person={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]">
                    <span className="font-medium text-text">{p?.name ?? "Someone"}</span>{" "}
                    <time className="text-faint" dateTime={r.at}>
                      {formatWhen(r.at, { withDay: true })}
                    </time>
                  </p>
                  <p className="whitespace-pre-line text-[14px] leading-relaxed text-text/90">
                    <WithMentions text={r.body} />
                  </p>
                </div>
              </div>
            );
          })}
          {memberIds && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MentionInput
                  value={text}
                  onChange={setText}
                  memberIds={memberIds}
                  rows={1}
                  placeholder="Write a reply. Type @ to mention someone."
                  aria-label="Reply"
                  className="min-h-10 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                  }}
                />
              </div>
              <Button variant="primary" size="sm" className="h-10" onClick={send} disabled={!text.trim()} aria-label="Send reply">
                <Send />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AckBlock({
  notice,
  audience,
  meId,
  canManage,
  scopeIds,
  now,
  authorFirst,
}: {
  notice: Announcement;
  audience: string[];
  meId: string;
  canManage: boolean;
  scopeIds?: Set<string>;
  now: Date;
  authorFirst: string;
}) {
  const ack = useApp((s) => s.ackAnnouncement);
  const remindAnnouncement = useApp((s) => s.remindAnnouncement);
  const people = useApp((s) => s.people);
  const [open, setOpen] = React.useState(false);

  const acked = audience.filter((id) => notice.ackBy[id]).length;
  const total = audience.length;
  const complete = total > 0 && acked === total;
  const due = notice.ackDueAt ? new Date(notice.ackDueAt) : undefined;
  const late = !!due && due < now && !complete;
  const notYetAll = audience.filter((id) => !notice.ackBy[id]);
  const notYet = scopeIds ? notYetAll.filter((id) => scopeIds.has(id)) : notYetAll;
  const scoped = !!scopeIds && notYet.length !== notYetAll.length;
  const inAudience = audience.includes(meId);
  const myAck = notice.ackBy[meId];

  const remind = () => {
    const r = remindAnnouncement(notice.id);
    if (!r.ok) return;
    toast.success(`Reminder sent to ${plural(notYetAll.length, "person", "people")}`, {
      description: "On their phone and PC, and in their notifications here.",
    });
  };

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-3.5 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] font-medium text-text">
          <span className="tabular">
            {acked} of {total}
          </span>{" "}
          acknowledged
        </p>
        <p className={cn("text-[12.5px]", late ? "font-medium text-heat-1" : "text-muted")}>
          {complete ? "Everyone has confirmed" : due ? `${late ? "Was due" : "Due"} ${formatWhen(due, { withDay: true })}` : "No deadline"}
        </p>
      </div>
      <Bar value={acked} max={total} tone={complete ? "ok" : late ? "heat-1" : "ink"} className="mt-2.5" />

      {canManage && notYet.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="-ml-2 inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[13px] font-medium text-text hover:bg-sunken"
            >
              <ChevronDown className={cn("size-4 text-faint transition-transform", !open && "-rotate-90")} />
              Not yet{scoped ? " in your team" : ""} <span className="tabular font-normal text-muted">{notYet.length}</span>
              {!open && <AvatarStack ids={notYet} max={4} size="xs" />}
            </button>
            <Button size="sm" className="ml-auto" onClick={remind}>
              <BellRing /> Remind them
            </Button>
          </div>
          {open && (
            <ul className="mt-2 overflow-hidden rounded-[var(--radius-sm)] border border-line">
              {notYet.map((id) => {
                const p = people.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
                    <Avatar person={p} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-text">{p?.name}</span>
                      <span className="block truncate text-[12px] text-muted">{p?.title}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-faint">{notice.readBy[id] ? "Opened, not confirmed" : "Not opened"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {canManage && notYet.length === 0 && !complete && scoped && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ok">
          <CheckCircle2 className="size-4" /> Everyone in your team has confirmed
        </p>
      )}

      {inAudience && !myAck && (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-line pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-snug text-muted">{authorFirst} needs everyone to confirm they have read this. You&apos;ll be reminded until you do.</p>
          <Button
            variant="primary"
            className="h-10 sm:h-9"
            onClick={() => {
              ack(notice.id);
              toast.success("Acknowledged", {
                description: `${authorFirst} can see you've read it.`,
              });
            }}
          >
            <Check /> I&apos;ve read this
          </Button>
        </div>
      )}
      {inAudience && myAck && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ok">
          <CheckCircle2 className="size-4" />
          You acknowledged {isToday(new Date(myAck)) ? `at ${format(new Date(myAck), "h:mm a")}` : `on ${format(new Date(myAck), "EEE d MMM 'at' h:mm a")}`}
        </p>
      )}
    </div>
  );
}
