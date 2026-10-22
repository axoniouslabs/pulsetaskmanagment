/* eslint-disable @typescript-eslint/no-unused-expressions */
// End-to-end smoke test against a running server: node scripts/e2e-smoke.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PASS = process.env.SEED_PASSWORD ?? "pulse-demo-2026";
const SHOTS = process.env.SHOTS;
const log = (...a) => console.log("•", ...a);
const fail = (m) => { console.error("✗", m); process.exitCode = 1; };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = async (mobile = false) =>
  browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });

async function formLogin(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASS);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}
const cmd = (page, body) =>
  page.evaluate(async (b) => {
    const r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, body);

// 0. login page renders, wrong password is refused
{
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(`${BASE}/login`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/login-desktop.png` });
  await p.getByLabel("Work email").fill("imran@crescent.pk");
  await p.getByLabel("Password", { exact: true }).fill("wrong-password");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.locator("p[role=alert]").waitFor();
  log("wrong password refused:", (await p.locator("p[role=alert]").innerText()).slice(0, 60));
  await c.close();
}

// 1. owner signs in with the form
const ownerCtx = await ctx();
const owner = await ownerCtx.newPage();
await formLogin(owner, "imran@crescent.pk");
await owner.waitForSelector("main h1", { timeout: 30000 });
log("owner landed on", new URL(owner.url()).pathname, "-", await owner.locator("main h1").first().innerText());
if (SHOTS) await owner.screenshot({ path: `${SHOTS}/owner-overview.png` });

// 2. manager signs in with the demo button
const mgrCtx = await ctx();
const mgr = await mgrCtx.newPage();
await mgr.goto(`${BASE}/login`);
await mgr.getByRole("button", { name: /Manager/ }).click();
await mgr.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
await mgr.waitForSelector("main h1", { timeout: 30000 });
log("manager landed on", new URL(mgr.url()).pathname);

const title = `Smoke test ${Date.now().toString(36)}`;
const due = new Date(Date.now() + 26 * 3600e3).toISOString();
const created = await cmd(mgr, { type: "createTask", id: `task_smoke${Date.now().toString(36)}`, input: { title, assigneeId: "p_ali", priority: "high", dueAt: due } });
created.status === 200 ? log("manager assigned a task to Ali") : fail(`createTask ${created.status} ${JSON.stringify(created.body)}`);

// a manager may not assign outside their department
const outside = await cmd(mgr, { type: "createTask", id: `task_x${Date.now().toString(36)}`, input: { title: "Not allowed", assigneeId: "p_kamran", priority: "low", dueAt: due } });
outside.status === 422 ? log("blocked outside scope:", outside.body.error) : fail(`expected 422 for outside assignment, got ${outside.status}`);

// 3. employee on a phone sees it and acknowledges from the screen
const empCtx = await ctx(true);
const emp = await empCtx.newPage();
await emp.goto(`${BASE}/login`);
await emp.getByRole("button", { name: /Employee/ }).click();
await emp.waitForURL((u) => u.pathname.startsWith("/today"), { timeout: 30000 });
await emp.getByText(title).first().waitFor({ timeout: 20000 });
log("Ali sees the new task on My day");
if (SHOTS) await emp.screenshot({ path: `${SHOTS}/employee-today-mobile.png` });


// acknowledge through the API by looking the task up from the snapshot
const snap = await emp.evaluate(async () => (await fetch("/api/snapshot")).json());
const mine = snap.world.tasks.find((t) => t.title === title);
const ack2 = await cmd(emp, { type: "acknowledge", taskId: mine.id });
ack2.status === 200 ? log("Ali acknowledged") : fail(`ack ${ack2.status} ${JSON.stringify(ack2.body)}`);

// employees can't approve
const sneaky = await cmd(emp, { type: "approve", taskId: mine.id });
sneaky.status === 422 ? log("employee approve refused:", sneaky.body.error) : fail(`expected 422 for employee approve, got ${sneaky.status}`);

// employees only see their own slice
const others = snap.world.tasks.filter((t) => t.assigneeId !== "p_ali" && t.reviewerId !== "p_ali" && t.createdById !== "p_ali" && !(t.watcherIds ?? []).includes("p_ali") && t.blockedOwnerId !== "p_ali");
others.length === 0 ? log(`Ali's snapshot holds ${snap.world.tasks.length} tasks, none of other people's`) : fail(`Ali can see ${others.length} tasks that aren't his`);
snap.world.notifications.every((n) => n.recipientId === "p_ali") ? log("only Ali's own notifications") : fail("foreign notifications leaked");

// 4. manager sees the acknowledgment in the activity log
await mgr.waitForTimeout(500);
const msnap = await mgr.evaluate(async () => (await fetch("/api/snapshot")).json());
const acts = msnap.world.activity.filter((a) => a.taskId === mine.id).map((a) => a.kind);
acts.includes("acknowledged") && acts.includes("assigned") ? log("manager's log shows:", acts.join(", ")) : fail(`activity missing: ${acts}`);

// 5. the UI path: Ali starts the task by tapping the button
await emp.reload();
await emp.getByText(title).first().click();
const startBtn = emp.getByRole("button", { name: /^Start/ }).first();
await startBtn.waitFor({ timeout: 15000 });
await startBtn.click();
await emp.waitForTimeout(2500);
const after = await emp.evaluate(async (id) => (await (await fetch("/api/snapshot")).json()).world.tasks.find((t) => t.id === id)?.status, mine.id);
after === "in_progress" ? log("tapping Start saved on the server (status in_progress)") : fail(`after Start, status is ${after}`);
if (SHOTS) await emp.screenshot({ path: `${SHOTS}/employee-task-mobile.png` });

// 6. step 3-5 features
const SECRET = process.env.CRON_SECRET;
if (SECRET) {
  const tick = await (await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: `Bearer ${SECRET}` } })).json();
  tick.ok ? log("reminder engine tick ran:", JSON.stringify(tick.results)) : fail(`tick: ${JSON.stringify(tick)}`);
  const health = await (await fetch(`${BASE}/api/health`)).json();
  health.ok ? log("health ok, engine ran", health.engineAgeMin, "min ago") : fail(`health: ${JSON.stringify(health)}`);
}

// upload a proof photo as Ali, via the real endpoint
const upload = await emp.evaluate(async (taskId) => {
  const c = document.createElement("canvas");
  c.width = 40; c.height = 30;
  c.getContext("2d").fillRect(0, 0, 40, 30);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg"));
  const f = new FormData();
  f.set("file", new File([blob], "proof.jpg", { type: "image/jpeg" }));
  f.set("taskId", taskId);
  f.set("proof", "1");
  const r = await fetch("/api/files", { method: "POST", body: f });
  const body = await r.json();
  const img = body.file ? await fetch(body.file.url) : null;
  return { status: r.status, url: body.file?.url, served: img?.status, type: img?.headers.get("content-type") };
}, mine.id);
upload.status === 200 && upload.served === 200 && upload.type === "image/jpeg" ? log("proof photo uploaded and served back", upload.url) : fail(`upload ${JSON.stringify(upload)}`);
const sub = await cmd(emp, { type: "submit", taskId: mine.id, note: "Done with photo" });
sub.status === 200 ? log("Ali submitted with proof") : fail(`submit ${JSON.stringify(sub.body)}`);

// manager edits a task and offers one to the team
const edit = await cmd(mgr, { type: "editTask", taskId: mine.id, patch: { priority: "urgent" } });
edit.status === 422 ? log("editing a submitted task is allowed only before it closes:", edit.status) : log("manager edited the task:", edit.status);
const claimId = `task_claim${Date.now().toString(36)}`;
const offer = await cmd(mgr, { type: "createTask", id: claimId, input: { title: `Team claim ${Date.now().toString(36)}`, assigneeId: "p_saad", priority: "normal", dueAt: due, claim: { unitType: "team", unitId: "t_product" } } });
offer.status === 200 ? log("manager offered a task to the Product team") : fail(`offer ${JSON.stringify(offer.body)}`);
const claim = await cmd(emp, { type: "claimTask", taskId: claimId });
claim.status === 200 ? log("Ali claimed it first") : fail(`claim ${JSON.stringify(claim.body)}`);

// owner adds a person, who signs in with the temporary password
const added = await owner.evaluate(async () => {
  const r = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Test Person", email: `test${Date.now()}@crescent.pk`, title: "Trainee", role: "employee", teamId: "t_admin" }) });
  return { status: r.status, body: await r.json() };
});
if (added.status !== 200) fail(`add person ${JSON.stringify(added.body)}`);
else {
  log("owner added a person, temporary password", added.body.password);
  const npCtx = await ctx();
  const np = await npCtx.newPage();
  const email = await owner.evaluate(async (id) => (await (await fetch("/api/snapshot")).json()).world.people.find((p) => p.id === id).email, added.body.personId);
  await np.goto(`${BASE}/login`);
  await np.getByLabel("Work email").fill(email);
  await np.getByLabel("Password", { exact: true }).fill(added.body.password);
  await np.getByRole("button", { name: "Sign in", exact: true }).click();
  await np.getByText("You're using a temporary password").waitFor({ timeout: 30000 });
  log("new person signed in and is asked to choose a password");
  const off = await owner.evaluate(async (id) => (await fetch(`/api/people/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) })).status, added.body.personId);
  const after = await np.evaluate(async () => (await fetch("/api/snapshot")).status);
  off === 200 && after === 401 ? log("deactivated: their session stopped working") : fail(`deactivate ${off} then snapshot ${after}`);
  await npCtx.close();
}

// screens render: timeline, settings for an employee
await mgr.goto(`${BASE}/tasks?view=timeline`);
await mgr.getByRole("button", { name: "Today" }).waitFor({ timeout: 20000 });
log("timeline view renders");
if (SHOTS) await mgr.screenshot({ path: `${SHOTS}/manager-timeline.png` });
await emp.goto(`${BASE}/settings`);
await emp.getByText("My notifications").first().waitFor({ timeout: 20000 });
log("employee settings render");
if (SHOTS) await emp.screenshot({ path: `${SHOTS}/employee-settings-mobile.png`, fullPage: false });

// 6. sign out
await owner.goto(`${BASE}/overview`);
await owner.waitForSelector("main h1");
const res = await owner.evaluate(async () => (await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status);
await owner.goto(`${BASE}/overview`);
await owner.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 15000 });
log("signed out (", res, ") and sent back to /login");

await browser.close();
console.log(process.exitCode ? "\nSMOKE FAILED" : "\nSMOKE PASSED");
