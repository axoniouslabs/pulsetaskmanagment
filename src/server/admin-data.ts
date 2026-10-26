import "server-only";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { subDays, subWeeks, startOfWeek } from "date-fns";
import { db, schema as S } from "./db";
import { accessOf, type AccessState } from "@/lib/access";

/** Everything the admin panel shows about companies, computed in a handful of grouped queries. */

export interface CompanyRow {
  id: string;
  name: string;
  createdAt: string;
  access: AccessState;
  contactPhone: string;
  notes: string;
  owner: { name: string; email: string } | null;
  users: number;
  activeThisWeek: number;
  tasks30: number;
  reminders7: number;
  lastActivityAt: string | null;
  engineLastTickAt: string | null;
}

const byOrg = <T extends { orgId: string }>(rows: T[]) => new Map(rows.map((r) => [r.orgId, r]));

export async function listCompanies(now = new Date()): Promise<CompanyRow[]> {
  const d7 = subDays(now, 7);
  const d30 = subDays(now, 30);
  const [orgs, owners, users, tasks, actors, reminders, last] = await Promise.all([
    db.select().from(S.organizations).orderBy(asc(S.organizations.name)),
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
  ]);
  const owner = new Map<string, { name: string; email: string }>();
  for (const o of owners) if (!owner.has(o.orgId)) owner.set(o.orgId, { name: o.name, email: o.email });
  const [u, t, a, r, l] = [byOrg(users), byOrg(tasks), byOrg(actors), byOrg(reminders), byOrg(last)];

  return orgs.map((o) => {
    const lastAt = l.get(o.id)?.at;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      access: accessOf(o),
      contactPhone: o.contactPhone,
      notes: o.notes,
      owner: owner.get(o.id) ?? null,
      users: u.get(o.id)?.n ?? 0,
      activeThisWeek: a.get(o.id)?.n ?? 0,
      tasks30: t.get(o.id)?.n ?? 0,
      reminders7: r.get(o.id)?.n ?? 0,
      lastActivityAt: lastAt ? new Date(lastAt).toISOString() : null,
      engineLastTickAt: o.engine?.lastTickAt ?? null,
    };
  });
}

export async function companyDetail(id: string, now = new Date()) {
  const rows = await listCompanies(now);
  const company = rows.find((r) => r.id === id);
  if (!company) return null;
  const weeksBack = 8;
  const from = startOfWeek(subWeeks(now, weeksBack - 1), { weekStartsOn: 1 });
  const [people, weekly] = await Promise.all([
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
    people,
    weeks,
  };
}
