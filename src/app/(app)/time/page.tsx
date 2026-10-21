"use client";

import { useScope } from "@/lib/hooks";
import { PageHeader } from "@/components/app/page-header";
import { MyTime } from "@/components/pages/time/my-time";
import { TeamTime } from "@/components/pages/time/team-time";
import { CheckInChip, ExportButton } from "@/components/pages/time/header-actions";

export default function TimePage() {
  const { role } = useScope();
  const employee = role === "employee";
  return (
    <div>
      <PageHeader
        title={employee ? "Time & leave" : "Time & attendance"}
        description={
          employee
            ? "Check in when you start and out when you leave. Leave you take here pauses your reminders on those days."
            : role === "owner"
              ? "Who is in today, the last two weeks at a glance, and leave waiting for a decision."
              : "Who in your department is in today, the last two weeks at a glance, and leave waiting for you."
        }
        actions={
          <>
            {role === "manager" && <CheckInChip />}
            <ExportButton />
          </>
        }
      />
      {employee ? <MyTime /> : <TeamTime />}
    </div>
  );
}
