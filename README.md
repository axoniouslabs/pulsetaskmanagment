# Pulse: Team Task Management System (phase 1 frontend)

A task system that follows up by itself. The owner assigns once; Pulse reminds every N minutes until
the employee acknowledges, escalates silence (employee → team lead → department head → owner), and records
every step in a history nobody can edit.

This is the **phase 1 PWA frontend running entirely on dummy data** (company "Crescent Traders", 18 people,
4 departments, ~35 tasks in every state, 4 weeks of report data). The backend (PostgreSQL, API, the 24/7
reminder worker and real Web Push) plugs in behind the same store actions in phase 1 of the roadmap.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
# or a production build
npm run build && npm start
```

Node 20+ (tested on 22). The PWA service worker registers in production builds only.

## How to demo (5 minutes)

1. Open the app. You are the **Owner (Imran)**: the Overview shows only what has stalled, most urgent first.
2. Use the person menu at the bottom of the sidebar (top-right avatar on phones) to switch to
   **Employee (Ali)**. Within ~45 seconds a reminder pops up with **Acknowledge / Snooze 30 / Open**.
3. Tap **Acknowledge**. Open a task, tap **I'm blocked**, pick a reason. The manager is told instantly.
4. Switch to **Manager (Saad)**: the blocked task is on his Overview; **Approvals** has Ali's submission
   with proof photos. Approve it.
5. Switch back to **Owner** and open **Activity log**: every reminder, acknowledgment and approval is there.
6. Press **N** for a new task and type `Send invoice to Mariam tomorrow 5pm !high` in the quick-add line.
7. Turn on notifications on My Day, then switch to another tab: reminders arrive as real system
   notifications with buttons (Chrome / Edge / Android).

Settings → Demo controls: change reminder speed, send a test reminder, or reset all dummy data.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/overview` | Owner, manager | "N things need you": overdue, never acknowledged, blocked, slow reviews, quiet people; questions; extension requests; department health |
| `/today` | Manager, employee | My Day: check in/out, notices to acknowledge, next-up focus card with timer, needs-your-OK, drag-to-order list, waiting on others |
| `/tasks` | All | List (grouped by lifecycle), Board (drag through valid transitions only), Calendar; filters, quick chips, saved views, sort by time-in-state |
| `/approvals` | Owner, manager | Review queue with proof, time vs estimate, rework history; more-time and leave requests |
| `/team` | Owner, manager | 7-day load heat map, people list, person panel with 4-week stats and device health |
| `/organisation` | Owner | Departments → teams → people, escalation path, groups, move people |
| `/channels` | All | Notices with acknowledgment tracking, team/group channels, automatic task feed |
| `/time` | All | Attendance today / 2 weeks, timesheet, leave requests and approvals, CSV export |
| `/reports` | All (scoped) | Completion, on-time, ack time, first-reminder response, rework, escalations, charts, fairness notes, appraisal report, CSV/PDF |
| `/activity` | All (scoped) | Append-only history with filters and export |
| `/settings` | Owner | Working hours, holidays, reminder defaults, escalation ladder, digests, notification preferences, devices, demo controls |

## Code map

```
src/app/(app)/<route>/page.tsx   screens (client components)
src/components/app/              shell, task row, task detail sheet, task actions, create task, reminders
src/components/pages/<area>/     screen-specific parts
src/components/ui/               button and primitives (Radix based)
src/lib/types.ts                 domain model (mirrors the future database)
src/lib/seed.ts                  dummy company, anchored to working hours
src/lib/store.ts                 zustand store: every lifecycle action + activity log + notifications
src/lib/selectors.ts             scoping, heat/escalation, red-panel rules, capacity
public/sw.js                     service worker: offline shell, push, notification buttons
docs/UI-GUIDE.md                 design system and rules for anyone adding a screen
```

When the backend arrives, each store action becomes an API call with the same name and payload.
