"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { CornerDownLeft, Plus, Search, LogIn, MessageCircleQuestion } from "lucide-react";
import { useApp, useMeId } from "@/lib/store";
import { scopeTasks } from "@/lib/selectors";
import { NAV } from "./nav";
import { Avatar } from "./avatar";
import { StatusIcon } from "./task-bits";

export function CommandPalette() {
  const open = useApp((s) => s.commandOpen);
  const setOpen = useApp((s) => s.setCommandOpen);
  const role = useApp((s) => s.role);
  const meId = useMeId();
  const router = useRouter();
  const allTasks = useApp((s) => s.tasks);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const people = useApp((s) => s.people);
  const groups = useApp((s) => s.groups);
  const tasks = React.useMemo(() => scopeTasks({ tasks: allTasks, people, teams, departments, groups }, role, meId), [allTasks, people, teams, departments, groups, role, meId]);
  const openTask = useApp((s) => s.openTask);
  const openCreate = useApp((s) => s.openCreate);
  const checkIn = useApp((s) => s.checkIn);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useApp.getState().commandOpen);
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) {
        if (!useApp.getState().createOpen && !useApp.getState().commandOpen) {
          e.preventDefault();
          openCreate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, openCreate]);

  const go = (fn: () => void) => {
    setOpen(false);
    setQ("");
    fn();
  };

  const item = "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[14px] text-text data-[selected=true]:bg-sunken";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="motion-overlay fixed inset-0 z-50 bg-ink/25 backdrop-blur-[3px]" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-pop motion-palette" aria-describedby={undefined}>
          <D.Title className="sr-only">Search and commands</D.Title>
          <Command loop>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-[18px] text-faint" />
              <Command.Input value={q} onValueChange={setQ} placeholder="Search tasks, people or pages" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
            </div>
            <Command.List className="thin-scrollbar max-h-[min(440px,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[14px] text-muted">
                Nothing matches “{q}”.{" "}
                <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => go(() => openCreate({ title: q }))}>
                  Create it as a task
                </button>
              </Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
                <Command.Item className={item} onSelect={() => go(() => openCreate(q ? { title: q } : undefined))}>
                  <Plus className="size-4 text-muted" /> {q ? `Create task “${q}”` : "New task"}
                  <span className="ml-auto text-[12px] text-faint">N</span>
                </Command.Item>
                {role !== "owner" && (
                  <Command.Item className={item} onSelect={() => go(() => checkIn())}>
                    <LogIn className="size-4 text-muted" /> Check in for today
                  </Command.Item>
                )}
                {role === "employee" && (
                  <Command.Item className={item} onSelect={() => go(() => router.push("/today#ask"))}>
                    <MessageCircleQuestion className="size-4 text-muted" /> Ask my manager a question
                  </Command.Item>
                )}
              </Command.Group>
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
                {NAV[role].flat().map((n) => (
                  <Command.Item key={n.href} className={item} value={`page ${n.label}`} onSelect={() => go(() => router.push(n.href))}>
                    <n.icon className="size-4 text-muted" /> {n.label}
                  </Command.Item>
                ))}
              </Command.Group>
              {q.length > 0 && (
                <>
                  <Command.Group heading="Tasks" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
                    {tasks.slice(0, 60).map((t) => (
                      <Command.Item key={t.id} value={`task ${t.title} ${t.id}`} className={item} onSelect={() => go(() => openTask(t.id))}>
                        <StatusIcon status={t.status} className="size-4" />
                        <span className="truncate">{t.title}</span>
                        <span className="ml-auto shrink-0 text-[12px] text-faint">{people.find((p) => p.id === t.assigneeId)?.name.split(" ")[0]}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {role !== "employee" && (
                    <Command.Group heading="People" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
                      {people.map((p) => (
                        <Command.Item key={p.id} value={`person ${p.name} ${p.title}`} className={item} onSelect={() => go(() => router.push(`/team?person=${p.id}`))}>
                          <Avatar person={p} size="sm" /> {p.name}
                          <span className="ml-auto text-[12px] text-faint">{p.title}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[12px] text-faint">
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3.5" /> to open
              </span>
              <span>Esc to close</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
