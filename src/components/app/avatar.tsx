"use client";

import type * as React from "react";
import { useApp } from "@/lib/store";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/primitives";

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[12px]",
  lg: "size-10 text-[14px]",
  xl: "size-14 text-[19px]",
};

export function Avatar({
  person,
  id,
  size = "md",
  className,
  tip,
}: {
  person?: Person;
  id?: string;
  size?: keyof typeof SIZES;
  className?: string;
  tip?: boolean;
}) {
  const fromStore = useApp((s) => (id ? s.people.find((p) => p.id === id) : undefined));
  const p = person ?? fromStore;
  if (!p) return <span className={cn("inline-block rounded-full bg-sunken", SIZES[size], className)} />;
  const el = (
    <span
      className={cn(
        "avatar-tint relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        SIZES[size],
        p.onLeave && "opacity-60 grayscale",
        className,
      )}
      style={{ "--hue": p.hue } as React.CSSProperties}
      aria-label={p.name}
    >
      {p.initials}
    </span>
  );
  return tip ? <Tip label={`${p.name}${p.onLeave ? " (on leave)" : ""}`}>{el}</Tip> : el;
}

export function AvatarStack({ ids, max = 4, size = "sm" }: { ids: string[]; max?: number; size?: keyof typeof SIZES }) {
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <span className="flex -space-x-1">
      {shown.map((id) => (
        <Avatar key={id} id={id} size={size} tip className="ring-2 ring-surface" />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-sunken font-semibold text-muted ring-2 ring-surface", SIZES[size])}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function PersonName({ id, first }: { id: string; first?: boolean }) {
  const name = useApp((s) => s.people.find((p) => p.id === id)?.name ?? "Someone");
  return <>{first ? name.split(" ")[0] : name}</>;
}
