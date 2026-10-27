import { db } from "@/server/db";
import { loadWorld } from "@/server/repo";
import { getActor, json } from "@/server/session";

/**
 * The whole company's data as one JSON file, for the owner. People come without
 * anything secret (no passwords, no device keys). The activity log is complete.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ error: "Only the owner can export the company's data." }, 403);
  const w = await loadWorld(db, viewer.orgId, { activity: true, stats: true, allActivity: true });
  const out = {
    exportedAt: new Date().toISOString(),
    company: w.settings.name,
    settings: w.settings,
    people: w.people.map(({ devices, ...p }) => ({ ...p, devices: devices.length })),
    departments: w.departments,
    teams: w.teams,
    groups: w.groups,
    projects: w.projects,
    tasks: w.tasks,
    activity: w.activity,
    channels: w.channels,
    announcements: w.announcements,
    questions: w.questions,
    deadlineRequests: w.deadlineRequests,
    attendance: w.attendance,
    leaves: w.leaves,
    dailyStats: w.stats,
    templates: w.templates,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(out, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pulse-${w.settings.name.replace(/[^\w.-]+/g, "-").toLowerCase()}-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
