"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ArrowRightLeft, ChevronDown, Hash, Layers, MoreHorizontal, Pencil, Plus, SlidersHorizontal, UserMinus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { departmentRulesSummary } from "./rules-projects";
import type { ChannelSpace, Department, Group, Person, Team } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Select } from "@/components/ui/primitives";
import { EmptyState, Panel } from "@/components/app/page-header";
import { Avatar, AvatarStack } from "@/components/app/avatar";
import { WorkTag } from "@/components/pages/team/shared";

/* ---------------- departments ---------------- */
export function DepartmentList({
  departments,
  teams,
  people,
  onAddTeam,
  onMove,
  onChangeHead,
  onChangeLead,
  onRules,
  isOwner = true,
  meId = "",
}: {
  departments: Department[];
  teams: Team[];
  people: Person[];
  onAddTeam: (d: Department) => void;
  onMove: (p: Person) => void;
  onChangeHead: (d: Department) => void;
  onChangeLead: (t: Team) => void;
  onRules: (d: Department) => void;
  isOwner?: boolean;
  meId?: string;
}) {
  return (
    <div className="space-y-4">
      {departments.map((d) => (
        <DepartmentPanel
          key={d.id}
          department={d}
          teams={teams.filter((t) => t.departmentId === d.id)}
          people={people}
          onAddTeam={() => onAddTeam(d)}
          onMove={onMove}
          onChangeHead={() => onChangeHead(d)}
          onChangeLead={onChangeLead}
          onRules={() => onRules(d)}
          isOwner={isOwner}
          meId={meId}
        />
      ))}
      <p className="flex items-start gap-2.5 px-1 text-[13px] leading-snug text-muted">
        <Layers className="mt-0.5 size-4 shrink-0 text-faint" />
        The structure stops at three levels: department, team, person. Deeper trees slow escalation down, so use a group for anything that cuts across.
      </p>
    </div>
  );
}

function DepartmentPanel({
  department: d,
  teams,
  people,
  onAddTeam,
  onMove,
  onChangeHead,
  onChangeLead,
  onRules,
  isOwner,
  meId,
}: {
  department: Department;
  teams: Team[];
  people: Person[];
  onAddTeam: () => void;
  onMove: (p: Person) => void;
  onChangeHead: () => void;
  onChangeLead: (t: Team) => void;
  onRules: () => void;
  isOwner: boolean;
  meId: string;
}) {
  const heads = isOwner || d.headId === meId;
  const act = useApp((s) => s.act);
  const windUp = (cmd: Parameters<typeof act>[0], done: string) => act(cmd).ok && toast.success(done, { description: "Its channels and history stay readable." });
  const rules = departmentRulesSummary(d);
  const head = people.find((p) => p.id === d.headId);
  const members = people.filter((p) => p.departmentId === d.id);
  return (
    <Panel>
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h3 className="font-display text-[19px] font-semibold leading-tight text-text">{d.name}</h3>
          {d.description && <p className="mt-0.5 text-[13.5px] text-muted">{d.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            {head ? (
              <span className="flex items-center gap-2">
                <Avatar person={head} size="sm" />
                <span>
                  <span className="font-medium text-text">{head.name}</span> <span className="text-muted">heads the department</span>
                </span>
              </span>
            ) : (
              <span className="text-muted">No head set</span>
            )}
            <span className="tabular text-muted">{plural(members.length, "person", "people")}</span>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{rules ? `Own rules: ${rules}.` : "Follows the company's hours and rules."}</p>
        </div>
        {heads && (
          <div className="flex flex-wrap gap-2 self-start">
            <Button size="sm" variant="ghost" onClick={onRules}>
              <SlidersHorizontal /> Rules
            </Button>
            {isOwner && (
              <Button size="sm" variant="ghost" onClick={onChangeHead}>
                <UserRound /> Change head
              </Button>
            )}
            {isOwner && teams.length === 0 && members.length <= 1 && (
              <Button size="sm" variant="ghost" onClick={() => windUp({ type: "archiveDepartment", departmentId: d.id }, `${d.name} wound up`)}>
                <Archive /> Wind up
              </Button>
            )}
            <Button size="sm" onClick={onAddTeam}>
              <Plus /> Add team
            </Button>
          </div>
        )}
      </div>

      {teams.length ? (
        <ul className="border-t border-line">
          {teams.map((t) => (
            <TeamRow
              key={t.id}
              team={t}
              people={people}
              headId={d.headId}
              onMove={onMove}
              onChangeLead={() => onChangeLead(t)}
              heads={heads}
              runs={heads || t.leadId === meId}
              isOwner={isOwner}
              defaultOpen={!heads && t.leadId === meId}
            />
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-[13px] text-muted">No teams yet. Add one, then move people into it from their current team.</p>
      )}
    </Panel>
  );
}

function TeamRow({
  team,
  people,
  headId,
  onMove,
  onChangeLead,
  heads,
  runs,
  isOwner,
  defaultOpen,
}: {
  team: Team;
  people: Person[];
  headId: string;
  onMove: (p: Person) => void;
  onChangeLead: () => void;
  /** owner or the department's head: can move people and change the lead */
  heads: boolean;
  /** also the team's own lead: can add and remove people who work here alongside their home team */
  runs: boolean;
  isOwner: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const act = useApp((s) => s.act);
  const allTeams = useApp((s) => s.teams);
  const lead = people.find((p) => p.id === team.leadId);
  const members = people.filter((p) => p.teamId === team.id).sort((a, b) => (a.id === team.leadId ? -1 : b.id === team.leadId ? 1 : a.name.localeCompare(b.name)));
  const also = people.filter((p) => p.teamId !== team.id && p.secondaryTeamIds?.includes(team.id));
  const eligible = people.filter((p) => p.role !== "owner" && p.teamId !== team.id && !p.secondaryTeamIds?.includes(team.id) && (isOwner || p.departmentId === team.departmentId));
  const attach = (personId: string, member: boolean) => {
    const p = people.find((x) => x.id === personId);
    if (act({ type: "setTeamMember", teamId: team.id, personId, member }).ok)
      toast.success(member ? `${p?.name.split(" ")[0]} added to ${team.name}` : `${p?.name.split(" ")[0]} taken off ${team.name}`);
  };
  const listId = `team-${team.id}-members`;

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-hover sm:px-5"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-faint transition-transform", !open && "-rotate-90")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium text-text">{team.name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
            {lead ? (
              <>
                <Avatar person={lead} size="xs" /> Led by {lead.name}
              </>
            ) : (
              "No lead set"
            )}
          </span>
        </span>
        <span className="hidden sm:block">
          <AvatarStack ids={members.map((m) => m.id)} max={5} />
        </span>
        <span className="tabular w-[70px] shrink-0 text-right text-[12.5px] text-muted">{plural(members.length, "member")}</span>
      </button>

      {open && (
        <ul id={listId} className="border-t border-line bg-hover pb-1">
          {runs && (
            <li className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2 sm:px-5">
              {eligible.length > 0 && (
                <Select value="" onChange={(e) => e.target.value && attach(e.target.value, true)} className="h-9 w-auto max-w-full text-[13px]" aria-label={`Add someone to ${team.name}`}>
                  <option value="">Add someone who also works here</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.title}
                    </option>
                  ))}
                </Select>
              )}
              {heads && (
                <Button size="sm" variant="ghost" onClick={onChangeLead}>
                  <UserRound /> Change lead
                </Button>
              )}
              {heads && also.length === 0 && members.every((m) => m.id === team.leadId) && (
                <Button size="sm" variant="ghost" onClick={() => act({ type: "archiveTeam", teamId: team.id }).ok && toast.success(`${team.name} wound up`)}>
                  <Archive /> Wind up team
                </Button>
              )}
            </li>
          )}
          {members.length ? (
            members.map((p) => <MemberRow key={p.id} person={p} isLead={p.id === team.leadId} isHead={p.id === headId} teamName={team.name} onMove={heads ? () => onMove(p) : undefined} />)
          ) : (
            <li className="px-5 py-3 pl-12 text-[13px] text-muted">Nobody in this team yet. Move people in from another team&apos;s list.</li>
          )}
          {also.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 pl-11 pr-2 sm:pl-12 sm:pr-3">
              <Avatar person={p} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-text">{p.name}</p>
                <p className="truncate text-[12.5px] text-muted">
                  {p.title}. Also works here; home team is {allTeams.find((t) => t.id === p.teamId)?.name ?? "not set"}.
                </p>
              </div>
              {runs && (
                <Button size="sm" variant="ghost" onClick={() => attach(p.id, false)} aria-label={`Take ${p.name} off ${team.name}`}>
                  <UserMinus /> Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function MemberRow({ person: p, isLead, isHead, teamName, onMove }: { person: Person; isLead: boolean; isHead: boolean; teamName: string; onMove?: () => void }) {
  const locked = isLead || isHead;
  return (
    <li className="flex items-center gap-3 py-2 pl-11 pr-2 sm:pl-12 sm:pr-3">
      <Avatar person={p} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[14px] font-medium text-text">{p.name}</span>
          {isHead ? <span className="text-[12px] font-medium text-ink">Department head</span> : isLead ? <span className="text-[12px] font-medium text-ink">Team lead</span> : null}
        </p>
        <p className="truncate text-[12.5px] text-muted">{p.title}</p>
      </div>
      <WorkTag person={p} className="hidden sm:inline-flex" />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-64">
          {onMove && (
            <MenuItem disabled={locked} onSelect={onMove}>
              <ArrowRightLeft /> Move to another team
            </MenuItem>
          )}
          {onMove && locked && (
            <p className="px-2.5 pb-2 pt-0.5 text-[12px] leading-snug text-muted">
              {p.name.split(" ")[0]} {isHead ? "heads this department" : `leads ${teamName}`}. Give the role to someone else before moving them.
            </p>
          )}
          {onMove && <MenuSeparator />}
          <MenuItem asChild>
            <Link href={`/team?person=${p.id}`}>
              <UserRound /> Open in Team
            </Link>
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

/* ---------------- groups ---------------- */
export function GroupList({
  groups,
  people,
  channels,
  onCreate,
  onEdit,
  canManage,
}: {
  groups: Group[];
  people: Person[];
  channels: ChannelSpace[];
  onCreate?: () => void;
  onEdit: (g: Group) => void;
  canManage: (g: Group) => boolean;
}) {
  const act = useApp((s) => s.act);
  const live = groups.filter((g) => !g.archivedAt);
  const archived = groups.filter((g) => g.archivedAt);
  if (!groups.length)
    return (
      <Panel>
        <EmptyState
          icon={Hash}
          title="No groups yet"
          body="Create a group for work that crosses departments, like a big customer or a launch."
          action={
            onCreate ? (
              <Button variant="primary" onClick={onCreate}>
                <Plus /> New group
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  const archive = (g: Group, on: boolean) => {
    if (act({ type: "archiveGroup", groupId: g.id, archived: on }).ok)
      toast.success(on ? `${g.name} archived` : `${g.name} restored`, { description: on ? "Its channel and history stay readable." : undefined });
  };
  const row = (g: Group) => {
    const owner = people.find((p) => p.id === g.ownerId);
    const channel = channels.find((c) => c.unitType === "group" && c.unitId === g.id && c.kind !== "private");
    return (
      <li key={g.id} className={cn("flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6 sm:px-5", g.archivedAt && "opacity-70")}>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium text-text">
            {g.name}
            {g.archivedAt && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-muted">Archived</span>}
          </p>
          {g.description && <p className="mt-0.5 text-[13px] text-muted">{g.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
            {owner && (
              <span className="flex items-center gap-1.5">
                <Avatar person={owner} size="xs" /> Run by {owner.name}
              </span>
            )}
            {channel ? (
              <Link href={`/channels?channel=${channel.id}`} className="flex items-center gap-1 hover:text-text hover:underline">
                <Hash className="size-3.5" /> {channel.name}
              </Link>
            ) : (
              <span className="flex items-center gap-1 text-faint">
                <Hash className="size-3.5" /> No channel yet
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <AvatarStack ids={g.memberIds} max={5} />
          <span className="tabular text-[12.5px] text-muted">{plural(g.memberIds.length, "member")}</span>
          {canManage(g) && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${g.name}`}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {!g.archivedAt && (
                  <MenuItem onSelect={() => onEdit(g)}>
                    <Pencil /> Edit name and members
                  </MenuItem>
                )}
                <MenuItem onSelect={() => archive(g, !g.archivedAt)}>
                  {g.archivedAt ? <ArchiveRestore /> : <Archive />} {g.archivedAt ? "Restore group" : "Archive group"}
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </li>
    );
  };
  return (
    <>
      <Panel>
        <ul>{live.map(row)}</ul>
        {!live.length && <p className="px-5 py-4 text-[13px] text-muted">Every group is archived.</p>}
      </Panel>
      {archived.length > 0 && (
        <details className="mt-3 rounded-[var(--radius-lg)] border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-medium sm:px-5">Archived groups ({archived.length})</summary>
          <ul className="border-t border-line">{archived.map(row)}</ul>
        </details>
      )}
    </>
  );
}
