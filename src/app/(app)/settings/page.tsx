"use client";

import * as React from "react";
import { BellRing, Building2, CheckCheck, FileDown, FlaskConical, KeyRound, LayoutTemplate, Newspaper, Smartphone, TrendingUp, UserRoundCog } from "lucide-react";
import { useApp } from "@/lib/store";
import { useScope } from "@/lib/hooks";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/primitives";
import { PageHeader } from "@/components/app/page-header";
import { Chips, NumberSetting, SettingRow, SettingsSection, intervalLabel, shortInterval, useSave } from "@/components/pages/settings/parts";
import { CompanySettings } from "@/components/pages/settings/company";
import { EscalationLadder } from "@/components/pages/settings/escalation";
import { NotificationMatrix } from "@/components/pages/settings/notifications";
import { DeviceList } from "@/components/pages/settings/devices";
import { DemoControls } from "@/components/pages/settings/demo";
import { AccountSettings } from "@/components/pages/settings/account";
import { TemplateList } from "@/components/pages/settings/templates";
import { PushCard } from "@/components/app/push-card";

const SECTIONS = [
  { id: "company", label: "Company", icon: Building2 },
  { id: "reminders", label: "Reminders", icon: BellRing },
  { id: "escalation", label: "Escalation", icon: TrendingUp },
  { id: "approvals", label: "Approvals", icon: CheckCheck },
  { id: "digests", label: "Reports & digests", icon: Newspaper },
  { id: "notifications", label: "My notifications", icon: UserRoundCog },
  { id: "devices", label: "Devices & delivery", icon: Smartphone },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "account", label: "Account", icon: KeyRound },
  { id: "demo", label: "Demo controls", icon: FlaskConical },
];

export default function SettingsPage() {
  const { role } = useScope();
  const settings = useApp((s) => s.settings);
  const demoMode = useApp((s) => s.demoMode);
  const save = useSave();
  const sections = demoMode ? SECTIONS : SECTIONS.filter((s) => s.id !== "demo");
  const active = useActiveSection(
    sections.map((s) => s.id),
    role === "owner",
  );

  if (role !== "owner") {
    return (
      <div>
        <PageHeader title="Settings" description="Where your reminders reach you. Company rules like working hours and escalation are set by the owner." />
        <div className="max-w-[820px] space-y-10">
          <SettingsSection id="this-device" title="This device" description="Turn on notifications on every phone and PC you use for work.">
            <PushCard />
          </SettingsSection>
          <SettingsSection id="notifications" title="My notifications" description="Choose what reaches you, and where. Escalations and notices always reach you.">
            <NotificationMatrix />
          </SettingsSection>
          <SettingsSection id="devices" title="My devices" description="Every device that receives your reminders.">
            <DeviceList onlyMe />
          </SettingsSection>
          {role === "manager" && (
            <SettingsSection id="templates" title="Task templates" description="Saved tasks you can assign again in one step.">
              <TemplateList />
            </SettingsSection>
          )}
          <SettingsSection id="account" title="Account">
            <AccountSettings />
          </SettingsSection>
        </div>
      </div>
    );
  }

  const r = settings.defaultReminder;
  const setReminder = (patch: Partial<typeof r>) => save({ defaultReminder: { ...r, ...patch } });
  const preview = `New tasks remind every ${intervalLabel(r.intervalMin)} ${r.window === "working" ? "during working hours" : "at any time of day"}, at most ${plural(r.dailyCap, "time")} a day.`;

  return (
    <div>
      <PageHeader title="Settings" description="Changes apply straight away, for everyone. Tasks that are already running keep the reminder rules they were created with." />

      {/* section nav: chips on phones, sticky list on desktop */}
      <nav aria-label="Settings sections" className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:hidden">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium",
              active === s.id ? "border-ink bg-ink-tint text-ink" : "border-line-strong bg-surface text-muted",
            )}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5" aria-label="Settings sections">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-[13.5px] font-medium transition-colors",
                    active === s.id ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-sunken hover:text-text",
                  )}
                >
                  <s.icon className={cn("size-4", active === s.id ? "text-ink" : "text-faint")} />
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 max-w-[820px] space-y-10">
          <SettingsSection id="company" title="Company" description="The basics every reminder, deadline and report depends on.">
            <CompanySettings />
          </SettingsSection>

          <SettingsSection id="reminders" title="Reminders" description="Defaults for new tasks. Whoever assigns a task can change them for that task.">
            <div className="border-b border-line bg-ink-tint/50 px-4 py-3 sm:px-5" aria-live="polite">
              <p className="text-[14px] font-medium leading-snug text-ink">{preview}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-ink/75">
                {r.quietAfterAckMin ? `After someone acknowledges, Pulse stays quiet for ${r.quietAfterAckMin} minutes.` : "Follow-ups resume straight after someone acknowledges."}{" "}
                {settings.snoozeMaxPerDay ? `Each person can snooze ${plural(settings.snoozeMaxPerDay, "time")} a day.` : "Snoozing is off."}
              </p>
            </div>
            <SettingRow label="Remind every" hint="Until the assignee acknowledges the task.">
              <Chips
                label="Default reminder interval"
                value={r.intervalMin}
                onChange={(v) => setReminder({ intervalMin: v })}
                options={[10, 15, 30, 60, 120].map((n) => ({
                  value: n,
                  label: shortInterval(n),
                }))}
              />
            </SettingRow>
            <SettingRow
              htmlFor="only-working"
              label="Only during working hours"
              hint={`Between ${settings.workStart} and ${settings.workEnd} on working days. Turn off for teams that work around the clock.`}
            >
              <Switch id="only-working" checked={r.window === "working"} onCheckedChange={(v) => setReminder({ window: v ? "working" : "always" })} />
            </SettingRow>
            <SettingRow htmlFor="daily-cap" label="Daily limit per task" hint="After this many, Pulse stops reminding for the day and lets escalation do the work.">
              <NumberSetting id="daily-cap" value={r.dailyCap} min={1} max={50} suffix="a day" onCommit={(n) => setReminder({ dailyCap: n })} />
            </SettingRow>
            <SettingRow htmlFor="quiet-ack" label="Quiet time after acknowledgment" hint="Gives people room to start the work before follow-ups resume.">
              <NumberSetting id="quiet-ack" value={r.quietAfterAckMin} min={0} max={480} suffix="minutes" onCommit={(n) => setReminder({ quietAfterAckMin: n })} />
            </SettingRow>
            <SettingRow htmlFor="idle-days" label="Flag work as idle after" hint="In-progress work with no activity for this long is flagged, and the assignee and their reviewer are told.">
              <NumberSetting id="idle-days" value={settings.idleDays ?? 3} min={1} max={60} suffix="days" onCommit={(n) => save({ idleDays: n })} />
            </SettingRow>
            <SettingRow htmlFor="archive-days" label="Archive finished work after" hint="Done and cancelled tasks leave the lists after this long. They stay in reports and search finds them.">
              <NumberSetting id="archive-days" value={settings.autoArchiveDays ?? 30} min={1} max={365} suffix="days" onCommit={(n) => save({ autoArchiveDays: n })} />
            </SettingRow>
            <SettingRow htmlFor="snooze-max" label="Snoozes per person per day" hint="Snoozing is visible to the reviewer. Set 0 to turn snoozing off.">
              <NumberSetting id="snooze-max" value={settings.snoozeMaxPerDay} min={0} max={10} suffix="a day" onCommit={(n) => save({ snoozeMaxPerDay: n })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="escalation" title="Escalation" description="What happens when reminders are ignored. Each level adds people; nobody is skipped.">
            <EscalationLadder />
          </SettingsSection>

          <SettingsSection id="approvals" title="Approvals">
            <SettingRow
              htmlFor="approval-default"
              label="New tasks need approval"
              hint="When on, work goes to a reviewer before it counts as done. Routine tasks can still be set to finish without review."
            >
              <Switch id="approval-default" checked={settings.approvalByDefault} onCheckedChange={(v) => save({ approvalByDefault: v })} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="digests" title="Reports & digests" description="Summaries sent to everyone, on working days only.">
            <SettingRow label="Morning brief" hint="Each person's plan for the day. Managers also get what slipped yesterday.">
              <Input type="time" aria-label="Morning brief time" value={settings.digestMorning} onChange={(e) => e.target.value && save({ digestMorning: e.target.value })} className="tabular w-32" />
            </SettingRow>
            <SettingRow label="Evening digest" hint="What got done, what is still open and what needs attention tomorrow.">
              <Input type="time" aria-label="Evening digest time" value={settings.digestEvening} onChange={(e) => e.target.value && save({ digestEvening: e.target.value })} className="tabular w-32" />
            </SettingRow>
            <SettingRow htmlFor="retention" label="Keep records for" hint="The activity log and reports are kept at least 12 months, so a full year of appraisals is always available.">
              <NumberSetting id="retention" value={settings.retentionMonths} min={12} max={120} suffix="months" onCommit={(n) => save({ retentionMonths: n })} />
            </SettingRow>
            <SettingRow label="Your data" hint="Everything your company has in Pulse, as one file: people, tasks, the full activity log, attendance and reports. It's yours to keep.">
              <Button asChild variant="secondary">
                <a href="/api/export" download>
                  <FileDown /> Download all data
                </a>
              </Button>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="notifications" title="My notifications" description="Where your own notifications reach you. Everyone sets this for themselves.">
            <NotificationMatrix />
          </SettingsSection>

          <SettingsSection id="devices" title="Devices & delivery" description="Every phone and PC that receives reminders. Fix broken ones before blaming silence.">
            <PushCard />
            <div className="border-t border-line" />
            <DeviceList />
          </SettingsSection>

          <SettingsSection id="templates" title="Task templates" description="Saved tasks anyone can assign again in one step, from New task.">
            <TemplateList />
          </SettingsSection>

          <SettingsSection id="account" title="Account">
            <AccountSettings />
          </SettingsSection>

          {demoMode && (
            <SettingsSection
              id="demo"
              title="Demo controls"
              tag={<span className="rounded-full bg-heat-1-tint px-2 py-0.5 text-[12px] font-medium text-heat-1">Demo only</span>}
              description="Only shown for the sample company. Use these to run a client demo from a clean start."
              className="border-dashed border-line-strong"
            >
              <DemoControls />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

/** which section is in view, for the in-page nav */
function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = React.useState(ids[0]);
  const key = ids.join(",");
  React.useEffect(() => {
    if (!enabled) return;
    const list = key.split(",");
    const els = list.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key, enabled]);
  return active;
}
