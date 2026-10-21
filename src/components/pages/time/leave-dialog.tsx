"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { Leave } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { leaveDays } from "./lib";

export function LeaveDialog({
  open,
  onOpenChange,
  today,
  approverName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** yyyy-MM-dd */
  today: string;
  approverName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="Request leave" description="Your reminders pause automatically on approved leave days.">
          <LeaveForm today={today} approverName={approverName} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function LeaveForm({ today, approverName, onDone }: { today: string; approverName: string; onDone: () => void }) {
  const requestLeave = useApp((s) => s.requestLeave);
  const settings = useApp((s) => s.settings);
  const [type, setType] = React.useState<Leave["type"]>("casual");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [note, setNote] = React.useState("");

  const backwards = !!from && !!to && to < from;
  const days = from && to && !backwards ? leaveDays({ from, to }, settings) : 0;
  const valid = !!from && !!to && !backwards && days > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        requestLeave({ type, from, to, note: note.trim() || undefined });
        onDone();
        toast.success("Leave requested", { description: `Sent to ${approverName} for approval. You'll get a notification when they decide.` });
      }}
    >
      <Field label="Type of leave" htmlFor="leave-type">
        <Select id="leave-type" value={type} onChange={(e) => setType(e.target.value as Leave["type"])}>
          <option value="sick">Sick leave</option>
          <option value="annual">Annual leave</option>
          <option value="casual">Casual leave</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="leave-from">
          <Input
            id="leave-from"
            type="date"
            min={today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to || to < e.target.value) setTo(e.target.value);
            }}
          />
        </Field>
        <Field label="To" htmlFor="leave-to">
          <Input id="leave-to" type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={backwards} />
        </Field>
      </div>
      <p className={backwards || (valid === false && !!from && !!to) ? "text-[13px] text-heat-3" : "text-[13px] text-muted"}>
        {backwards
          ? "The end date is before the start date. Pick a later end date."
          : days > 0
            ? `${plural(days, "working day")}. Sundays and holidays aren't counted.`
            : "Those dates fall on a weekend or holiday. Pick a working day."}
      </p>
      <Field label="Note (optional)" htmlFor="leave-note" hint={type === "casual" ? "Casual leave needs one day's notice." : undefined}>
        <Textarea id="leave-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Anything ${approverName} should know`} className="min-h-20" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          Send request
        </Button>
      </div>
    </form>
  );
}
