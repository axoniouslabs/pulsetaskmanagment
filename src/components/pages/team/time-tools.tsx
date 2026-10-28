"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarPlus, Clock } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Segmented } from "@/components/ui/primitives";

const today = () => format(new Date(), "yyyy-MM-dd");

/** a manager records leave for a range of days, or fixes a day's check-in (spec §9, §17) */
export function PersonTimeTools({ person }: { person: Person }) {
  const [open, setOpen] = React.useState<"leave" | "attendance" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen("leave")}>
        <CalendarPlus /> Record leave
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen("attendance")}>
        <Clock /> Correct attendance
      </Button>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open === "leave" && <RecordLeave person={person} onDone={() => setOpen(null)} />}
        {open === "attendance" && <FixAttendance person={person} onDone={() => setOpen(null)} />}
      </Dialog>
    </div>
  );
}

function RecordLeave({ person, onDone }: { person: Person; onDone: () => void }) {
  const act = useApp((s) => s.act);
  const [type, setType] = React.useState<"sick" | "annual" | "casual">("sick");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [note, setNote] = React.useState("");
  const first = person.name.split(" ")[0];
  return (
    <DialogContent title={`Record leave for ${first}`} description="Reminders pause on those days and new work goes to their backup. It shows as leave in attendance and the monthly summary.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (act({ type: "recordLeave", personId: person.id, from, to, leaveType: type, note }).ok) {
            toast.success("Leave recorded", { description: `${first} has been told.` });
            onDone();
          }
        }}
      >
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "sick", label: "Sick" },
            { value: "annual", label: "Annual" },
            { value: "casual", label: "Casual" },
          ]}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day" htmlFor="lv-from">
            <Input id="lv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Last day" htmlFor="lv-to">
            <Input id="lv-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="lv-note">
          <Input id="lv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called in sick this morning" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!from || !to || to < from}>
            Record leave
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function FixAttendance({ person, onDone }: { person: Person; onDone: () => void }) {
  const act = useApp((s) => s.act);
  const attendance = useApp((s) => s.attendance);
  const [date, setDate] = React.useState(today);
  const rec = attendance.find((a) => a.personId === person.id && a.date === date);
  const hm = (iso?: string) => (iso ? format(new Date(iso), "HH:mm") : "");
  const [checkIn, setIn] = React.useState(hm(rec?.checkIn));
  const [checkOut, setOut] = React.useState(hm(rec?.checkOut));
  const [reason, setReason] = React.useState("");
  const first = person.name.split(" ")[0];
  return (
    <DialogContent title={`Correct ${first}'s attendance`} description="For a forgotten check-out or a wrong time. The change, and why, is kept with the day and in the activity log.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (act({ type: "correctAttendance", personId: person.id, date, checkIn, checkOut, reason }).ok) {
            toast.success("Attendance corrected", { description: `${first} has been told.` });
            onDone();
          }
        }}
      >
        <Field label="Day" htmlFor="att-day">
          <Input
            id="att-day"
            type="date"
            value={date}
            max={today()}
            onChange={(e) => {
              setDate(e.target.value);
              const r = attendance.find((a) => a.personId === person.id && a.date === e.target.value);
              setIn(hm(r?.checkIn));
              setOut(hm(r?.checkOut));
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Checked in" htmlFor="att-in" hint="Leave empty for no check-in.">
            <Input id="att-in" type="time" value={checkIn} onChange={(e) => setIn(e.target.value)} />
          </Field>
          <Field label="Checked out" htmlFor="att-out">
            <Input id="att-out" type="time" value={checkOut} onChange={(e) => setOut(e.target.value)} />
          </Field>
        </div>
        <Field label="Why" htmlFor="att-why">
          <Input id="att-why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Forgot to check out; left at 6" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!reason.trim()}>
            Save correction
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
