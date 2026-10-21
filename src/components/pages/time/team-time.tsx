"use client";

import * as React from "react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import { Segmented } from "@/components/ui/primitives";
import { TeamToday } from "./team-today";
import { AttendanceGrid } from "./attendance-grid";
import { LeaveAdmin } from "./leave-admin";

type Tab = "today" | "grid" | "leave";

export function TeamTime() {
  const now = useNow(30000);
  const { role, meId, people: scoped } = useScope();
  const leaves = useApp((s) => s.leaves);
  const departments = useApp((s) => s.departments);
  const [tab, setTab] = React.useState<Tab>("today");

  /* the owner doesn't clock in; everyone else in scope does */
  const people = React.useMemo(() => scoped.filter((p) => p.role !== "owner"), [scoped]);
  const pending = React.useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return leaves.filter((l) => l.status === "pending" && ids.has(l.personId) && l.personId !== meId).length;
  }, [leaves, people, meId]);
  const scopeLabel = role === "owner" ? "whole company" : departments.find((d) => d.headId === meId)?.name ?? "your team";

  return (
    <div className="space-y-6">
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "today", label: "Today" },
            { value: "grid", label: "Last 2 weeks" },
            { value: "leave", label: "Leave", count: pending || undefined },
          ]}
        />
      </div>

      {tab === "today" && <TeamToday people={people} now={now} scopeLabel={scopeLabel} />}
      {tab === "grid" && <AttendanceGrid people={people} now={now} groupByDepartment={role === "owner"} />}
      {tab === "leave" && <LeaveAdmin people={people} now={now} meId={meId} canRequest={role === "manager"} />}
    </div>
  );
}
