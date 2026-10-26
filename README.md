# Pulse: Team Task Management System

A task system that follows up by itself. The owner assigns once; Pulse reminds every N minutes until
the employee acknowledges, escalates silence (employee → team lead → department head → owner), and records
every step in a history nobody can edit.

Phase 1 is a PWA with its own backend: Next.js (App Router) for screens and API, PostgreSQL through
Drizzle, Better Auth for sign-in, Web Push for reminders. Every action is a command that the server checks
against the permission rules, applies and saves in one transaction, with the activity log written by the
same transaction. The log table refuses updates and deletes at the database level.

## Deploy

Step-by-step for Vercel + Neon, the every-minute reminder trigger, monitoring and backups:
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Run it locally

Needs Node 20+ (tested on 22) and PostgreSQL 15+.

```bash
npm install
cp .env.example .env          # then fill BETTER_AUTH_SECRET and SEED_PASSWORD
npm run db:migrate            # create the tables
npm run db:seed               # load the demo company with real logins
npm run dev                   # http://localhost:3000
```

With `ENGINE_INTERNAL_TICK=1` in `.env` the reminder engine runs every minute inside the app.

| Command | What it does |
| --- | --- |
| `npm run db:seed -- --reset` | wipe the demo company and load it fresh (times move to today) |
| `npm run company:create -- --company "…" --owner-name "…" --owner-email …` | create a real client company and its owner |
| `npm test` | unit tests: rules, permissions, reminder engine |
| `npm run test:e2e` | browser test against a running server (`CRON_SECRET` set to include the engine) |
| `npm run typecheck`, `npm run lint` | static checks (also run in GitHub Actions) |

## What runs where

| Piece | How |
| --- | --- |
| Screens | Next.js App Router, installable PWA; data loads from `/api/snapshot` and refreshes every 15 s |
| Every action | `/api/command`: validated, permission-checked and saved in one transaction with its activity entry |
| Reminder engine | `/api/cron/tick` every minute: 5 gates, escalation L1–L4, digests, repeating tasks, report rollups |
| Push | Web Push (VAPID); Acknowledge / Snooze work from the notification even with Pulse closed |
| Files and voice notes | `/api/files`: Vercel Blob when connected, otherwise Postgres |
| Sign-in | Better Auth, email and password; the owner adds people and resets passwords |

## Demo company

Crescent Distributors: 20 staff in 5 departments (Sales, Operations, Accounts, Development, Admin & HR).
Everyone has a login, `firstname@crescent.pk` with the `SEED_PASSWORD`. With `PULSE_DEMO=1` the sign-in
page also shows one-tap buttons for the owner (Imran), a manager (Saad) and an employee (Ali), and the
owner gets **Settings → Demo controls → Reset demo data**.

## How to demo (5 minutes)

1. Sign in as **Owner (Imran)** on a computer: the Overview shows only what has stalled, most urgent first.
2. In a private window or on a phone, sign in as **Employee (Ali)**.
3. As the owner or **Manager (Saad)**, press **N** and assign Ali a task, e.g. `Send invoice tomorrow 5pm !high`.
   It appears on Ali's My day within seconds.
4. As Ali: Acknowledge, Start, then I'm blocked or Submit with a photo. The manager sees each step.
5. As the manager: **Approvals** → approve or send back. As the owner: **Activity log** shows every step.
6. On a phone: **Settings → This device → Turn on**, then leave a task unacknowledged. Reminders arrive with
   **Acknowledge** and **Snooze** buttons that work without opening Pulse; ignored ones climb to the lead, head and owner.

Owner extras: **Team → Add person** (temporary password), **Organisation → Change head / Change lead**,
**Tasks → Import** (CSV) and **Timeline**, **New task → Several people / Team, first to claim / Save as template**,
and **Settings → Demo controls → Reset demo data**.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/overview` | Owner, manager | "N things need you": overdue, never acknowledged, blocked, slow reviews, quiet people; questions; extension requests; department health |
| `/today` | Manager, employee | My Day: check in/out, notices to acknowledge, next-up focus card with timer, needs-your-OK, drag-to-order list, waiting on others |
| `/tasks` | All | List (grouped by lifecycle), Board (drag through valid transitions only), Calendar, Timeline (Gantt with dependencies); filters, quick chips, saved views; CSV import |
| `/approvals` | Owner, manager | Review queue with proof, time vs estimate, rework history; more-time and leave requests |
| `/team` | Owner, manager | 7-day load heat map, people list, person panel with 4-week stats and device health; owner adds, edits, resets passwords and deactivates people |
| `/organisation` | Owner | Departments → teams → people, escalation path, groups, move people, change heads and leads |
| `/channels` | All | Notices with acknowledgment tracking, team/group channels, automatic task feed |
| `/time` | All | Attendance today / 2 weeks, timesheet, leave requests and approvals, CSV export |
| `/reports` | All (scoped) | Completion, on-time, ack time, first-reminder response, rework, escalations, charts, fairness notes, appraisal report, CSV/PDF |
| `/activity` | All (scoped) | Append-only history with filters and export |
| `/settings` | All | Everyone: this device's notifications, my notifications, my devices, password. Owner also: working hours, holidays, reminder defaults, escalation ladder, digests, templates, demo controls |

## Code map

```
src/app/(app)/<route>/page.tsx   screens (client components)
src/components/app/              shell, task row, task detail sheet, task actions, create task, reminders
src/components/pages/<area>/     screen-specific parts
src/components/ui/               button and primitives (Radix based)
src/app/login/                   sign-in page (+ one-tap demo sign-in)
src/app/api/command/             every action: validate → lock org → load → authorize → apply → save
src/app/api/snapshot/            what the signed-in person may see
src/domain/commands.ts           the rules for every action (shared by browser and server)
src/domain/permissions.ts        who may do what, checked on the server
src/domain/engine.ts             the reminder engine (one pure "tick"), unit-tested in tests/
src/app/api/cron/tick/           runs the engine for every company (CRON_SECRET)
src/app/api/push/, public/sw.js  Web Push subscribe / test / notification buttons
src/app/api/files/               uploads and downloads
src/app/api/people/              owner's staff management
src/server/db/schema.ts          database tables (Drizzle); migrations in drizzle/
src/server/repo.ts               load / save / scope the organisation's data
src/server/auth.ts               Better Auth (email + password, no public sign-up)
src/server/demo.ts               the demo company loader
src/lib/types.ts                 domain model
src/lib/store.ts                 browser cache: instant local update, then the server confirms
src/lib/selectors.ts             scoping, heat/escalation, red-panel rules, capacity
public/sw.js                     service worker: offline shell, push, notification buttons
docs/UI-GUIDE.md                 design system and rules for anyone adding a screen
```

