"use client";

import * as React from "react";
import { localDate } from "@/domain/time";
import { useApp } from "./store";
import { scopePeople, scopeTasks } from "./selectors";

/** the viewer, plus the people and tasks they are allowed to see (memoised) */
export function useScope() {
  const role = useApp((s) => s.role);
  const meId = useApp((s) => s.userIds[s.role]);
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const tasks = useApp((s) => s.tasks);
  const groups = useApp((s) => s.groups);
  const me = React.useMemo(() => people.find((p) => p.id === meId)!, [people, meId]);
  const scopedPeople = React.useMemo(() => scopePeople({ people, teams, departments }, role, meId), [people, teams, departments, role, meId]);
  const scopedTasks = React.useMemo(() => scopeTasks({ people, teams, departments, tasks, groups }, role, meId), [people, teams, departments, tasks, groups, role, meId]);
  return {
    role,
    meId,
    me,
    people: scopedPeople,
    tasks: scopedTasks,
    allPeople: people,
    allTasks: tasks,
    teams,
    departments,
  };
}

/** re-render every `ms` so relative times ("3 min ago") stay fresh */
export function useNow(ms = 30000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** read a query param without useSearchParams (keeps pages static) */
const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
/**
 * Today's date key (yyyy-mm-dd) for attendance. Attendance is kept on each
 * person's own calendar, so pass whose day it is; without one, the company's.
 */
export function useOrgToday(now: Date, personId?: string) {
  const tz = useApp((s) => {
    const own = personId ? s.people.find((p) => p.id === personId)?.schedule?.timezone : undefined;
    return own || s.settings.timezone;
  });
  return localDate(now, tz);
}

export function useQueryParam(name: string) {
  return React.useSyncExternalStore(
    subscribeUrl,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
