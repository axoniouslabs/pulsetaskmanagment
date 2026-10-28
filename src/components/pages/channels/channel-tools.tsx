"use client";

import * as React from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Bell, BellOff, ExternalLink, FileText, Link2, Loader2, MoreHorizontal, Paperclip, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import type { ChannelSpace } from "@/lib/types";
import { formatWhen } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger, Segmented, Select, Tip } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { WatcherPicker } from "@/components/app/task-fields";

/* ---------- mute ---------- */
export function MuteButton({ channel }: { channel: ChannelSpace }) {
  const muted = useApp((s) => !!s.viewer && !!s.prefs[s.viewer.personId]?.[`mute:${channel.id}`]);
  const act = useApp((s) => s.act);
  const toggle = () => {
    if (act({ type: "setPref", key: `mute:${channel.id}`, value: !muted }).ok)
      toast.success(muted ? `${channel.name} unmuted` : `${channel.name} muted`, {
        description: muted ? undefined : "You'll still hear about notices that need your OK, and anything that mentions you.",
      });
  };
  return (
    <Tip label={muted ? "You only hear about notices that need your OK, and mentions" : "Stop notifications from this channel"}>
      <Button variant="secondary" className="h-10 sm:h-9" onClick={toggle} aria-pressed={muted}>
        {muted ? <BellOff /> : <Bell />} {muted ? "Muted" : "Mute"}
      </Button>
    </Tip>
  );
}

/* ---------- edit / archive ---------- */
export function ChannelMenu({ channel }: { channel: ChannelSpace }) {
  const act = useApp((s) => s.act);
  const [editing, setEditing] = React.useState(false);
  const archive = () => {
    if (act({ type: "archiveChannel", channelId: channel.id, archived: !channel.archivedAt }).ok)
      toast.success(channel.archivedAt ? "Channel restored" : "Channel archived", { description: channel.archivedAt ? undefined : "Its notices stay readable. Nobody can post until you restore it." });
  };
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" className="size-10 px-0 sm:size-9" aria-label="Channel settings">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setEditing(true)}>
            <Pencil /> {channel.kind === "private" ? "Edit name and members" : "Edit name and description"}
          </MenuItem>
          {channel.unitType !== "org" || channel.kind === "private" ? (
            <MenuItem onSelect={archive}>
              {channel.archivedAt ? <ArchiveRestore /> : <Archive />} {channel.archivedAt ? "Restore channel" : "Archive channel"}
            </MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && <EditChannel channel={channel} onDone={() => setEditing(false)} />}
      </Dialog>
    </>
  );
}

function EditChannel({ channel, onDone }: { channel: ChannelSpace; onDone: () => void }) {
  const act = useApp((s) => s.act);
  const [name, setName] = React.useState(channel.name);
  const [description, setDescription] = React.useState(channel.description);
  const [members, setMembers] = React.useState<string[]>((channel.memberIds ?? []).filter((id) => id !== channel.createdById));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act({ type: "editChannel", channelId: channel.id, name, description, ...(channel.kind === "private" ? { memberIds: members } : {}) });
    if (r.ok) {
      toast.success("Channel updated");
      onDone();
    }
  };
  return (
    <DialogContent
      title={`Edit ${channel.name}`}
      description={channel.kind === "private" ? "Only the people you invite can see this channel." : "Who is in it follows the unit, so there's no member list to keep up to date."}
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="Name" htmlFor="ch-name">
          <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="What it's for" htmlFor="ch-desc">
          <Input id="ch-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        {channel.kind === "private" && (
          <Field label="Members" htmlFor="ch-members">
            <WatcherPicker
              id="ch-members"
              value={members}
              onChange={setMembers}
              exclude={channel.createdById ? [channel.createdById] : []}
              addLabel={["Invite someone", "Invite someone else"]}
              removeLabel={(n) => `Remove ${n}`}
            />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/* ---------- new channel ---------- */
export function NewChannelDialog({ open, onOpenChange, onMade }: { open: boolean; onOpenChange: (o: boolean) => void; onMade: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <NewChannel
          onDone={(id) => {
            onOpenChange(false);
            if (id) onMade(id);
          }}
        />
      )}
    </Dialog>
  );
}

function NewChannel({ onDone }: { onDone: (id?: string) => void }) {
  const act = useApp((s) => s.act);
  const role = useApp((s) => s.role);
  const meId = useApp((s) => s.viewer?.personId ?? "");
  const departments = useApp((s) => s.departments);
  const teams = useApp((s) => s.teams);
  const groups = useApp((s) => s.groups);
  // the units this person runs, where they may add channels
  const units = React.useMemo(() => {
    const own = role === "owner";
    const deps = departments.filter((d) => own || d.headId === meId);
    return [
      ...(own ? [{ key: "org:org", label: "Whole company" }] : []),
      ...deps.map((d) => ({ key: `department:${d.id}`, label: `${d.name} (department)` })),
      ...teams.filter((t) => own || t.leadId === meId || deps.some((d) => d.id === t.departmentId)).map((t) => ({ key: `team:${t.id}`, label: `${t.name} (team)` })),
      ...groups.filter((g) => !g.archivedAt && (own || g.ownerId === meId)).map((g) => ({ key: `group:${g.id}`, label: `${g.name} (group)` })),
    ];
  }, [role, meId, departments, teams, groups]);
  const [kind, setKind] = React.useState<"private" | "open" | "announcement">("private");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState(units[0]?.key ?? "org:org");
  const [members, setMembers] = React.useState<string[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [unitType, unitId] = (kind === "private" ? "org:org" : unit).split(":") as [ChannelSpace["unitType"], string];
    const id = `ch_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;
    const r = act({ type: "addChannel", id, name, kind, unitType, unitId, description, memberIds: kind === "private" ? members : undefined });
    if (!r.ok) return;
    toast.success(`${name.trim()} created`);
    onDone(id);
  };

  return (
    <DialogContent title="New channel" description="Teams, departments and groups get their channels automatically. Make one here for anything else.">
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "private", label: "Private" },
            { value: "open", label: "Open" },
            { value: "announcement", label: "Notices only" },
          ]}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />
        <p className="-mt-1 text-[13px] leading-snug text-muted">
          {kind === "private"
            ? "Only the people you invite can see it. For management discussion and anything not for everyone."
            : kind === "open"
              ? "Everyone in the unit can read and post."
              : "Only you and whoever runs the unit can post. Everyone in it reads, and can be asked to acknowledge."}
        </p>
        <Field label="Name" htmlFor="new-ch-name">
          <Input id="new-ch-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "private" ? "e.g. Heads of department" : "e.g. Lahore depot"} maxLength={80} />
        </Field>
        <Field label="What it's for (optional)" htmlFor="new-ch-desc">
          <Input id="new-ch-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        {kind === "private" ? (
          <Field label="Invite" htmlFor="new-ch-members">
            <WatcherPicker id="new-ch-members" value={members} onChange={setMembers} exclude={[meId]} addLabel={["Invite someone", "Invite someone else"]} removeLabel={(n) => `Remove ${n}`} />
          </Field>
        ) : (
          <Field label="For" htmlFor="new-ch-unit" hint="Everyone in this unit is a member, now and as people join or leave.">
            <Select id="new-ch-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || (kind === "private" ? !members.length : !units.length)}>
            <Plus /> Create channel
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/* ---------- pinned resources and shared files ---------- */
export function PinnedPanel({ channel, canPin, canRemove }: { channel: ChannelSpace; canPin: boolean; canRemove: (byId: string) => boolean }) {
  const act = useApp((s) => s.act);
  const people = useApp((s) => s.people);
  const pins = channel.pins ?? [];
  const [adding, setAdding] = React.useState(false);
  if (!pins.length && !canPin) return null;
  return (
    <Panel className="px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-text">
          <Pin className="size-4 text-faint" /> Pinned
        </h3>
        {canPin && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus /> Pin a link or file
          </Button>
        )}
      </div>
      {pins.length ? (
        <ul className="mt-2 divide-y divide-line">
          {pins.map((p) => {
            const href = p.url ?? (p.fileId ? `/api/files/${p.fileId}` : "#");
            const by = people.find((x) => x.id === p.byId);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-muted">
                  {p.fileId ? <FileText className="size-4" /> : <Link2 className="size-4" />}
                </span>
                <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-[14px] font-medium text-text">{p.title}</span>
                  <span className="block truncate text-[12px] text-faint">
                    {p.fileId ? (p.fileName ?? "File") : p.url?.replace(/^https?:\/\//, "")} · {by?.name.split(" ")[0] ?? "Someone"}, {formatWhen(p.at, { withDay: true })}
                  </span>
                </a>
                <ExternalLink className="size-4 shrink-0 text-faint" aria-hidden />
                {canRemove(p.byId) && (
                  <Button size="sm" variant="ghost" className="size-9 px-0" aria-label={`Unpin ${p.title}`} onClick={() => act({ type: "removePin", channelId: channel.id, pinId: p.id })}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] leading-snug text-muted">Pin the things people ask for again and again: SOPs, price lists, contact sheets, templates.</p>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <AddPin channel={channel} onDone={() => setAdding(false)} />}
      </Dialog>
    </Panel>
  );
}

function AddPin({ channel, onDone }: { channel: ChannelSpace; onDone: () => void }) {
  const act = useApp((s) => s.act);
  const load = useApp((s) => s.load);
  const [how, setHow] = React.useState<"link" | "file">("link");
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (how === "link") {
      const r = act({ type: "addPin", channelId: channel.id, title: title || url, url: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}` });
      if (r.ok) onDone();
      return;
    }
    if (!file) return setError("Choose a file.");
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    form.set("channelId", channel.id);
    form.set("title", title || file.name);
    const res = await fetch("/api/files", { method: "POST", body: form }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't upload it. Try again.");
    await load();
    toast.success("Shared with the channel");
    onDone();
  };

  return (
    <DialogContent title={`Pin to ${channel.name}`} description="Everyone in the channel can open it from the top of the page.">
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          value={how}
          onChange={setHow}
          options={[
            { value: "link", label: "A link" },
            { value: "file", label: "A file" },
          ]}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
        />
        {how === "link" ? (
          <Field label="Link" htmlFor="pin-url">
            <Input id="pin-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/..." inputMode="url" />
          </Field>
        ) : (
          <Field label="File" htmlFor="pin-file" hint="Up to 4 MB. Only people in this channel can open it.">
            <Input id="pin-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
        <Field label="Name (optional)" htmlFor="pin-title">
          <Input id="pin-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dealer price list" maxLength={120} />
        </Field>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || (how === "link" ? !url.trim() : !file)}>
            {busy ? <Loader2 className="animate-spin" /> : how === "file" ? <Paperclip /> : <Pin />} Pin it
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
