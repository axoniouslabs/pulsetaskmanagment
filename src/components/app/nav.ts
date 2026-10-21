import {
  Activity,
  BarChart3,
  CheckCheck,
  Clock3,
  Gauge,
  ListTodo,
  Megaphone,
  Network,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "approvals" | "channels" | "today";
}

const ALL: Record<string, NavItem> = {
  overview: { href: "/overview", label: "Overview", icon: Gauge },
  today: { href: "/today", label: "My day", icon: Sun, badge: "today" },
  tasks: { href: "/tasks", label: "Tasks", icon: ListTodo },
  approvals: { href: "/approvals", label: "Approvals", icon: CheckCheck, badge: "approvals" },
  team: { href: "/team", label: "Team", icon: Users },
  organisation: { href: "/organisation", label: "Organisation", icon: Network },
  channels: { href: "/channels", label: "Channels", icon: Megaphone, badge: "channels" },
  time: { href: "/time", label: "Time & attendance", icon: Clock3 },
  reports: { href: "/reports", label: "Reports", icon: BarChart3 },
  activity: { href: "/activity", label: "Activity log", icon: Activity },
  settings: { href: "/settings", label: "Settings", icon: Settings },
};

export const NAV: Record<Role, NavItem[][]> = {
  owner: [
    [ALL.overview, ALL.tasks, ALL.approvals, ALL.team],
    [ALL.channels, ALL.time, ALL.reports, ALL.activity],
    [ALL.organisation, ALL.settings],
  ],
  manager: [
    [ALL.overview, ALL.today, ALL.tasks, ALL.approvals, ALL.team],
    [ALL.channels, ALL.time, ALL.reports, ALL.activity],
  ],
  employee: [
    [ALL.today, { ...ALL.tasks, label: "My tasks" }],
    [ALL.channels, { ...ALL.time, label: "Time & leave" }, { ...ALL.reports, label: "My stats" }, { ...ALL.activity, label: "My history" }],
  ],
};

/** four slots in the phone tab bar; the centre is always "New task" */
export const MOBILE_TABS: Record<Role, NavItem[]> = {
  owner: [ALL.overview, ALL.tasks, ALL.approvals, ALL.team],
  manager: [ALL.overview, ALL.today, ALL.approvals, ALL.tasks],
  employee: [ALL.today, { ...ALL.tasks, label: "Tasks" }, ALL.channels, { ...ALL.time, label: "Time" }],
};

export const HOME: Record<Role, string> = { owner: "/overview", manager: "/overview", employee: "/today" };

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", employee: "Employee" };
