import type {
  Activity,
  Announcement,
  AppNotification,
  AttendanceDay,
  ChannelSpace,
  DeadlineRequest,
  Department,
  Group,
  Leave,
  OrgSettings,
  Person,
  Project,
  Question,
  Task,
  TaskTemplate,
  Team,
  Timer,
} from "@/lib/types";
import type { DailyStat } from "@/lib/seed";

/**
 * Everything one organisation knows, in the shape the screens use.
 * The server loads it from the database, the browser receives a scoped copy,
 * and the same command code runs against both.
 */
export interface World {
  orgId: string;
  settings: OrgSettings;
  people: Person[];
  departments: Department[];
  teams: Team[];
  groups: Group[];
  projects: Project[];
  tasks: Task[];
  /** newest first; the server only appends */
  activity: Activity[];
  /** newest first */
  notifications: AppNotification[];
  channels: ChannelSpace[];
  announcements: Announcement[];
  attendance: AttendanceDay[];
  leaves: Leave[];
  questions: Question[];
  deadlineRequests: DeadlineRequest[];
  stats: DailyStat[];
  templates: TaskTemplate[];
  timers: Record<string, Timer | undefined>;
  prefs: Record<string, Record<string, boolean>>;
  dayOrder: Record<string, string[]>;
}

export const WORLD_KEYS = [
  "people",
  "departments",
  "teams",
  "groups",
  "projects",
  "tasks",
  "activity",
  "notifications",
  "channels",
  "announcements",
  "attendance",
  "leaves",
  "questions",
  "deadlineRequests",
  "stats",
  "templates",
] as const;

export const emptyWorld = (): World => ({
  orgId: "",
  settings: {
    name: "",
    timezone: "Asia/Karachi",
    workDays: [1, 2, 3, 4, 5, 6],
    workStart: "09:00",
    workEnd: "18:00",
    defaultReminder: {
      intervalMin: 30,
      window: "working",
      dailyCap: 12,
      channels: ["push", "inapp"],
      quietAfterAckMin: 60,
    },
    escalation: {
      l1Ignored: 3,
      l2Ignored: 5,
      l3Ignored: 8,
      l4HoursPastDue: 24,
    },
    approvalByDefault: true,
    snoozeMaxPerDay: 3,
    reviewSlaHours: 24,
    holidays: [],
    digestMorning: "09:00",
    digestEvening: "18:30",
    retentionMonths: 24,
  },
  people: [],
  departments: [],
  teams: [],
  groups: [],
  projects: [],
  tasks: [],
  activity: [],
  notifications: [],
  channels: [],
  announcements: [],
  attendance: [],
  leaves: [],
  questions: [],
  deadlineRequests: [],
  stats: [],
  templates: [],
  timers: {},
  prefs: {},
  dayOrder: {},
});

/** everyone who belongs to a unit, used for channel audiences */
export function membersOf(w: Pick<World, "people" | "teams" | "groups">, unitType: string, unitId: string): string[] {
  if (unitType === "org") return w.people.map((p) => p.id);
  if (unitType === "department") return w.people.filter((p) => p.departmentId === unitId || p.role === "owner").map((p) => p.id);
  if (unitType === "team") return w.people.filter((p) => p.teamId === unitId).map((p) => p.id);
  if (unitType === "group") {
    const g = w.groups.find((x) => x.id === unitId);
    return g ? Array.from(new Set([...g.memberIds, g.ownerId])) : [];
  }
  return [];
}

/** someone who can still act on a notice: in the company and not deactivated */
const activeId = (w: Pick<World, "people">, id: string | undefined) => (id && w.people.some((x) => x.id === id && x.active !== false) ? id : undefined);

export const leadOf = (w: Pick<World, "people" | "teams">, personId: string) => {
  const p = w.people.find((x) => x.id === personId);
  const team = w.teams.find((t) => t.id === p?.teamId);
  return team?.leadId && team.leadId !== personId ? activeId(w, team.leadId) : undefined;
};

export const headOf = (w: Pick<World, "people" | "departments">, personId: string) => {
  const p = w.people.find((x) => x.id === personId);
  const dep = w.departments.find((d) => d.id === p?.departmentId);
  return dep?.headId && dep.headId !== personId ? activeId(w, dep.headId) : undefined;
};

/** who covers for someone who is away: their named backup, else team lead, else department head, else the owner */
export const backupFor = (w: Pick<World, "people" | "teams" | "departments">, personId: string) => {
  const p = w.people.find((x) => x.id === personId);
  const ok = (id?: string) => (id && id !== personId && w.people.some((x) => x.id === id && x.active !== false && !x.onLeave) ? id : undefined);
  return ok(p?.backupId) ?? ok(leadOf(w, personId)) ?? ok(headOf(w, personId)) ?? ok(ownerOf(w));
};

export const ownerOf = (w: Pick<World, "people">) => (w.people.find((p) => p.role === "owner" && p.active !== false) ?? w.people.find((p) => p.role === "owner"))?.id;
