"use client";

import * as React from "react";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { MapPin, X } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";

const until = (iso?: string) => (iso ? ` until ${isToday(new Date(iso)) ? format(new Date(iso), "h:mm a") : format(new Date(iso), "EEE h:mm a")}` : "");

/** "At the Lahore depot until 3 PM": a one-line note so people can see who is around */
export function AvailabilityNote({ person, className }: { person: Person; className?: string }) {
  const a = person.availability;
  if (!a) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-[12.5px] text-info", className)}>
      <MapPin className="size-3.5 shrink-0" />
      <span className="truncate">
        {a.note}
        {until(a.until)}
      </span>
    </p>
  );
}

const PRESETS = [
  { label: "For the next hour", hours: 1 },
  { label: "For 2 hours", hours: 2 },
  { label: "For the rest of today", hours: -1 },
  { label: "Until I clear it", hours: 0 },
];

/** set or clear an availability note (yourself, or someone you manage) */
export function AvailabilityEditor({ person, self }: { person: Person; self: boolean }) {
  const act = useApp((s) => s.act);
  const [note, setNote] = React.useState("");
  const [preset, setPreset] = React.useState(2);
  const first = person.name.split(" ")[0];
  const save = () => {
    const p = PRESETS[preset];
    let untilIso: string | undefined;
    if (p.hours > 0) untilIso = new Date(Date.now() + p.hours * 3600000).toISOString();
    if (p.hours === -1) {
      const d = new Date();
      d.setHours(23, 59, 0, 0);
      untilIso = d.toISOString();
    }
    if (act({ type: "setAvailability", personId: person.id, note, until: untilIso }).ok) {
      setNote("");
      toast.success("Availability updated", { description: "Shown next to the name across Pulse." });
    }
  };
  const clear = () => act({ type: "setAvailability", personId: person.id, note: "" }).ok && toast.success("Availability cleared");

  return (
    <div className="rounded-[var(--radius-md)] border border-line p-4">
      <p className="text-[14px] font-semibold text-text">{self ? "Where you are" : `Where ${first} is`}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">
        A short note so people know who is around, like &ldquo;At the Lahore depot&rdquo; or &ldquo;In a client meeting&rdquo;. It clears itself when the time is up.
      </p>
      {person.availability ? (
        <div className="mt-3 flex items-center gap-2">
          <AvailabilityNote person={person} className="min-w-0 flex-1 text-[13.5px]" />
          <Button size="sm" variant="ghost" onClick={clear}>
            <X /> Clear
          </Button>
        </div>
      ) : null}
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) save();
        }}
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={self ? "Where are you, or when are you back?" : `Where is ${first}?`}
          maxLength={120}
          aria-label="Availability note"
          className="sm:flex-1"
        />
        <Select value={preset} onChange={(e) => setPreset(Number(e.target.value))} aria-label="For how long" className="sm:w-48">
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" disabled={!note.trim()}>
          Set
        </Button>
      </form>
    </div>
  );
}
