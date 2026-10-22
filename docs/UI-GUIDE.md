# Pulse UI guide (read before building any screen)

Pulse is the Team Task Management System: a task board that follows up by itself.
Owner assigns, Pulse reminds every N minutes until acknowledged, escalates silence
(employee → team lead → department head → owner) and records every step in an
append-only activity log. Phase 1 is a PWA (Next.js 16, App Router) running on dummy data.

## Stack in this repo
- Next.js 16.4 (App Router, `cacheComponents` on). Every page under `src/app/(app)/<route>/page.tsx`
  starts with `"use client"` and has **only a default export** (no other exports from page files).
- Do **not** use `useSearchParams` (it breaks static prerender with cache components).
  Use `useQueryParam(name)` from `@/lib/hooks`.
- Tailwind v4, tokens in `src/app/globals.css` (`@theme`). Use the token classes, never raw hex
  except where an existing component does.
- State: zustand store `useApp` in `src/lib/store.ts` (persisted to localStorage). **Do not edit store.ts,
  seed.ts, types.ts, selectors.ts** — ask the lead if an action is missing.
- **Zustand rule (important):** a selector must return a stable value. Never write
  `useApp((s) => s.tasks.filter(...))` or `useApp((s) => ({...}))` — that creates a new array every render
  and causes an infinite render loop. Select raw slices (`useApp((s) => s.tasks)`) and derive with
  `React.useMemo`, or use `useScope()` from `@/lib/hooks`. Selectors returning numbers/strings/booleans
  or a single existing object (`s.tasks.find(...)`) are fine.
- Actions: `useApp.getState().approve(id)` or `const approve = useApp((s) => s.approve)`.

## Viewer & scope
- `useScope()` → `{ role, meId, me, people, tasks, allPeople, allTasks, teams, departments }`.
  `people`/`tasks` are already scoped: owner = everything, manager (Saad Khan, head of Development) =
  his department, employee (Ali Raza) = his own tasks.
- Roles: `owner` (Imran Qureshi), `manager` (Saad Khan), `employee` (Ali Raza). The role switcher is in the
  sidebar; pages must adapt content to `role` and never show data outside scope.

## Design language
- Background `bg-paper` (#f4f6f7), surfaces `bg-surface` with `border border-line`, radius
  `rounded-[var(--radius-lg)]` for panels, `rounded-[var(--radius-md)]` for inner blocks,
  `rounded-[var(--radius-sm)]` for inputs/buttons. No drop shadows on panels (only popovers use `shadow-pop`).
- Text: `text-text` (primary), `text-muted` (secondary), `text-faint` (tertiary). Primary colour is ink teal
  (`bg-ink`, `text-ink`, `bg-ink-tint`). Success `ok`, info `info`.
- **Heat scale is the only loud colour**: `heat-1` (amber) … `heat-4` (crimson) with `-tint` variants.
  Use it only for stalled/late/escalated work, never for decoration.
- Type: Figtree for UI (default `font-sans`), Bricolage Grotesque via the `font-display` class for page titles
  and big numbers only. Numbers that change use the `tabular` class.
- Page titles: `<PageHeader title description actions />` from `@/components/app/page-header`.
  Section titles: `<SectionHeading title aside />`. Panels: `<Panel>`. Empty: `<EmptyState icon title body action />`.
- Lists, not card grids. Tasks are always shown with `<TaskRow task ... />` inside `<TaskList>`.
  Rows open the task detail sheet (`openTask(id)`).
- Avoid these generic-AI tells: ALL-CAPS labels, tracked-out eyebrow labels above headings, `→` in button text,
  meta strings joined with middle dots ("A · B · C"), monospace data labels, identical card grids with
  gradients, decorative gradients, emoji.
- Copy: plain words, sentence case, active voice. Buttons say exactly what happens ("Approve", "Send back",
  "Post notice"). The toast after an action repeats the action name ("Approved"). Empty states tell the user
  what to do next. Errors explain how to fix the problem. Write from the user's point of view
  ("Waiting for review", not "status: submitted").
- Mobile first: every screen must work at 390px wide (no horizontal page scroll, wide tables scroll inside
  their own container with `overflow-x-auto`), touch targets ≥ 40px. Desktop max content width is handled by the shell.
- Accessibility: buttons are `<button>`, icons inside buttons have text or `aria-label`, visible focus is global.

## Components available
- `@/components/ui/button`: `<Button variant="primary|secondary|ghost|ok|danger|dangerSolid|link" size="sm|md|lg|icon|iconSm">`.
- `@/components/ui/primitives`: `Dialog, DialogContent(title, description, wide)`, `Sheet`, `Menu/MenuTrigger/MenuContent/MenuItem/MenuLabel/MenuSeparator`,
  `Popover/PopoverTrigger/PopoverContent`, `Tip` (tooltip), `Switch`, `Checkbox`, `Input`, `Textarea`, `Select` (native), `Field(label, hint)`,
  `Segmented(value, onChange, options[{value,label,count}])`, `Bar(value,max,tone)`, `Kbd`.
- `@/components/app/avatar`: `Avatar(person|id, size xs|sm|md|lg|xl, tip)`, `AvatarStack(ids)`, `PersonName`.
- `@/components/app/task-bits`: `StatusPill`, `StatusIcon`, `PriorityTag`, `HeatBadge`, `HeatEdge`, `Due`, `ReminderStat`, `ProjectTag`, `RecurrenceTag`, `HEAT` map.
- `@/components/app/task-row`: `TaskRow(task, showAssignee, showActions, showStatus, reason)`, `TaskList`.
- `@/components/app/task-actions`: `TaskActions(task, size, compact)` (role-aware lifecycle buttons with all dialogs), `TaskDialogs`.
- `@/components/app/task-detail`: `ActivityLine(a, showTask)` and `ACTIVITY_ICON` for activity feeds.
- `@/components/app/notifications`: `NOTE_ICON`.
- `@/components/app/reminder-engine`: `TestReminderButton`.
- Charts: `recharts` (installed). Use ink `#0f3d47`, ink-soft `#1d5663`, muted `#8a979d`, ok `#1e8a5a`,
  heat colours for problems only. Thin grid lines `#e2e7ea`, no chart borders or gradients.
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`. Icons: `lucide-react`. Dates: `date-fns`.
- Utils `@/lib/utils`: `cn, formatWhen, dueLabel, ago, minutesToLabel, pct, plural, uid`.
- Selectors `@/lib/selectors`: `isActive, isOpenWork, isOverdue, heatOf, STATUS_LABEL, PRIORITY_LABEL, scopePeople, scopeTasks, attention, committedHours, byId, NEXT_UP_SCORE`.

## Data (see src/lib/types.ts and src/lib/seed.ts)
Org "Crescent Distributors", 20 people, 5 departments (Sales, Operations, Accounts, Development, Admin & HR), 8 teams,
3 groups, ~35 tasks across every state, 4 weeks of `stats` (DailyStat per person per day) for reports,
14 days of `attendance`, `leaves`, `channels` + `announcements` (with `ackBy`/`readBy` maps), `questions`,
`deadlineRequests`, `notifications`, `activity` (newest first), `settings` (working hours, escalation thresholds,
reminder defaults, holidays…), `demo` (engineOn, intervalSec, systemNotifications), `prefs`.

## Store actions (all log to the activity feed automatically)
Tasks: createTask, acknowledge, start, snooze, block, unblock, submit, approve, reject, cancel, reassign,
changeDeadline, requestDeadline, decideDeadline, claimTask, publishDraft, toggleSubtask, addSubtask,
addComment, addAttachment, startTimer, stopTimer, openTask(id), openCreate(defaults?).
Comms: markRead, markAllRead, postAnnouncement({channelId,title,body,requiresAck,ackDueAt}),
ackAnnouncement(id), readAnnouncement(id), askQuestion, answerQuestion.
People/time: checkIn, checkOut, requestLeave({from,to,type,note}), decideLeave(id, approve), setOnLeave(personId, bool).
Org: addDepartment({name,headId,description}), addTeam({name,departmentId,leadId}), addGroup({name,description,memberIds}),
movePerson(personId, teamId). Settings: updateSettings(patch), addHoliday(date,name), removeHoliday(date),
setPref(key,bool), setDemo(patch), resetDemo(). Helper: `membersOf(state, unitType, unitId)` exported from store.

## Checks before you finish
- `npx tsc --noEmit -p .` must show no errors in your files (ignore `.next/` lines).
- `npx eslint <your files>` clean of errors.
- Do not run `next build` or `next dev` (other people are working in the same folder).
