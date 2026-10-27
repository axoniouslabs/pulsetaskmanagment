/**
 * Who may do what (spec §17), checked on the server for every command.
 * Hiding a button is a convenience; this is the rule.
 */
import type { Task } from "@/lib/types";
import { scopePeople } from "@/lib/selectors";
import type { Command } from "./commands";
import { membersOf, type World } from "./world";

export type Decision = { ok: true } | { ok: false; error: string };
const allow: Decision = { ok: true };
const deny = (error: string): Decision => ({ ok: false, error });

export function authorize(w: World, actorId: string, cmd: Command): Decision {
  const me = w.people.find((p) => p.id === actorId);
  if (!me || me.active === false) return deny("Your account is not active. Ask the owner to check it.");
  const isOwner = me.role === "owner";
  const scope = new Set(scopePeople(w, me.role, actorId).map((p) => p.id));
  const manages = (personId: string) => isOwner || (me.role === "manager" && scope.has(personId) && personId !== actorId) || false;
  const headsDept = (depId: string) => isOwner || (me.role === "manager" && w.departments.some((d) => d.id === depId && d.headId === actorId));
  const person = (id: string) => w.people.find((p) => p.id === id && p.active !== false);

  const task = (id: string): Task | undefined => w.tasks.find((t) => t.id === id);
  const canSeeTask = (t: Task) =>
    isOwner || t.assigneeId === actorId || t.reviewerId === actorId || t.createdById === actorId || t.blockedOwnerId === actorId || t.watcherIds.includes(actorId) || manages(t.assigneeId);
  const assigneeOnly = (taskId: string, what: string): Decision => {
    const t = task(taskId);
    if (!t) return deny("That task no longer exists.");
    return t.assigneeId === actorId ? allow : deny(`Only ${w.people.find((p) => p.id === t.assigneeId)?.name.split(" ")[0] ?? "the assignee"} can ${what}.`);
  };
  const managerOf = (taskId: string, what: string): Decision => {
    const t = task(taskId);
    if (!t) return deny("That task no longer exists.");
    return isOwner || manages(t.assigneeId) || t.createdById === actorId ? allow : deny(`You can't ${what} for someone outside your team.`);
  };

  switch (cmd.type) {
    case "createTask": {
      // a unit can be given work only by whoever runs it (or a level above)
      const runsUnit = (unitType: string, unitId: string): Decision => {
        if (unitType === "team") {
          const team = w.teams.find((x) => x.id === unitId);
          if (!team) return deny("Pick the team.");
          return isOwner || team.leadId === actorId || headsDept(team.departmentId) ? allow : deny("You can give work only to teams you run.");
        }
        if (unitType === "department") {
          if (!w.departments.some((d) => d.id === unitId)) return deny("Pick the department.");
          return headsDept(unitId) ? allow : deny("Only the owner or the department's head can give work to the whole department.");
        }
        const g = w.groups.find((x) => x.id === unitId);
        if (!g) return deny("Pick the group.");
        return isOwner || g.ownerId === actorId ? allow : deny("Only the group's owner can give work to it.");
      };
      if (cmd.input.pool) {
        if (me.role === "employee") return deny("Only managers and the owner can send work to a team.");
        return runsUnit(cmd.input.pool.unitType, cmd.input.pool.unitId);
      }
      const target = cmd.input.assigneeId || (cmd.input.projectId ? (w.projects.find((p) => p.id === cmd.input.projectId)?.defaultAssigneeId ?? "") : "");
      if (cmd.input.claim) {
        if (me.role === "employee") return deny("Only managers and the owner can offer tasks to a team.");
        if (target !== actorId && !manages(target)) return deny("You can offer tasks only to teams you run.");
        return runsUnit(cmd.input.claim.unitType, cmd.input.claim.unitId);
      }
      if (!target) return deny("Pick who owns this task.");
      if (cmd.input.reviewerId && !person(cmd.input.reviewerId)) return deny("Pick a reviewer who is still in the company.");
      if (cmd.input.reviewerId && me.role === "employee" && cmd.input.reviewerId !== actorId) {
        // an employee's own task is reviewed by their manager; they don't choose
        return deny("Your own tasks are reviewed by your manager.");
      }
      if (target === actorId || isOwner || manages(target)) return allow;
      return deny("You can assign tasks to yourself and to people in your team only.");
    }
    case "routeTask": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return t.assigneeId === actorId ? allow : deny("Only the person it was sent to can pass it on.");
    }
    case "addTimeEntry": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return t.assigneeId === actorId || manages(t.assigneeId) ? allow : deny("Only the assignee or their manager can add time to this task.");
    }
    case "editComment": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return canSeeTask(t) ? allow : deny("You can only edit comments on tasks you're part of.");
    }
    case "editTask": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      // the assignee may rewrite their own task's description; everything else is the manager's
      const keys = Object.keys(cmd.patch).filter((k) => (cmd.patch as Record<string, unknown>)[k] !== undefined);
      if (t.assigneeId === actorId && keys.length > 0 && keys.every((k) => k === "description")) return allow;
      const m = managerOf(cmd.taskId, "edit tasks");
      if (!m.ok) return m;
      if (cmd.patch.reviewerId && !person(cmd.patch.reviewerId)) return deny("Pick a reviewer who is still in the company.");
      return allow;
    }
    case "setWatching":
    case "addLink": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return canSeeTask(t) ? allow : deny("You can only follow tasks you can see.");
    }
    case "archiveTask":
      return managerOf(cmd.taskId, "archive tasks");
    case "setProgress":
      return assigneeOnly(cmd.taskId, "update its progress");
    case "escalateReview": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return t.reviewerId === actorId || manages(t.assigneeId) ? allow : deny("Only the reviewer can pass a review up.");
    }
    case "saveTemplate": {
      if (me.role === "employee") return deny("Only managers and the owner can save templates.");
      const existing = w.templates.find((x) => x.id === cmd.id);
      return !existing || existing.createdById === actorId || isOwner ? allow : deny("Only the person who made this template can change it.");
    }
    case "deleteTemplate": {
      const tpl = w.templates.find((x) => x.id === cmd.id);
      if (!tpl) return deny("That template no longer exists.");
      return tpl.createdById === actorId || isOwner ? allow : deny("Only the person who made this template can delete it.");
    }
    case "reassign": {
      const allowed = managerOf(cmd.taskId, "hand over tasks");
      if (!allowed.ok) return allowed;
      if (!person(cmd.toId)) return deny("Pick someone who is still in the company.");
      return isOwner || cmd.toId === actorId || manages(cmd.toId) ? allow : deny("You can hand tasks only to people in your team.");
    }
    case "publishDraft":
    case "changeDeadline":
    case "cancel":
      return managerOf(cmd.taskId, cmd.type === "cancel" ? "cancel tasks" : cmd.type === "changeDeadline" ? "change deadlines" : "publish tasks");

    case "claimTask": {
      const t = task(cmd.taskId);
      if (!t?.groupClaim) return deny("This task isn't open to claim.");
      if (t.groupClaim.unitType && t.groupClaim.unitId) {
        return isOwner || membersOf(w, t.groupClaim.unitType, t.groupClaim.unitId).includes(actorId) ? allow : deny(`Only people in ${t.groupClaim.unitName} can claim this task.`);
      }
      const lead = w.people.find((p) => p.id === t.assigneeId);
      const sameTeam = lead && (me.teamId === lead.teamId || w.teams.some((tm) => tm.leadId === lead.id && tm.id === me.teamId));
      return sameTeam || isOwner ? allow : deny("Only people in that team can claim this task.");
    }

    case "acknowledge":
      return assigneeOnly(cmd.taskId, "acknowledge this task");
    case "start":
      return assigneeOnly(cmd.taskId, "start this task");
    case "snooze":
      return assigneeOnly(cmd.taskId, "snooze its reminders");
    case "block":
      if (cmd.blockerOwnerId && !person(cmd.blockerOwnerId)) return deny("Pick who you're waiting on from the people in your company.");
      return assigneeOnly(cmd.taskId, "mark this task as blocked");
    case "submit":
      return assigneeOnly(cmd.taskId, "submit this task");
    case "requestDeadline":
      return assigneeOnly(cmd.taskId, "ask for more time");
    case "addAttachment": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return canSeeTask(t) ? allow : deny("You can only add files to tasks you're part of.");
    }

    case "unblock": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return t.assigneeId === actorId || t.blockedOwnerId === actorId || t.reviewerId === actorId || manages(t.assigneeId)
        ? allow
        : deny("Only the assignee, the person blocking it or their manager can clear this.");
    }

    case "approve":
    case "reject": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      if (t.assigneeId === actorId && !isOwner) return deny("You can't review your own work.");
      return t.reviewerId === actorId || manages(t.assigneeId) ? allow : deny("Only the reviewer or their manager can review this work.");
    }

    case "decideDeadline": {
      const r = w.deadlineRequests.find((d) => d.id === cmd.requestId);
      const t = r && task(r.taskId);
      if (!t) return deny("That request no longer exists.");
      return t.reviewerId === actorId || manages(t.assigneeId) ? allow : deny("Only the reviewer or their manager can decide this.");
    }

    case "toggleSubtask":
    case "addSubtask": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return t.assigneeId === actorId || manages(t.assigneeId) || t.createdById === actorId ? allow : deny("Only the assignee or their manager can change the checklist.");
    }

    case "addComment": {
      const t = task(cmd.taskId);
      if (!t) return deny("That task no longer exists.");
      return canSeeTask(t) ? allow : deny("You can only comment on tasks you're part of.");
    }

    case "stopTimer":
    case "startBreak":
    case "endBreak":
    case "markRead":
    case "markAllRead":
    case "readAnnouncement":
    case "checkIn":
    case "checkOut":
    case "requestLeave":
    case "setPref":
    case "setDayOrder":
    case "setSavedViews":
      return allow; // these only ever touch the actor's own records

    case "askQuestion":
      return cmd.toId !== actorId ? allow : deny("Pick someone else to ask.");
    case "answerQuestion": {
      const q = w.questions.find((x) => x.id === cmd.id);
      if (!q) return deny("That question no longer exists.");
      return q.toId === actorId || isOwner ? allow : deny("Only the person who was asked can answer.");
    }

    case "postAnnouncement": {
      const ch = w.channels.find((c) => c.id === cmd.channelId);
      if (!ch) return deny("That channel no longer exists.");
      if (ch.kind === "task_feed") return deny("Task feeds are written by Pulse only.");
      if (isOwner) return allow;
      if (ch.unitType === "org") return deny("Only the owner posts company notices.");
      const runs =
        (ch.unitType === "department" && w.departments.some((d) => d.id === ch.unitId && d.headId === actorId)) ||
        (ch.unitType === "team" && w.teams.some((t) => t.id === ch.unitId && t.leadId === actorId)) ||
        (ch.unitType === "group" && w.groups.some((g) => g.id === ch.unitId && g.ownerId === actorId));
      if (runs) return allow;
      // an open channel is the unit's own noticeboard: any member may post there
      if (ch.kind === "open" && membersOf(w, ch.unitType, ch.unitId).includes(actorId)) return allow;
      return deny("Only the head of this unit can post notices here.");
    }
    case "remindAnnouncement": {
      const a = w.announcements.find((x) => x.id === cmd.id);
      const ch = a && w.channels.find((c) => c.id === a.channelId);
      if (!ch) return deny("That notice no longer exists.");
      const runs =
        isOwner ||
        a.authorId === actorId ||
        (ch.unitType === "department" && w.departments.some((d) => d.id === ch.unitId && d.headId === actorId)) ||
        (ch.unitType === "team" && w.teams.some((t) => t.id === ch.unitId && t.leadId === actorId)) ||
        (ch.unitType === "group" && w.groups.some((g) => g.id === ch.unitId && g.ownerId === actorId));
      return runs ? allow : deny("Only whoever posted the notice, or runs this unit, can send a reminder.");
    }
    case "ackAnnouncement": {
      const a = w.announcements.find((x) => x.id === cmd.id);
      const ch = a && w.channels.find((c) => c.id === a.channelId);
      if (!ch) return deny("That notice no longer exists.");
      return isOwner || membersOf(w, ch.unitType, ch.unitId).includes(actorId) ? allow : deny("This notice isn't for you.");
    }

    case "decideLeave": {
      const l = w.leaves.find((x) => x.id === cmd.id);
      if (!l) return deny("That request no longer exists.");
      return manages(l.personId) ? allow : deny("Only their manager or the owner can decide leave.");
    }
    case "setOnLeave":
      return cmd.personId !== actorId && manages(cmd.personId) ? allow : deny("Ask your manager for leave from Time & attendance. Only a manager or the owner can mark someone as away.");

    case "updateSettings":
    case "addHoliday":
    case "removeHoliday":
      return isOwner ? allow : deny("Only the owner can change company settings.");
    case "addDepartment":
    case "setDepartmentHead": {
      if (!isOwner) return deny("Only the owner can change company settings.");
      const p = person(cmd.type === "addDepartment" ? cmd.headId : cmd.personId);
      return p ? allow : deny("Pick a head who is still in the company.");
    }

    case "addTeam": {
      if (!headsDept(cmd.departmentId)) return deny("Only the owner or the head of this department can add teams.");
      const lead = person(cmd.leadId);
      if (!lead) return deny("Pick a team lead who is still in the company.");
      return isOwner || (lead.role !== "owner" && lead.departmentId === cmd.departmentId) ? allow : deny("Pick a team lead from your own department.");
    }
    case "setTeamLead": {
      const team = w.teams.find((t) => t.id === cmd.teamId);
      if (!team || !headsDept(team.departmentId)) return deny("Only the owner or the head of this department can choose team leads.");
      const p = person(cmd.personId);
      if (!p) return deny("Pick a team lead who is still in the company.");
      return isOwner || (p.role !== "owner" && p.departmentId === team.departmentId) ? allow : deny("Only the owner can bring someone in from another department.");
    }
    case "movePerson": {
      const team = w.teams.find((t) => t.id === cmd.teamId);
      const p = w.people.find((x) => x.id === cmd.personId);
      if (!team || !p) return deny("Pick a person and a team.");
      return isOwner || (headsDept(team.departmentId) && headsDept(p.departmentId)) ? allow : deny("Only the owner can move people between departments.");
    }
    case "addProject": {
      if (me.role === "employee") return deny("Only managers and the owner can create projects.");
      if (!person(cmd.leadId)) return deny("Pick a project lead who is still in the company.");
      if (cmd.defaultAssigneeId && !(isOwner || cmd.defaultAssigneeId === actorId || manages(cmd.defaultAssigneeId))) return deny("New tasks can only go automatically to someone you manage.");
      return allow;
    }
    case "editProject": {
      const pr = w.projects.find((p) => p.id === cmd.projectId);
      if (!pr) return deny("That project no longer exists.");
      if (!isOwner && pr.leadId !== actorId) return deny("Only the owner or the project's lead can change it.");
      if (cmd.patch.leadId && !person(cmd.patch.leadId)) return deny("Pick a project lead who is still in the company.");
      const auto = cmd.patch.defaultAssigneeId;
      if (auto && !(isOwner || auto === actorId || manages(auto))) return deny("New tasks can only go automatically to someone you manage.");
      return allow;
    }
    case "updateDepartment": {
      if (cmd.patch.name !== undefined && !isOwner) return deny("Only the owner can rename a department.");
      return headsDept(cmd.departmentId) ? allow : deny("Only the owner or the department's head can change its rules.");
    }
    case "setPersonSchedule": {
      const p = w.people.find((x) => x.id === cmd.personId);
      if (!p) return deny("That person no longer exists.");
      if (isOwner || manages(p.id)) return allow;
      if (p.id === actorId) {
        // anyone may set their own time zone (working remotely); their hours are set by their manager
        const cur = p.schedule ?? {};
        const next = cmd.schedule ?? {};
        const same = (k: "workDays" | "workStart" | "workEnd") => JSON.stringify(cur[k] ?? null) === JSON.stringify(next[k] ?? null);
        return same("workDays") && same("workStart") && same("workEnd") ? allow : deny("Your working hours are set by your manager. You can change your own time zone.");
      }
      return deny("Only their manager or the owner can change someone's working hours.");
    }
    case "setBackup":
      return manages(cmd.personId) ? allow : deny("Only their manager or the owner can choose who covers for someone.");
    case "setSecondaryTeams": {
      const p = w.people.find((x) => x.id === cmd.personId);
      if (!p) return deny("That person no longer exists.");
      if (isOwner) return allow;
      const ok = headsDept(p.departmentId) && cmd.teamIds.every((id) => w.teams.find((t) => t.id === id)?.departmentId === p.departmentId);
      return ok ? allow : deny("Only the owner can attach someone to a team in another department.");
    }
    case "addGroup":
      if (me.role === "employee") return deny("Only managers and the owner can create groups.");
      return cmd.memberIds.every((id) => person(id)) ? allow : deny("Pick group members who are still in the company.");

    default:
      return deny("This action isn't allowed.");
  }
}
