"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Toaster } from "sonner";
import { Menu as MenuIcon, Plus, Search, X } from "lucide-react";
import { useApp, useMeId, membersOf } from "@/lib/store";
import { cn } from "@/lib/utils";
import { isOpenWork } from "@/lib/selectors";
import { Button } from "@/components/ui/button";
import { Kbd, Sheet, SheetClose, TooltipProvider } from "@/components/ui/primitives";
import { HOME, MOBILE_TABS, NAV, type NavItem } from "./nav";
import { AccountMenu } from "./account-menu";
import { NotificationBell } from "./notifications";
import { TaskDetailSheet } from "./task-detail";
import { CreateTaskDialog } from "./create-task";
import { CommandPalette } from "./command";
import { ReminderEngine } from "./reminder-engine";
import { Logo } from "./logo";
import { EngineAlarm } from "./engine-alarm";

/** load what this person may see, and keep it fresh while the app is open */
function useLiveData() {
  const status = useApp((s) => s.status);
  React.useEffect(() => {
    const load = () => void useApp.getState().load();
    load();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return status;
}

function useBadges() {
  const meId = useMeId();
  const role = useApp((s) => s.role);
  const approvals = useApp((s) =>
    s.tasks.filter((t) => t.status === "submitted" && (role === "owner" || t.reviewerId === meId)).length +
    s.deadlineRequests.filter((d) => d.status === "pending" && (role === "owner" || s.tasks.find((t) => t.id === d.taskId)?.reviewerId === meId)).length,
  );
  const channels = useApp(
    (s) =>
      s.announcements.filter((a) => {
        if (!a.requiresAck || a.ackBy[meId] || a.authorId === meId) return false;
        const ch = s.channels.find((c) => c.id === a.channelId);
        return !!ch && membersOf(s, ch.unitType, ch.unitId).includes(meId);
      }).length,
  );
  const today = useApp((s) => s.tasks.filter((t) => t.assigneeId === meId && t.status === "assigned").length);
  return { approvals, channels, today } as Record<NonNullable<NavItem["badge"]>, number>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const status = useLiveData();
  const hydrated = status === "ready";
  const role = useApp((s) => s.role);
  const pathname = usePathname();
  const router = useRouter();

  // keep each portal to its own pages
  React.useEffect(() => {
    if (!hydrated) return;
    const allowed = NAV[role].flat().map((n) => n.href);
    if (pathname === "/" || !allowed.some((h) => pathname.startsWith(h))) router.replace(HOME[role]);
  }, [hydrated, role, pathname, router]);

  React.useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (status === "error") return <LoadError />;
  if (!hydrated) return <ShellSkeleton />;

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-10 lg:pb-16 lg:pt-6">
            <EngineAlarm />
            {children}
          </main>
        </div>
        <BottomNav />
      </div>
      <TaskDetailSheet />
      <CreateTaskDialog />
      <CommandPalette />
      <ReminderEngine />
      <Toaster
        position="top-right"
        offset={16}
        mobileOffset={{ top: 12, left: 12, right: 12 }}
        toastOptions={{
          classNames: {
            toast: "!rounded-[var(--radius-md)] !border-line !shadow-pop !font-sans",
            title: "!text-[14px] !font-semibold !text-text",
            description: "!text-[13px] !text-muted",
            actionButton: "!bg-ink !text-white",
          },
        }}
      />
    </TooltipProvider>
  );
}

function LoadError() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={40} />
      <div>
        <p className="font-display text-[20px] font-semibold">Pulse couldn&apos;t load your work</p>
        <p className="mt-1 text-[14px] text-muted">Check your internet connection, then try again.</p>
      </div>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-[248px] shrink-0 border-r border-line bg-surface lg:block" />
      <div className="flex-1 px-6 pt-20">
        <div className="mx-auto max-w-[1160px] space-y-4">
          <div className="h-8 w-64 animate-pulse rounded-md bg-sunken" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-sunken" />
          <div className="mt-8 h-64 animate-pulse rounded-[var(--radius-lg)] bg-sunken" />
        </div>
      </div>
    </div>
  );
}

function NavLink({ item, badges, onClick }: { item: NavItem; badges: Record<string, number>; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname.startsWith(item.href);
  const count = item.badge ? badges[item.badge] : 0;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-[var(--radius-sm)] px-2.5 text-[14px] transition-colors",
        active ? "bg-ink-tint font-semibold text-ink" : "text-muted hover:bg-sunken hover:text-text",
      )}
    >
      <item.icon className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-faint group-hover:text-muted")} strokeWidth={active ? 2.3 : 2} />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span className={cn("tabular min-w-5 rounded-full px-1.5 text-center text-[11.5px] font-semibold leading-5", item.badge === "today" ? "bg-heat-1-tint text-heat-1" : "bg-ink text-white")}>{count}</span>
      )}
    </Link>
  );
}

function Sidebar() {
  const role = useApp((s) => s.role);
  const org = useApp((s) => s.settings.name);
  const openCreate = useApp((s) => s.openCreate);
  const badges = useBadges();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Logo />
        <div className="min-w-0">
          <p className="font-display text-[17px] font-bold leading-none tracking-tight text-ink">Pulse</p>
          <p className="mt-1 truncate text-[12px] text-muted">{org}</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <Button variant="primary" className="w-full justify-start" onClick={() => openCreate()}>
          <Plus /> New task
          <span className="ml-auto rounded bg-white/15 px-1.5 text-[11px] font-medium">N</span>
        </Button>
      </div>
      <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-2">
        {NAV[role].map((group, i) => (
          <div key={i} className={cn("space-y-0.5", i > 0 && "mt-4 border-t border-line pt-4")}>
            {group.map((item) => (
              <NavLink key={item.href} item={item} badges={badges} />
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <AccountMenu />
      </div>
    </aside>
  );
}

function TopBar() {
  const setCommandOpen = useApp((s) => s.setCommandOpen);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md lg:border-none lg:bg-paper/70">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-10">
        <div className="flex items-center gap-2 lg:hidden">
          <Logo size={28} />
          <span className="font-display text-[17px] font-bold tracking-tight text-ink">Pulse</span>
        </div>
        <button
          onClick={() => setCommandOpen(true)}
          className="ml-auto hidden h-10 w-[min(420px,40vw)] items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-[14px] text-faint transition-colors hover:border-line-strong md:flex lg:ml-0"
        >
          <Search className="size-4" />
          Search tasks, people, pages
          <span className="ml-auto flex gap-1">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-1 md:ml-auto">
          <button onClick={() => setCommandOpen(true)} className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-sunken md:hidden" aria-label="Search">
            <Search className="size-5" />
          </button>
          <NotificationBell />
          <div className="ml-1 lg:hidden">
            <AccountMenu compact />
          </div>
        </div>
      </div>
    </header>
  );
}

function Tab({ item, badges }: { item: NavItem; badges: Record<string, number> }) {
  const pathname = usePathname();
  const active = pathname.startsWith(item.href);
  const count = item.badge ? badges[item.badge] : 0;
  return (
    <Link href={item.href} className={cn("relative flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium", active ? "text-ink" : "text-faint")}>
      <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} />
      {item.label}
      {count > 0 && <span className="tabular absolute left-1/2 top-1 ml-2 rounded-full bg-heat-3 px-1.5 text-[10px] font-bold leading-4 text-white">{count}</span>}
    </Link>
  );
}

function BottomNav() {
  const role = useApp((s) => s.role);
  const openCreate = useApp((s) => s.openCreate);
  const badges = useBadges();
  const [more, setMore] = React.useState(false);
  const tabs = MOBILE_TABS[role];
  const rest = NAV[role].flat().filter((n) => !tabs.some((t) => t.href === n.href));

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex h-16 max-w-xl items-stretch px-1">
          <Tab item={tabs[0]} badges={badges} />
          <Tab item={tabs[1]} badges={badges} />
          <div className="flex flex-1 items-center justify-center">
            <button onClick={() => openCreate()} className="flex size-12 items-center justify-center rounded-full bg-ink text-white shadow-pop active:scale-95" aria-label="New task">
              <Plus className="size-6" />
            </button>
          </div>
          <Tab item={tabs[2]} badges={badges} />
          {rest.length ? (
            <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium text-faint">
              <MenuIcon className="size-[22px]" strokeWidth={1.9} />
              More
            </button>
          ) : (
            <Tab item={tabs[3]} badges={badges} />
          )}
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="More">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-[18px] font-semibold">More</p>
          <SheetClose className="rounded-[var(--radius-sm)] p-2 text-faint hover:bg-sunken" aria-label="Close">
            <X className="size-5" />
          </SheetClose>
        </div>
        <div className="space-y-1 p-3">
          {[tabs[3], ...rest].filter(Boolean).map((n) => (
            <NavLink key={n.href} item={n} badges={badges} onClick={() => setMore(false)} />
          ))}
        </div>
        <div className="border-t border-line p-3">
          <AccountMenu />
        </div>
      </Sheet>
    </>
  );
}

/* re-export for pages */
export { isOpenWork };
