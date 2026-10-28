"use client";

import * as React from "react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/app/avatar";
import { Textarea } from "@/components/ui/primitives";

/** a text box that suggests people, groups and @everyone after an "@" */
export function MentionInput({
  value,
  onChange,
  memberIds,
  className,
  onKeyDown,
  ...rest
}: { value: string; onChange: (v: string) => void; memberIds: string[] } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const people = useApp((s) => s.people);
  const groups = useApp((s) => s.groups);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [active, setActive] = React.useState(0);

  const before = value.slice(0, caret);
  const m = /(^|\s)@([\w.\- ]{0,30})$/.exec(before);
  const query = m ? m[2].toLowerCase() : null;
  const options = React.useMemo(() => {
    if (query === null) return [];
    const list: { key: string; label: string; insert: string; personId?: string; hint?: string }[] = [];
    if ("everyone".startsWith(query)) list.push({ key: "everyone", label: "everyone", insert: "everyone", hint: "Everyone in this channel" });
    for (const id of memberIds) {
      const p = people.find((x) => x.id === id);
      if (p && p.name.toLowerCase().includes(query)) list.push({ key: p.id, label: p.name, insert: p.name.split(" ")[0], personId: p.id, hint: p.title });
    }
    for (const g of groups) if (!g.archivedAt && g.name.toLowerCase().includes(query)) list.push({ key: g.id, label: g.name, insert: g.name, hint: "Group" });
    return list.slice(0, 6);
  }, [query, memberIds, people, groups]);

  const pick = (o: (typeof options)[number]) => {
    const start = before.length - (m![2].length + 1);
    const next = `${value.slice(0, start)}@${o.insert} ${value.slice(caret)}`;
    onChange(next);
    const pos = start + o.insert.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActive(0);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (!options.length) return onKeyDown?.(e);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + options.length) % options.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setCaret(-1);
          } else onKeyDown?.(e);
        }}
        className={className}
        aria-autocomplete="list"
        {...rest}
      />
      {options.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-pop">
          {options.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px]", i === active ? "bg-hover" : "hover:bg-hover")}
              >
                {o.personId ? (
                  <Avatar person={people.find((p) => p.id === o.personId)} size="xs" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-muted">@</span>
                )}
                <span className="font-medium text-text">{o.label}</span>
                {o.hint && <span className="truncate text-[12px] text-faint">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** show @mentions in bold so people see who was called on */
export function WithMentions({ text }: { text: string }) {
  const parts = text.split(/(@[\w.\-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="font-semibold text-ink">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}
