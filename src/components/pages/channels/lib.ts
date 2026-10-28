"use client";

import * as React from "react";
import { Activity, Lock, Megaphone, Users, UsersRound, type LucideIcon } from "lucide-react";
import { channelMembersOf } from "@/lib/store";
import type { Announcement, ChannelSpace, Department, Group, Person, Role, Team } from "@/lib/types";

export interface Org {
  people: Person[];
  teams: Team[];
  groups: Group[];
  departments: Department[];
}

/** plain-text type shown under each channel name */
export function channelType(c: ChannelSpace): {
  label: string;
  icon: LucideIcon;
} {
  if (c.kind === "announcement") return { label: "Notices", icon: Megaphone };
  if (c.kind === "task_feed") return { label: "Task feed", icon: Activity };
  if (c.kind === "private") return { label: "Private", icon: Lock };
  if (c.unitType === "group") return { label: "Group", icon: UsersRound };
  return { label: "Team", icon: Users };
}

const ORDER = (c: ChannelSpace) => (c.kind === "announcement" ? 0 : c.kind === "private" ? 1 : c.kind === "task_feed" ? 4 : c.unitType === "group" ? 3 : 2);
const LEVEL = { org: 0, department: 1, team: 2, group: 3 } as const;
export const sortChannels = (list: ChannelSpace[]) =>
  [...list].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || ORDER(a) - ORDER(b) || LEVEL[a.unitType] - LEVEL[b.unitType] || a.name.localeCompare(b.name));

export const channelMembers = (org: Org, c: ChannelSpace) => channelMembersOf(org, c);

/** the person who runs the unit behind a channel */
export function channelLead(org: Org, c: ChannelSpace): string | undefined {
  if (c.unitType === "org") return org.people.find((p) => p.role === "owner")?.id;
  if (c.unitType === "department") return org.departments.find((d) => d.id === c.unitId)?.headId;
  if (c.unitType === "team") return org.teams.find((t) => t.id === c.unitId)?.leadId;
  return org.groups.find((g) => g.id === c.unitId)?.ownerId;
}

/**
 * Who may post: the owner anywhere except task feeds; whoever runs a unit in its
 * announcement channel; any member in an open channel. Company-wide notices are owner-only.
 */
export function canPostIn(org: Org, c: ChannelSpace, role: Role, meId: string) {
  if (c.kind === "task_feed" || c.archivedAt) return false;
  if (c.kind === "private") return channelMembers(org, c).includes(meId);
  if (role === "owner") return true;
  if (c.unitType === "team" && org.departments.some((d) => d.headId === meId && org.teams.some((t) => t.id === c.unitId && t.departmentId === d.id))) return true;
  const runsIt = channelLead(org, c) === meId;
  // open channels: any member posts; announcement channels: only whoever runs the unit
  if (c.kind === "open") return runsIt || channelMembers(org, c).includes(meId);
  return runsIt;
}

/** everyone a notice is meant for (members minus the author) */
export const audienceOf = (members: string[], a: Announcement) => members.filter((id) => id !== a.authorId);

export interface ChannelCounts {
  needsOk: number;
  unread: number;
  latestAt?: string;
}

export function countsFor(c: ChannelSpace, members: string[], announcements: Announcement[], meId: string): ChannelCounts {
  const mine = announcements.filter((a) => a.channelId === c.id);
  const inAudience = members.includes(meId);
  return {
    needsOk: inAudience ? mine.filter((a) => a.requiresAck && a.authorId !== meId && !a.ackBy[meId]).length : 0,
    unread: mine.filter((a) => a.authorId !== meId && !a.readBy[meId]).length,
    latestAt: mine.reduce<string | undefined>((m, a) => (!m || a.at > m ? a.at : m), undefined),
  };
}

/* ---------- media query without effects (keeps the list/detail switch honest on phones) ---------- */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** runs the unit behind a channel (or the company, for the owner) */
export function runsChannel(org: Org, c: ChannelSpace, role: Role, meId: string) {
  if (c.kind === "private") return c.createdById === meId;
  if (role === "owner") return true;
  if (channelLead(org, c) === meId) return true;
  return c.unitType === "team" && org.departments.some((d) => d.headId === meId && org.teams.some((t) => t.id === c.unitId && t.departmentId === d.id));
}

/** pinning: whoever runs the unit; any member of an open or private channel */
export function canPinIn(org: Org, c: ChannelSpace, role: Role, meId: string) {
  if (c.kind === "task_feed" || c.archivedAt) return false;
  if (runsChannel(org, c, role, meId)) return true;
  return c.kind !== "announcement" && channelMembers(org, c).includes(meId);
}
