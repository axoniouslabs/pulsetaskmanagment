"use client";

import { ChevronRight } from "lucide-react";
import type { ChannelSpace } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { Tip } from "@/components/ui/primitives";
import { channelType, type ChannelCounts } from "./lib";

export function ChannelList({
  channels,
  counts,
  activeId,
  onSelect,
}: {
  channels: ChannelSpace[];
  counts: Record<string, ChannelCounts>;
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Channels" className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <ul>
        {channels.map((c) => {
          const t = channelType(c);
          const Icon = t.icon;
          const k = counts[c.id] ?? { needsOk: 0, unread: 0 };
          const active = c.id === activeId;
          return (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "relative flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fafbfb]",
                  active && "bg-ink-tint/55 hover:bg-ink-tint/70",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-ink" aria-hidden />}
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-sunken text-muted",
                    active && "bg-surface text-ink",
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[14.5px] font-medium text-text", k.unread > 0 && "font-semibold")}>{c.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{t.label}</span>
                </span>
                {k.needsOk > 0 ? (
                  <Tip label={`${plural(k.needsOk, "notice")} ${k.needsOk === 1 ? "needs" : "need"} your OK`}>
                    <span
                      className="tabular inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold text-white"
                      aria-label={`${plural(k.needsOk, "notice")} ${k.needsOk === 1 ? "needs" : "need"} your OK`}
                    >
                      {k.needsOk}
                    </span>
                  </Tip>
                ) : k.unread > 0 ? (
                  <span
                    className="tabular inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ink-tint px-1.5 text-[12px] font-semibold text-ink"
                    aria-label={`${k.unread} unread`}
                  >
                    {k.unread}
                  </span>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-faint lg:hidden" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
