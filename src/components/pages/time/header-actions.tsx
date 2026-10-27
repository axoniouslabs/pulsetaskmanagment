"use client";

import { format } from "date-fns";
import { toast } from "sonner";
import { Download, LogIn, LogOut } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope, useOrgToday } from "@/lib/hooks";
import { BreakButton } from "./break-button";
import { Button } from "@/components/ui/button";
import { exportAttendanceCsv } from "./lib";

/** downloads this month's attendance for everyone the viewer can see */
export function ExportButton() {
  const { people } = useScope();
  const attendance = useApp((s) => s.attendance);
  const departments = useApp((s) => s.departments);
  const allPeople = useApp((s) => s.people);

  const run = () => {
    const now = new Date();
    const month = format(now, "yyyy-MM");
    const ids = new Set(people.filter((p) => p.role !== "owner").map((p) => p.id));
    const rows = attendance.filter((a) => ids.has(a.personId) && a.date.startsWith(month) && a.status !== "weekend");
    if (!rows.length) {
      toast("Nothing to export yet", {
        description: `There's no attendance for ${format(now, "MMMM")} so far.`,
      });
      return;
    }
    exportAttendanceCsv({ rows, people: allPeople, departments, now });
    toast.success("Attendance exported", {
      description: `attendance-${month}.csv, ${rows.length} rows for ${format(now, "MMMM yyyy")}.`,
    });
  };

  return (
    <Button onClick={run} className="h-10 sm:h-9">
      <Download /> Export month
    </Button>
  );
}

/** a manager checks in too; shown next to the page title */
export function CheckInChip() {
  const now = useNow();
  const meId = useApp((s) => s.userIds[s.role]);
  const today = useOrgToday(now, meId);
  const att = useApp((s) => s.attendance.find((a) => a.personId === meId && a.date === today));
  const checkIn = useApp((s) => s.checkIn);
  const checkOut = useApp((s) => s.checkOut);

  if (!att?.checkIn)
    return (
      <Button
        variant="primary"
        className="h-10 sm:h-9"
        onClick={() => {
          if (checkIn().ok)
            toast.success("Checked in", {
              description: `at ${format(new Date(), "h:mm a")}`,
            });
        }}
      >
        <LogIn /> Check in
      </Button>
    );
  return (
    <>
      <span className="inline-flex h-10 items-center gap-2 rounded-full bg-ok-tint px-3.5 text-[13px] font-medium text-ok sm:h-9">
        {!att.checkOut && <span className="size-2 animate-pulse-dot rounded-full bg-ok" aria-hidden />}
        {att.checkOut ? `You checked out at ${format(new Date(att.checkOut), "h:mm a")}` : `You're in since ${format(new Date(att.checkIn), "h:mm a")}`}
      </span>
      {!att.checkOut && <BreakButton onBreak={!!att.breaks?.some((b) => !b.end)} />}
      {!att.checkOut && (
        <Button
          variant="ghost"
          className="h-10 sm:h-9"
          onClick={() => {
            if (checkOut().ok)
              toast("Checked out", {
                description: "Any running timer was stopped.",
              });
          }}
        >
          <LogOut /> Check out
        </Button>
      )}
    </>
  );
}
