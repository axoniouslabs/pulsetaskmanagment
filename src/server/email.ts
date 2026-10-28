import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { loadWorld } from "./repo";
import { scopePeople } from "@/lib/selectors";
import { buildXlsx } from "@/lib/xlsx";
import { db, schema as S } from "./db";

/**
 * Email through Resend's HTTP API when RESEND_API_KEY is set; otherwise a no-op.
 * EMAIL_FROM must be an address on a domain verified in Resend.
 */
export async function sendEmail(to: string, subject: string, text: string, html?: string, attachments?: { filename: string; content: string }[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Pulse <onboarding@resend.dev>", to, subject, text, html, ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) throw new Error(`email failed ${res.status}: ${await res.text()}`);
  return true;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** email the morning / evening digests, unless the person turned digest email off */
export async function sendDigestEmails(notificationIds: string[]) {
  if (!process.env.RESEND_API_KEY || !notificationIds.length) return;
  const items = await db.select().from(S.notifications).where(inArray(S.notifications.id, notificationIds));
  const appUrl = process.env.BETTER_AUTH_URL ?? "";
  for (const n of items) {
    const [p] = await db.select({ email: S.people.email, name: S.people.name, prefs: S.people.prefs }).from(S.people).where(eq(S.people.id, n.recipientId));
    if (!p?.email || p.prefs?.["email:digest"] === false) continue;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#13262c">
<p style="font-size:13px;color:#5b6b72;margin:0 0 8px">Pulse</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(n.title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${esc(n.body)}</p>
${appUrl ? `<a href="${esc(appUrl)}" style="display:inline-block;background:#0f3d47;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open Pulse</a>` : ""}
<p style="font-size:12px;color:#8a979d;margin-top:24px">You get this because daily digests are on. Turn them off in Pulse under My notifications.</p></div>`;
    // the weekly summary carries the week's report as a spreadsheet (spec §11, scheduled delivery)
    const attachments = n.title === "Last week in one line" ? await weeklyReport(n.orgId, n.recipientId).catch(() => undefined) : undefined;
    await sendEmail(p.email, n.title, `${n.body}\n\n${appUrl}`, html, attachments).catch((e) => console.error("digest email", p.email, e));
  }
}

/** last week's per-person numbers for everyone this person oversees, as an .xlsx attachment */
async function weeklyReport(orgId: string, personId: string) {
  const w = await loadWorld(db, orgId, { skipNotifications: true });
  const me = w.people.find((p) => p.id === personId);
  if (!me || me.role === "employee") return undefined;
  const people = scopePeople(w, me.role, personId).filter((p) => p.role !== "owner" && p.active !== false);
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(S.dailyStats)
    .where(and(eq(S.dailyStats.orgId, orgId), gte(S.dailyStats.date, since)));
  const sheet = [
    ["Person", "Assigned", "Approved", "Completion %", "On time %", "Reminders", "Escalations", "Sent back", "Hours worked", "Hours estimated"],
    ...people.map((p) => {
      const r = rows.filter((x) => x.personId === p.id);
      const sum = (k: keyof (typeof rows)[number]) => r.reduce((n, x) => n + Number(x[k] ?? 0), 0);
      const assigned = sum("assigned");
      const approved = sum("approved");
      return [
        p.name,
        assigned,
        approved,
        assigned ? Math.round((approved / assigned) * 100) : null,
        approved ? Math.round((sum("onTime") / approved) * 100) : null,
        sum("remindersSent"),
        sum("escalations"),
        sum("rejections"),
        Math.round(sum("actualHours") * 10) / 10,
        Math.round(sum("estHours") * 10) / 10,
      ];
    }),
  ];
  const bytes = buildXlsx([{ name: "Last 7 days", rows: sheet, widths: [24, 10, 10, 13, 11, 11, 12, 10, 13, 15] }]);
  return [{ filename: `pulse-week-${new Date().toISOString().slice(0, 10)}.xlsx`, content: Buffer.from(bytes).toString("base64") }];
}
