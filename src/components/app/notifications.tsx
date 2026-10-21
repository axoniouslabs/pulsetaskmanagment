"use client";

import * as React from "react";
import {
  AlertOctagon,
  ArrowUpRight,
  Bell,
  BellRing,
  CheckCircle2,
  Inbox,
  Megaphone,
  MessageCircleQuestion,
  Newspaper,
  Send,
  Undo2,
  AtSign,
  CalendarClock,
  Unlock,
} from "lucide-react";
import { useApp, useMeId } from "@/lib/store";
import type { NotificationKind } from "@/lib/types";
import { ago, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Segmented } from "@/components/ui/primitives";

export const NOTE_ICON: Record<NotificationKind, { icon: React.ElementType; cls: string }> = {
  reminder: { icon: BellRing, cls: "bg-ink-tint text-ink" },
  assigned: { icon: ArrowUpRight, cls: "bg-ink-tint text-ink" },
  escalation: { icon: ArrowUpRight, cls: "bg-heat-3-tint text-heat-3" },
  blocked: { icon: AlertOctagon, cls: "bg-heat-2-tint text-heat-2" },
  unblocked: { icon: Unlock, cls: "bg-ok-tint text-ok" },
  submitted: { icon: Send, cls: "bg-[#efeafb] text-[#6a4fb3]" },
  approved: { icon: CheckCircle2, cls: "bg-ok-tint text-ok" },
  rejected: { icon: Undo2, cls: "bg-heat-2-tint text-heat-2" },
  mention: { icon: AtSign, cls: "bg-info-tint text-info" },
  announcement: { icon: Megaphone, cls: "bg-ink-tint text-ink" },
  question: { icon: MessageCircleQuestion, cls: "bg-info-tint text-info" },
  answer: { icon: MessageCircleQuestion, cls: "bg-ok-tint text-ok" },
  digest: { icon: Newspaper, cls: "bg-sunken text-muted" },
  deadline: { icon: CalendarClock, cls: "bg-heat-1-tint text-heat-1" },
};

export function NotificationBell() {
  const meId = useMeId();
  const all = useApp((s) => s.notifications);
  const mine = React.useMemo(() => all.filter((n) => n.recipientId === meId), [all, meId]);
  const unread = mine.filter((n) => !n.read).length;
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const markRead = useApp((s) => s.markRead);
  const markAllRead = useApp((s) => s.markAllRead);
  const openTask = useApp((s) => s.openTask);
  const list = filter === "unread" ? mine.filter((n) => !n.read) : mine;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-text" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-[20px]" />
          {unread > 0 && (
            <span className="tabular absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-heat-3 px-1 text-[10.5px] font-bold text-white ring-2 ring-paper">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-display text-[16px] font-semibold">Notifications</p>
          <div className="flex items-center gap-2">
            <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread", count: unread }]} />
          </div>
        </div>
        <div className="thin-scrollbar max-h-[min(520px,70vh)] overflow-y-auto">
          {list.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Inbox className="size-6 text-faint" />
              <p className="text-[14px] font-medium">You're all caught up</p>
              <p className="text-[13px] text-muted">New reminders, approvals and questions show up here.</p>
            </div>
          )}
          {list.slice(0, 40).map((n) => {
            const I = NOTE_ICON[n.kind];
            const Icon = I.icon;
            return (
              <button
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  if (n.taskId) {
                    openTask(n.taskId);
                    setOpen(false);
                  }
                }}
                className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sunken", !n.read && "bg-ink-tint/35")}
              >
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", I.cls)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-[13.5px] leading-snug", !n.read ? "font-semibold" : "font-medium")}>{n.title}</span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink" />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted">{n.body}</span>
                  <span className="mt-1 block text-[11.5px] text-faint">{ago(n.at)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {unread > 0 && (
          <div className="border-t border-line p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={markAllRead}>
              Mark all as read
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
