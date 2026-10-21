"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { useApp, useMe } from "@/lib/store";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, MenuSeparator } from "@/components/ui/primitives";
import { Avatar } from "./avatar";
import { HOME, ROLE_LABEL } from "./nav";

const ROLE_HINT: Record<Role, string> = {
  owner: "Sees everything, told only when something stalls",
  manager: "Runs the Development department",
  employee: "Gets the reminders, works from the phone",
};

/** Demo-only: switch between the three portals with dummy users */
export function RoleSwitcher({ compact }: { compact?: boolean }) {
  const me = useMe();
  const role = useApp((s) => s.role);
  const userIds = useApp((s) => s.userIds);
  const people = useApp((s) => s.people);
  const setRole = useApp((s) => s.setRole);
  const router = useRouter();

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <button className="rounded-full" aria-label={`Viewing as ${me.name}. Switch portal`}>
            <Avatar person={me} size="md" />
          </button>
        ) : (
          <button className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] p-2 text-left transition-colors hover:bg-sunken">
            <Avatar person={me} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{me.name}</span>
              <span className="block truncate text-[12px] text-muted">{ROLE_LABEL[role]} portal</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-faint" />
          </button>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} className="w-72">
        <MenuLabel>Demo: view the app as</MenuLabel>
        {(["owner", "manager", "employee"] as Role[]).map((r) => {
          const p = people.find((x) => x.id === userIds[r])!;
          return (
            <MenuItem
              key={r}
              onSelect={() => {
                setRole(r);
                router.push(HOME[r]);
              }}
              className={cn("items-start py-2.5", role === r && "bg-ink-tint/50")}
            >
              <Avatar person={p} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">
                  {ROLE_LABEL[r]}: {p.name}
                </span>
                <span className="block text-[12px] leading-snug text-muted">{ROLE_HINT[r]}</span>
              </span>
              {role === r && <Check className="mt-1 !text-ink" />}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <p className="px-2.5 pb-1.5 pt-0.5 text-[11.5px] leading-snug text-faint">In the real product each person signs in and sees only their own portal.</p>
      </MenuContent>
    </Menu>
  );
}
