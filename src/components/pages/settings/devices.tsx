"use client";

import * as React from "react";
import { differenceInHours } from "date-fns";
import { AlertTriangle, Globe, Monitor, Smartphone } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import type { Device } from "@/lib/types";
import { ago, cn, plural } from "@/lib/utils";
import { Avatar } from "@/components/app/avatar";

const KIND_ICON: Record<Device["kind"], React.ElementType> = { windows: Monitor, android: Smartphone, iphone: Smartphone, browser: Globe };

/** every person's devices, broken ones first, with what to do about them */
export function DeviceList({ onlyMe = false }: { onlyMe?: boolean }) {
  const now = useNow(60000);
  const everyone = useApp((s) => s.people);
  const meId = useApp((s) => s.viewer?.personId);
  const people = React.useMemo(() => (onlyMe ? everyone.filter((p) => p.id === meId) : everyone), [everyone, meId, onlyMe]);
  const sorted = React.useMemo(
    () => [...people].sort((a, b) => Number(b.devices.some((d) => !d.healthy)) - Number(a.devices.some((d) => !d.healthy)) || a.name.localeCompare(b.name)),
    [people],
  );
  const all = people.flatMap((p) => p.devices);
  const broken = all.filter((d) => !d.healthy).length;

  return (
    <>
      <p className="border-b border-line px-4 py-3 text-[13.5px] text-muted sm:px-5">
        {plural(all.length, "device")} registered.{" "}
        {broken ? (
          <span className="font-medium text-heat-2">{plural(broken, "device isn't", "devices aren't")} receiving notifications.</span>
        ) : (
          "All of them are receiving notifications."
        )}{" "}
        Failed deliveries are never counted as ignored reminders.
      </p>
      <ul>
        {sorted.map((p) => {
          const first = p.name.split(" ")[0];
          return (
            <li key={p.id} className="flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5">
              <Avatar person={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-text">
                  {p.name} <span className="font-normal text-muted">{p.title}</span>
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {p.devices.map((d) => {
                    const Icon = KIND_ICON[d.kind];
                    const stale = d.healthy && differenceInHours(now, new Date(d.lastSeen)) >= 24;
                    return (
                      <li key={d.id} className="text-[13px]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <Icon className="size-4 shrink-0 text-faint" />
                          <span className="text-text">{d.label}</span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[12.5px]",
                              !d.healthy ? "font-medium text-heat-2" : stale ? "text-heat-1" : "text-ok",
                            )}
                          >
                            <span className={cn("size-1.5 rounded-full", !d.healthy ? "bg-heat-2" : stale ? "bg-heat-1" : "bg-ok")} />
                            {!d.healthy ? "Not receiving notifications" : stale ? "Not opened for a day" : "Receiving notifications"}
                          </span>
                          <span className="text-[12.5px] text-faint">Last seen {ago(d.lastSeen, now)}</span>
                        </div>
                        {!d.healthy && (
                          <p className="mt-1 flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-heat-2-tint px-2.5 py-1.5 text-[12.5px] leading-snug text-text">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-heat-2" />
                            Push subscription expired, ask {first} to open Pulse once on the {d.label.toLowerCase()} to renew it. Until then, reminders reach {first} in-app only.
                          </p>
                        )}
                        {stale && (
                          <p className="mt-1 text-[12.5px] text-muted">
                            Still subscribed. If {first} doesn&apos;t answer reminders, check the phone isn&apos;t in battery saver mode.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
