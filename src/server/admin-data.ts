import "server-only";
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { startOfMonth, subDays, subWeeks, startOfWeek } from "date-fns";
import { db, schema as S } from "./db";
import { accessOf, type Access } from "./platform";

/** Everything the admin panel shows about companies, computed in a handful of grouped queries. */

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  access: Access;
  planId: string | null;
  planName: string | null;
  maxUsers: number | null;
  priceMonthly: number | null;
  contactPhone: string;
  notes: string;
  owner: { name: string; email: string } | null;
  users: number;
  activeThisWeek: number;
  tasks30: number;
  reminders7: number;
  lastActivityAt: string | null;
  engineLastTickAt: string | null;
  paidTotal: number;
}

const byOrg = <T extends { orgId: string }>(rows: T[]) => new Map(rows.map((r) => [r.orgId, r]));

export async function listCompanies(now = new Date()): Promise<CompanyRow[]> {
  const d7 = subDays(now, 7);
  const d30 = subDays(now, 30);
  const [orgs, plans, owners, users, tasks, actors, reminders, last, paid] = await Promise.all([
    db.select().from(S.organizations).orderBy(asc(S.organizations.name)),
    db.select().from(S.plans),
    db
      .select({ orgId: S.people.orgId, name: S.people.name, email: S.people.email })
      .from(S.people)
      .where(eq(S.people.role, "owner"))
      .orderBy(asc(S.people.createdAt)),
    db
      .select({ orgId: S.people.orgId, n: sql<number>`count(*)::int` })
      .from(S.people)
      .where(eq(S.people.active, true))
      .groupBy(S.people.orgId),
    db
      .select({ orgId: S.tasks.orgId, n: sql<number>`count(*)::int` })
      .from(S.tasks)
      .where(gte(S.tasks.createdAt, d30))
      .groupBy(S.tasks.orgId),
    db
      .select({ orgId: S.activity.orgId, n: sql<number>`count(distinct ${S.activity.actorId})::int` })
      .from(S.activity)
      .where(and(gte(S.activity.at, d7), ne(S.activity.actorId, "system")))
      .groupBy(S.activity.orgId),
    db
      .select({ orgId: S.activity.orgId, n: sql<number>`count(*)::int` })
      .from(S.activity)
      .where(and(gte(S.activity.at, d7), eq(S.activity.kind, "reminder_sent")))
      .groupBy(S.activity.orgId),
    db
      .select({ orgId: S.activity.orgId, at: sql<string>`max(${S.activity.at})` })
      .from(S.activity)
      .where(ne(S.activity.actorId, "system"))
      .groupBy(S.activity.orgId),
    db
      .select({ orgId: S.payments.orgId, n: sql<number>`coalesce(sum(${S.payments.amount}), 0)::int` })
      .from(S.payments)
      .groupBy(S.payments.orgId),
  ]);
  const plan = new Map(plans.map((p) => [p.id, p]));
  const owner = new Map<string, { name: string; email: string }>();
  for (const o of owners) if (!owner.has(o.orgId)) owner.set(o.orgId, { name: o.name, email: o.email });
  const [u, t, a, r, l, p] = [byOrg(users), byOrg(tasks), byOrg(actors), byOrg(reminders), byOrg(last), byOrg(paid)];

  return orgs.map((o) => {
    const pl = o.planId ? plan.get(o.planId) : undefined;
    const lastAt = l.get(o.id)?.at;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      access: accessOf(o, now),
      planId: o.planId,
      planName: pl?.name ?? null,
      maxUsers: pl ? pl.maxUsers : null,
      priceMonthly: pl?.priceMonthly ?? null,
      contactPhone: o.contactPhone,
      notes: o.notes,
      owner: owner.get(o.id) ?? null,
      users: u.get(o.id)?.n ?? 0,
      activeThisWeek: a.get(o.id)?.n ?? 0,
      tasks30: t.get(o.id)?.n ?? 0,
      reminders7: r.get(o.id)?.n ?? 0,
      lastActivityAt: lastAt ? new Date(lastAt).toISOString() : null,
      engineLastTickAt: o.engine?.lastTickAt ?? null,
      paidTotal: p.get(o.id)?.n ?? 0,
    };
  });
}

export async function companyDetail(id: string, now = new Date()) {
  const rows = await listCompanies(now);
  const company = rows.find((r) => r.id === id);
  if (!company) return null;
  const weeksBack = 8;
  const from = startOfWeek(subWeeks(now, weeksBack - 1), { weekStartsOn: 1 });
  const [payments, people, weekly] = await Promise.all([
    db.select().from(S.payments).where(eq(S.payments.orgId, id)).orderBy(desc(S.payments.paidAt)),
    db
      .select({ id: S.people.id, name: S.people.name, title: S.people.title, role: S.people.role, active: S.people.active, email: S.people.email })
      .from(S.people)
      .where(eq(S.people.orgId, id))
      .orderBy(asc(S.people.name)),
    db
      .select({ week: sql<string>`to_char(date_trunc('week', ${S.tasks.createdAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, id), gte(S.tasks.createdAt, from)))
      .groupBy(sql`1`),
  ]);
  const weeks = Array.from({ length: weeksBack }, (_, i) => {
    const start = startOfWeek(subWeeks(now, weeksBack - 1 - i), { weekStartsOn: 1 });
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return { start: start.toISOString(), tasks: weekly.find((w) => w.week === key)?.n ?? 0 };
  });
  return {
    company,
    payments: payments.map((x) => ({ ...x, paidAt: x.paidAt.toISOString(), periodFrom: x.periodFrom.toISOString(), periodTo: x.periodTo.toISOString(), createdAt: x.createdAt.toISOString() })),
    people,
    weeks,
  };
}

export async function listPlans() {
  const [plans, counts] = await Promise.all([
    db.select().from(S.plans).orderBy(asc(S.plans.sortOrder), asc(S.plans.createdAt)),
    db.select({ planId: S.organizations.planId, n: sql<number>`count(*)::int` }).from(S.organizations).groupBy(S.organizations.planId),
  ]);
  return plans.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), companies: counts.find((c) => c.planId === p.id)?.n ?? 0 }));
}

export async function recentPayments(limit = 8) {
  const rows = await db
    .select({ id: S.payments.id, orgId: S.payments.orgId, company: S.organizations.name, amount: S.payments.amount, method: S.payments.method, months: S.payments.months, paidAt: S.payments.paidAt })
    .from(S.payments)
    .innerJoin(S.organizations, eq(S.organizations.id, S.payments.orgId))
    .orderBy(desc(S.payments.paidAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, paidAt: r.paidAt.toISOString() }));
}

export async function collectedSince(from: Date) {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${S.payments.amount}), 0)::int` }).from(S.payments).where(gte(S.payments.paidAt, from));
  return row?.n ?? 0;
}

export const thisMonth = (now = new Date()) => startOfMonth(now);

export async function ownersOf(orgIds: string[]) {
  if (!orgIds.length) return [];
  return db.select().from(S.people).where(and(inArray(S.people.orgId, orgIds), eq(S.people.role, "owner")));
}
