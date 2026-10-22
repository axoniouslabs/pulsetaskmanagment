"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { useApp, useMe } from "@/lib/store";
import { authClient } from "@/lib/auth-client";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/primitives";
import { Avatar } from "./avatar";
import { ROLE_LABEL } from "./nav";

export async function signOut() {
  await authClient.signOut().catch(() => {});
  window.location.replace("/login");
}

/** who is signed in, with settings and sign out */
export function AccountMenu({ compact }: { compact?: boolean }) {
  const me = useMe();
  const role = useApp((s) => s.role);
  const dept = useApp((s) => s.departments.find((d) => d.id === me?.departmentId)?.name);
  if (!me) return null;

  return (
    <Menu>
      <MenuTrigger asChild>
        {compact ? (
          <button className="rounded-full" aria-label={`Signed in as ${me.name}. Account menu`}>
            <Avatar person={me} size="md" />
          </button>
        ) : (
          <button className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] p-2 text-left transition-colors hover:bg-sunken">
            <Avatar person={me} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{me.name}</span>
              <span className="block truncate text-[12px] text-muted">{me.title}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-faint" />
          </button>
        )}
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} className="w-64">
        <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
          <Avatar person={me} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">{me.name}</p>
            <p className="truncate text-[12px] text-muted">{me.email}</p>
          </div>
        </div>
        <p className="px-2.5 pb-2 text-[12px] text-faint">
          {ROLE_LABEL[role]}
          {dept ? ` · ${dept}` : ""}
        </p>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </MenuItem>
        <MenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
