"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { m } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GLIDE } from "@/lib/motion";
import { Logo } from "@/components/app/logo";
import { MotionProvider } from "@/components/app/motion-provider";
import { TooltipProvider } from "@/components/ui/primitives";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/companies", label: "Companies" },
];

export function AdminChrome({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <TooltipProvider>
        <div className="min-h-dvh bg-paper">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
              <Link href="/admin" className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="font-display text-[17px] font-bold tracking-tight text-ink">Pulse</span>
                <span className="rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-muted">Admin</span>
              </Link>
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Admin">
                <React.Suspense fallback={<NavLinks />}>
                  <LiveNavLinks />
                </React.Suspense>
              </nav>
              <Link href="/overview" className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-text">
                My company <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
            <nav className="thin-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Admin">
              <React.Suspense fallback={<NavLinks mobile />}>
                <LiveNavLinks mobile />
              </React.Suspense>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-6 sm:px-6 lg:pt-8">
            {children}
          </main>
        </div>
        <Toaster
          position="top-right"
          offset={16}
          toastOptions={{
            classNames: {
              toast: "!rounded-[var(--radius-md)] !border-line !bg-surface !text-text !shadow-pop !font-sans",
              title: "!text-[14px] !font-semibold !text-text",
              description: "!text-[13px] !text-muted",
            },
          }}
        />
      </TooltipProvider>
    </MotionProvider>
  );
}

/** the current page is only known at request time, so the highlight streams in */
function LiveNavLinks({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <NavLinks mobile={mobile} isActive={(href) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href))} />;
}

function NavLinks({ mobile, isActive }: { mobile?: boolean; isActive?: (href: string) => boolean }) {
  return (
    <>
      {NAV.map((n) => (
        <NavLink key={n.href} {...n} active={!!isActive?.(n.href)} mobile={mobile} />
      ))}
    </>
  );
}

function NavLink({ href, label, active, mobile }: { href: string; label: string; active: boolean; mobile?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("press relative shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-[14px] font-medium transition-colors", active ? "text-ink" : "text-muted hover:text-text")}
    >
      {active && <m.span layoutId={mobile ? "admin-nav-m" : "admin-nav"} transition={GLIDE} className="absolute inset-0 rounded-[var(--radius-sm)] bg-ink-tint" />}
      <span className="relative">{label}</span>
    </Link>
  );
}
