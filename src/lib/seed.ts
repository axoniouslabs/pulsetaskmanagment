import { addDays, addHours, addMinutes, format, startOfDay, subDays } from "date-fns";
import type {
  Activity,
  Announcement,
  AppNotification,
  AttendanceDay,
  ChannelSpace,
  DeadlineRequest,
  Department,
  Group,
  Leave,
  OrgSettings,
  Person,
  Project,
  Question,
  ReminderRule,
  Task,
  Team,
} from "./types";

export interface DailyStat {
  personId: string;
  date: string;
  assigned: number;
  approved: number;
  onTime: number;
  ackMinutes: number;
  remindersSent: number;
  ackFirst: number;
  submissions: number;
  rejections: number;
  estHours: number;
  actualHours: number;
  escalations: number;
  reviewHours: number;
}

export interface SeedData {
  seededAt: string;
  settings: OrgSettings;
  people: Person[];
  departments: Department[];
  teams: Team[];
  groups: Group[];
  projects: Project[];
  tasks: Task[];
  activity: Activity[];
  notifications: AppNotification[];
  channels: ChannelSpace[];
  announcements: Announcement[];
  attendance: AttendanceDay[];
  leaves: Leave[];
  questions: Question[];
  deadlineRequests: DeadlineRequest[];
  stats: DailyStat[];
}

/* deterministic random so the demo looks the same every reset */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString();

export const DEFAULT_REMINDER: ReminderRule = {
  intervalMin: 30,
  window: "working",
  dailyCap: 12,
  channels: ["push", "inapp"],
  quietAfterAckMin: 60,
};

const dev = (kind: "windows" | "android" | "iphone", label: string, now: Date, healthy = true, minsAgo = 3) => ({
  id: `${kind}_${label.replace(/\W/g, "").toLowerCase()}`,
  kind,
  label,
  lastSeen: iso(addMinutes(now, -minsAgo)),
  healthy,
});

/** the demo day always happens inside working hours, whatever time you open it */
function workingAnchor(real: Date) {
  const d = new Date(real);
  const hr = d.getHours() + d.getMinutes() / 60;
  const prevWorkingDay = () => {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 1);
  };
  if (d.getDay() === 0) {
    prevWorkingDay();
    d.setHours(16, 30, 0, 0);
  } else if (hr < 9.75) {
    prevWorkingDay();
    d.setHours(16, 30, 0, 0);
  } else if (hr >= 17.5) {
    d.setHours(17, 15, 0, 0);
  }
  return d;
}

export function createSeed(realNow = new Date()): SeedData {
  const now = workingAnchor(realNow);
  const h = (n: number) => iso(addHours(now, n));
  const m = (n: number) => iso(addMinutes(now, n));
  const today = startOfDay(now);
  const at = (hh: number, mm = 0, dayOffset = 0) => iso(addMinutes(addDays(today, dayOffset), hh * 60 + mm));

  /* ---------------- people & structure ---------------- */
  const P = (
    id: string,
    name: string,
    role: Person["role"],
    title: string,
    departmentId: string,
    teamId: string,
    hue: number,
    extra: Partial<Person> = {},
  ): Person => ({
    id,
    name,
    initials: name
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2),
    role,
    title,
    departmentId,
    teamId,
    hue,
    capacityHours: 8,
    email: `${name.split(" ")[0].toLowerCase()}@crescent.pk`,
    phone: `+92 3${Math.floor(10 + hue / 4)} ${String(1000000 + hue * 3917).slice(0, 7)}`,
    workType: "desk",
    devices: [dev("windows", "Office PC", now), dev("android", "Android phone", now, true, 12)],
    ...extra,
  });

  const people: Person[] = [
    P("p_imran", "Imran Qureshi", "owner", "Managing Director", "", "", 205, {
      devices: [dev("windows", "Office PC", now), dev("iphone", "iPhone 15", now, true, 20)],
    }),
    P("p_hina", "Hina Raza", "manager", "Head of Sales", "d_sales", "t_inside", 330),
    P("p_usman", "Usman Tariq", "manager", "Field Sales Lead", "d_sales", "t_field", 25),
    P("p_kamran", "Kamran Ali", "employee", "Sales Officer", "d_sales", "t_field", 40, {
      workType: "field",
      devices: [dev("android", "Android phone", now, true, 410)],
    }),
    P("p_faisal", "Faisal Mehmood", "employee", "Sales Officer", "d_sales", "t_field", 140, {
      workType: "field",
      devices: [dev("android", "Android phone", now, false, 60 * 26)],
    }),
    P("p_ayesha", "Ayesha Siddiqui", "employee", "Inside Sales Executive", "d_sales", "t_inside", 290),
    P("p_sana", "Sana Malik", "manager", "Head of Operations", "d_ops", "t_ware", 175),
    P("p_zain", "Zain Abbas", "manager", "Dispatch Lead", "d_ops", "t_dispatch", 60),
    P("p_hamza", "Hamza Iqbal", "employee", "Delivery Rider", "d_ops", "t_dispatch", 100, {
      workType: "field",
      devices: [dev("android", "Android phone", now, true, 18)],
    }),
    P("p_rabia", "Rabia Noor", "employee", "Warehouse Officer", "d_ops", "t_ware", 310),
    P("p_nadia", "Nadia Hussain", "manager", "Head of Accounts", "d_acc", "t_billing", 260),
    P("p_omar", "Omar Farooq", "manager", "Billing Lead", "d_acc", "t_billing", 220),
    P("p_mariam", "Mariam Shah", "employee", "Accounts Officer", "d_acc", "t_billing", 350),
    P("p_saad", "Saad Khan", "manager", "Head of Development", "d_dev", "t_product", 190),
    P("p_ali", "Ali Raza", "employee", "Software Engineer", "d_dev", "t_product", 160, { backupId: "p_danish" }),
    P("p_danish", "Danish Javed", "employee", "Software Engineer", "d_dev", "t_product", 120),
    P("p_mehwish", "Mehwish Akhtar", "manager", "Design Lead", "d_dev", "t_design", 15),
    P("p_zoya", "Zoya Ahmed", "employee", "Graphic Designer", "d_dev", "t_design", 275, {
      onLeave: true,
      backupId: "p_mehwish",
    }),
    P("p_farah", "Farah Naz", "manager", "Admin & HR Manager", "d_admin", "t_admin", 240),
    P("p_waqas", "Waqas Ahmed", "employee", "Office Assistant", "d_admin", "t_admin", 80, {
      devices: [dev("android", "Android phone", now, true, 30)],
    }),
  ];

  const departments: Department[] = [
    { id: "d_sales", name: "Sales", headId: "p_hina", description: "Field visits, dealers and inbound leads" },
    { id: "d_ops", name: "Operations", headId: "p_sana", description: "Warehouse, stock and deliveries" },
    { id: "d_acc", name: "Accounts", headId: "p_nadia", description: "Billing, payments and tax" },
    { id: "d_dev", name: "Development", headId: "p_saad", description: "Dealer app, website and design" },
    { id: "d_admin", name: "Admin & HR", headId: "p_farah", description: "Office, hiring, payroll inputs and facilities" },
  ];

  const teams: Team[] = [
    { id: "t_field", name: "Field Sales", departmentId: "d_sales", leadId: "p_usman" },
    { id: "t_inside", name: "Inside Sales", departmentId: "d_sales", leadId: "p_hina" },
    { id: "t_dispatch", name: "Dispatch", departmentId: "d_ops", leadId: "p_zain" },
    { id: "t_ware", name: "Warehouse", departmentId: "d_ops", leadId: "p_sana" },
    { id: "t_billing", name: "Billing", departmentId: "d_acc", leadId: "p_omar" },
    { id: "t_product", name: "Product", departmentId: "d_dev", leadId: "p_saad" },
    { id: "t_design", name: "Design", departmentId: "d_dev", leadId: "p_mehwish" },
    { id: "t_admin", name: "Office", departmentId: "d_admin", leadId: "p_farah" },
  ];

  const groups: Group[] = [
    {
      id: "g_alhabib",
      name: "Al-Habib Stores account",
      description: "Everyone serving our biggest dealer",
      memberIds: ["p_kamran", "p_ayesha", "p_omar", "p_hamza"],
      ownerId: "p_hina",
    },
    {
      id: "g_launch",
      name: "Dealer app v2.3 launch",
      description: "Release squad until launch day",
      memberIds: ["p_ali", "p_danish", "p_zoya", "p_ayesha"],
      ownerId: "p_saad",
    },
    {
      id: "g_saturday",
      name: "Saturday shift",
      description: "Who covers the half-day Saturday",
      memberIds: ["p_rabia", "p_hamza", "p_mariam"],
      ownerId: "p_sana",
    },
  ];

  const projects: Project[] = [
    { id: "pr_app", name: "Dealer app", hue: 190, leadId: "p_saad" },
    { id: "pr_price", name: "Q4 price list", hue: 40, leadId: "p_hina" },
    { id: "pr_alhabib", name: "Al-Habib Stores", hue: 330, leadId: "p_hina" },
    { id: "pr_catalog", name: "Winter catalog", hue: 275, leadId: "p_mehwish" },
    { id: "pr_fleet", name: "Fleet & vans", hue: 100, leadId: "p_zain" },
  ];

  /* ---------------- tasks ---------------- */
  let n = 0;
  const T = (t: Partial<Task> & Pick<Task, "title" | "assigneeId" | "dueAt">): Task => {
    const assignee = people.find((p) => p.id === t.assigneeId)!;
    const reviewer =
      t.reviewerId ??
      teams.find((tm) => tm.id === assignee.teamId)?.leadId ??
      "p_imran";
    const createdAt = t.createdAt ?? h(-30);
    return {
      id: `task_${++n}`,
      description: "",
      createdById: reviewer === assignee.id ? "p_imran" : reviewer,
      reviewerId: reviewer === assignee.id ? "p_imran" : reviewer,
      departmentId: assignee.departmentId || "d_ops",
      priority: "normal",
      status: "assigned",
      createdAt,
      estimateHours: 2,
      requiresApproval: true,
      requiresProof: false,
      requiresResult: false,
      reminder: { ...DEFAULT_REMINDER },
      remindersSent: 0,
      remindersIgnored: 0,
      escalationLevel: 0,
      subtasks: [],
      comments: [],
      attachments: [],
      watcherIds: [],
      tags: [],
      rejections: 0,
      statusChangedAt: createdAt,
      snoozesToday: 0,
      loggedMinutes: 0,
      ...t,
    };
  };
  let sn = 0;
  const sub = (title: string, done = false) => ({ id: `s_${++sn}`, title, done });

  const tasks: Task[] = [
    /* ---- Ali (default employee) ---- */
    T({
      title: "Fix OTP login failing for dealers on Jazz numbers",
      description:
        "Dealers on Jazz SIMs are not receiving the login OTP since this morning. Check the SMS gateway logs, add a fallback to WhatsApp OTP if the SMS fails twice.",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "urgent",
      status: "assigned",
      createdAt: m(-38),
      statusChangedAt: m(-38),
      dueAt: h(3),
      estimateHours: 3,
      reminder: { ...DEFAULT_REMINDER, intervalMin: 10 },
      remindersSent: 3,
      remindersIgnored: 2,
      lastReminderAt: m(-8),
      escalationLevel: 0,
      tags: ["bug", "dealers"],
      watcherIds: ["p_imran"],
      subtasks: [sub("Reproduce with a Jazz test SIM"), sub("Check gateway delivery report"), sub("Add WhatsApp fallback")],
    }),
    T({
      title: "Add Urdu labels to the order form",
      description: "All field labels and buttons on the dealer order form need Urdu text. Use the glossary from Hina.",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "high",
      status: "acknowledged",
      createdAt: h(-5),
      acknowledgedAt: h(-4.6),
      statusChangedAt: h(-4.6),
      dueAt: h(5),
      estimateHours: 2,
      remindersSent: 1,
      lastReminderAt: h(-4.7),
      tags: ["urdu"],
    }),
    T({
      title: "Ship price-list sync to the dealer app",
      description: "Dealers should see the Q4 price list within 5 minutes of Accounts publishing it.",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_price",
      priority: "high",
      status: "in_progress",
      createdAt: h(-28),
      acknowledgedAt: h(-27.5),
      startedAt: h(-6),
      statusChangedAt: h(-6),
      dueAt: h(20),
      estimateHours: 6,
      loggedMinutes: 145,
      remindersSent: 2,
      subtasks: [
        sub("Read price list from Accounts sheet", true),
        sub("Cache prices on the phone for offline", true),
        sub("Show 'updated 2 min ago' label"),
        sub("Test with 3 dealers"),
      ],
      comments: [
        { id: "c1", authorId: "p_saad", body: "Keep the old price visible until the new one is confirmed.", at: h(-5), kind: "text" },
        { id: "c2", authorId: "p_ali", body: "Done. Old price shows with a strike-through for 24 hours.", at: h(-4), kind: "text" },
      ],
    }),
    T({
      title: "Write release notes for v2.3",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "normal",
      status: "assigned",
      createdAt: m(-12),
      statusChangedAt: m(-12),
      dueAt: at(12, 0, 1),
      estimateHours: 1,
      remindersSent: 0,
    }),
    T({
      title: "Upload screenshots of the new checkout",
      description: "Six screenshots for the launch post, light background.",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "low",
      status: "submitted",
      requiresProof: true,
      createdAt: h(-26),
      acknowledgedAt: h(-25),
      startedAt: h(-6),
      submittedAt: h(-3),
      statusChangedAt: h(-3),
      submissionNote: "All six uploaded, named in order.",
      dueAt: h(6),
      estimateHours: 1,
      loggedMinutes: 55,
      attachments: [
        { id: "a1", name: "checkout-1.png", kind: "image", sizeKb: 412, at: h(-3), byId: "p_ali", isProof: true, hue: 190 },
        { id: "a2", name: "checkout-2.png", kind: "image", sizeKb: 398, at: h(-3), byId: "p_ali", isProof: true, hue: 160 },
      ],
    }),
    T({
      title: "Daily standup update",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      priority: "normal",
      status: "approved",
      recurrence: "daily",
      requiresApproval: false,
      createdAt: at(9, 0),
      acknowledgedAt: at(9, 4),
      submittedAt: at(9, 22),
      approvedAt: at(9, 22),
      statusChangedAt: at(9, 22),
      dueAt: at(10, 0),
      estimateHours: 0.25,
      loggedMinutes: 10,
      remindersSent: 1,
    }),
    T({
      title: "Investigate slow reports page",
      description: "Reports page takes 9 seconds for the Accounts team. Need production read access to check queries.",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "high",
      status: "blocked",
      blockedReason: "Need read access to the production database. Asked Saad this morning.",
      blockedOwnerId: "p_saad",
      blockedAt: h(-2.2),
      createdAt: h(-23),
      acknowledgedAt: h(-22),
      startedAt: h(-4),
      statusChangedAt: h(-2.2),
      dueAt: at(17, 0, 1),
      estimateHours: 4,
      loggedMinutes: 70,
    }),
    T({
      title: "Update app icon for Android",
      assigneeId: "p_ali",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "low",
      status: "approved",
      createdAt: h(-50),
      acknowledgedAt: h(-49),
      submittedAt: h(-27),
      approvedAt: h(-24),
      statusChangedAt: h(-24),
      dueAt: h(-22),
      estimateHours: 1,
      loggedMinutes: 50,
    }),

    /* ---- red panel: overdue ---- */
    T({
      title: "Collect payment cheque from Gulberg distributor",
      description: "Rs 4,85,000 cheque promised for last Friday. Collect and photograph it.",
      assigneeId: "p_kamran",
      reviewerId: "p_hina",
      projectId: "pr_alhabib",
      priority: "urgent",
      status: "assigned",
      requiresProof: true,
      createdAt: h(-52),
      statusChangedAt: h(-52),
      dueAt: h(-27),
      remindersSent: 16,
      remindersIgnored: 13,
      lastReminderAt: m(-24),
      escalationLevel: 4,
      tags: ["payment"],
    }),
    T({
      title: "Upload delivery photos for order #4412",
      description: "40 cartons to Multan. Photo of each drop with the shop sign visible.",
      assigneeId: "p_hamza",
      reviewerId: "p_zain",
      projectId: "pr_fleet",
      priority: "high",
      status: "acknowledged",
      requiresProof: true,
      createdAt: h(-9),
      acknowledgedAt: h(-8.5),
      statusChangedAt: h(-8.5),
      dueAt: h(-3.2),
      remindersSent: 9,
      remindersIgnored: 6,
      lastReminderAt: m(-15),
      escalationLevel: 3,
    }),
    T({
      title: "Reconcile HBL bank statement for September",
      assigneeId: "p_mariam",
      reviewerId: "p_nadia",
      priority: "high",
      status: "in_progress",
      createdAt: h(-30),
      acknowledgedAt: h(-29),
      startedAt: h(-7),
      statusChangedAt: h(-7),
      dueAt: h(-5),
      estimateHours: 5,
      loggedMinutes: 230,
      remindersSent: 6,
      remindersIgnored: 1,
      escalationLevel: 3,
      subtasks: [sub("Match deposits", true), sub("Match withdrawals", true), sub("List unmatched entries")],
    }),

    /* ---- red panel: never acknowledged ---- */
    T({
      title: "Set up new display at the Faisal Town shop",
      assigneeId: "p_faisal",
      reviewerId: "p_usman",
      projectId: "pr_catalog",
      priority: "high",
      status: "assigned",
      requiresProof: true,
      createdAt: h(-2.4),
      statusChangedAt: h(-2.4),
      dueAt: h(4),
      reminder: { ...DEFAULT_REMINDER, intervalMin: 15 },
      remindersSent: 7,
      remindersIgnored: 6,
      lastReminderAt: m(-6),
      escalationLevel: 2,
    }),
    T({
      title: "Review pull request #212 — dealer search",
      assigneeId: "p_danish",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "normal",
      status: "assigned",
      createdAt: m(-95),
      statusChangedAt: m(-95),
      dueAt: h(6),
      remindersSent: 4,
      remindersIgnored: 3,
      lastReminderAt: m(-5),
      escalationLevel: 1,
    }),
    T({
      title: "Count stock in rack B before the audit",
      assigneeId: "p_rabia",
      reviewerId: "p_sana",
      priority: "normal",
      status: "assigned",
      createdAt: m(-100),
      statusChangedAt: m(-100),
      dueAt: h(5),
      remindersSent: 3,
      remindersIgnored: 3,
      lastReminderAt: m(-10),
      escalationLevel: 1,
    }),

    /* ---- blocked ---- */
    T({
      title: "Send quotation to Shan Foods",
      assigneeId: "p_ayesha",
      reviewerId: "p_hina",
      projectId: "pr_price",
      priority: "high",
      status: "blocked",
      blockedReason: "Waiting for the updated carton rates from Accounts.",
      blockedOwnerId: "p_omar",
      blockedAt: h(-5.3),
      createdAt: h(-8),
      acknowledgedAt: h(-7.8),
      startedAt: h(-7),
      statusChangedAt: h(-5.3),
      dueAt: h(7),
    }),

    /* ---- waiting on reviewer > 24h ---- */
    T({
      title: "Renew insurance for van LHR-4471",
      assigneeId: "p_zain",
      reviewerId: "p_sana",
      projectId: "pr_fleet",
      priority: "normal",
      status: "submitted",
      requiresProof: true,
      createdAt: h(-75),
      acknowledgedAt: h(-74),
      startedAt: h(-50),
      submittedAt: h(-27),
      statusChangedAt: h(-27),
      submissionNote: "Renewed with Adamjee. Policy PDF attached.",
      dueAt: h(10),
      attachments: [{ id: "a3", name: "policy-LHR4471.pdf", kind: "file", sizeKb: 880, at: h(-27), byId: "p_zain", isProof: true }],
    }),
    T({
      title: "Prepare GST summary for September",
      assigneeId: "p_mariam",
      reviewerId: "p_nadia",
      priority: "high",
      status: "submitted",
      createdAt: h(-80),
      acknowledgedAt: h(-79),
      startedAt: h(-60),
      submittedAt: h(-30),
      statusChangedAt: h(-30),
      submissionNote: "Summary sheet ready. Two invoices need your sign-off.",
      dueAt: h(30),
      rejections: 1,
      lastRejectionReason: "Missing the Lahore branch invoices.",
      estimateHours: 4,
      loggedMinutes: 320,
    }),

    /* ---- Development team (manager view) ---- */
    T({
      title: "Design winter catalog cover",
      assigneeId: "p_zoya",
      reviewerId: "p_mehwish",
      projectId: "pr_catalog",
      priority: "normal",
      status: "in_progress",
      createdAt: h(-50),
      acknowledgedAt: h(-49),
      startedAt: h(-30),
      statusChangedAt: h(-30),
      dueAt: h(28),
      estimateHours: 8,
      loggedMinutes: 300,
    }),
    T({
      title: "Fix crash when the dealer has no orders",
      assigneeId: "p_danish",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "high",
      status: "submitted",
      createdAt: h(-20),
      acknowledgedAt: h(-19.5),
      startedAt: h(-8),
      submittedAt: m(-50),
      statusChangedAt: m(-50),
      submissionNote: "Empty state added. Tested on Android 10 and 14.",
      dueAt: h(4),
      estimateHours: 2,
      loggedMinutes: 105,
    }),
    T({
      title: "Prepare banner sizes for Facebook ads",
      assigneeId: "p_mehwish",
      reviewerId: "p_saad",
      projectId: "pr_catalog",
      priority: "normal",
      status: "in_progress",
      createdAt: h(-10),
      acknowledgedAt: h(-9),
      startedAt: h(-3),
      statusChangedAt: h(-3),
      dueAt: h(26),
      estimateHours: 3,
      loggedMinutes: 90,
    }),
    T({
      title: "Add offline mode to the order screen",
      assigneeId: "p_danish",
      reviewerId: "p_saad",
      projectId: "pr_app",
      priority: "normal",
      status: "acknowledged",
      createdAt: h(-6),
      acknowledgedAt: h(-5),
      statusChangedAt: h(-5),
      dueAt: at(18, 0, 3),
      estimateHours: 10,
    }),

    /* ---- Sales / Ops / Accounts healthy flow ---- */
    T({
      title: "Call back 6 Facebook leads from yesterday",
      assigneeId: "p_ayesha",
      reviewerId: "p_hina",
      priority: "high",
      status: "in_progress",
      createdAt: h(-4),
      acknowledgedAt: h(-3.9),
      startedAt: h(-3),
      statusChangedAt: h(-3),
      dueAt: h(2),
      estimateHours: 2,
      loggedMinutes: 70,
      subtasks: [sub("Bilal Traders", true), sub("Noor Mart", true), sub("City Cash & Carry", true), sub("Rehman Stores"), sub("Madina Mart"), sub("Usmania Bakers")],
    }),
    T({
      title: "Visit 4 shops in Model Town for winter orders",
      assigneeId: "p_kamran",
      reviewerId: "p_usman",
      priority: "normal",
      status: "acknowledged",
      createdAt: h(-3),
      acknowledgedAt: h(-1),
      statusChangedAt: h(-1),
      dueAt: h(6),
      estimateHours: 5,
    }),
    T({
      title: "Dispatch 40 cartons to Multan",
      assigneeId: "p_hamza",
      reviewerId: "p_zain",
      projectId: "pr_fleet",
      priority: "high",
      status: "approved",
      requiresProof: true,
      createdAt: h(-30),
      acknowledgedAt: h(-29.5),
      submittedAt: h(-11),
      approvedAt: h(-10),
      statusChangedAt: h(-10),
      dueAt: h(-9),
      loggedMinutes: 380,
    }),
    T({
      title: "Issue invoices to Al-Habib Stores",
      assigneeId: "p_omar",
      reviewerId: "p_nadia",
      projectId: "pr_alhabib",
      priority: "high",
      status: "approved",
      createdAt: h(-28),
      acknowledgedAt: h(-27.8),
      submittedAt: h(-6),
      approvedAt: h(-5),
      statusChangedAt: h(-5),
      dueAt: h(-2),
      loggedMinutes: 160,
    }),
    T({
      title: "Publish Q4 carton rates",
      assigneeId: "p_omar",
      reviewerId: "p_nadia",
      projectId: "pr_price",
      priority: "urgent",
      status: "in_progress",
      createdAt: h(-6),
      acknowledgedAt: h(-5.8),
      startedAt: h(-2),
      statusChangedAt: h(-2),
      dueAt: h(1.5),
      estimateHours: 2,
      loggedMinutes: 80,
    }),
    T({
      title: "Weekly stock report",
      assigneeId: "p_rabia",
      reviewerId: "p_sana",
      priority: "normal",
      status: "approved",
      recurrence: "weekly",
      createdAt: h(-28),
      acknowledgedAt: h(-27),
      submittedAt: h(-8),
      approvedAt: h(-7),
      statusChangedAt: h(-7),
      dueAt: h(-6),
      loggedMinutes: 95,
    }),
    T({
      title: "Book vehicle service for Suzuki van",
      assigneeId: "p_zain",
      reviewerId: "p_sana",
      projectId: "pr_fleet",
      priority: "low",
      status: "acknowledged",
      createdAt: h(-20),
      acknowledgedAt: h(-19),
      statusChangedAt: h(-19),
      dueAt: at(12, 0, 2),
      estimateHours: 1,
    }),
    T({
      title: "Follow up on overdue payments over 60 days",
      assigneeId: "p_mariam",
      reviewerId: "p_nadia",
      priority: "normal",
      status: "acknowledged",
      createdAt: h(-3),
      acknowledgedAt: h(-2.5),
      statusChangedAt: h(-2.5),
      dueAt: h(22),
      estimateHours: 3,
    }),
    T({
      title: "Answer 5 new leads from the website",
      assigneeId: "p_hina",
      reviewerId: "p_imran",
      priority: "normal",
      status: "assigned",
      groupClaim: { unitName: "Inside Sales", claimed: false },
      createdAt: m(-40),
      statusChangedAt: m(-40),
      dueAt: h(3),
      remindersSent: 2,
      remindersIgnored: 1,
      lastReminderAt: m(-10),
      escalationLevel: 0,
    }),
    T({
      title: "Opening checklist — warehouse",
      assigneeId: "p_rabia",
      reviewerId: "p_sana",
      priority: "normal",
      status: "approved",
      recurrence: "daily",
      requiresApproval: false,
      createdAt: at(8, 45),
      acknowledgedAt: at(9, 2),
      submittedAt: at(9, 30),
      approvedAt: at(9, 30),
      statusChangedAt: at(9, 30),
      dueAt: at(9, 45),
      estimateHours: 0.5,
      loggedMinutes: 25,
    }),
    T({
      title: "Plan the dealer meet-up in Bahawalpur",
      assigneeId: "p_hina",
      reviewerId: "p_imran",
      priority: "normal",
      status: "in_progress",
      createdAt: h(-48),
      acknowledgedAt: h(-47),
      startedAt: h(-24),
      statusChangedAt: h(-24),
      dueAt: at(17, 0, 6),
      estimateHours: 6,
      loggedMinutes: 120,
    }),
    T({
      title: "Hire a second delivery rider",
      assigneeId: "p_sana",
      reviewerId: "p_imran",
      priority: "normal",
      status: "in_progress",
      createdAt: h(-90),
      acknowledgedAt: h(-89),
      startedAt: h(-70),
      statusChangedAt: h(-70),
      dueAt: at(17, 0, 9),
      estimateHours: 6,
    }),
    T({
      title: "Collect October attendance sheets for payroll",
      assigneeId: "p_waqas",
      reviewerId: "p_farah",
      priority: "high",
      status: "acknowledged",
      createdAt: h(-6),
      acknowledgedAt: h(-5.5),
      statusChangedAt: h(-5.5),
      dueAt: h(26),
      estimateHours: 2,
      remindersSent: 1,
    }),
    T({
      title: "Shortlist candidates for the delivery rider post",
      assigneeId: "p_farah",
      reviewerId: "p_sana",
      priority: "normal",
      status: "in_progress",
      createdAt: h(-30),
      acknowledgedAt: h(-29),
      startedAt: h(-20),
      statusChangedAt: h(-20),
      dueAt: h(50),
      estimateHours: 4,
      loggedMinutes: 95,
      subtasks: [sub("Post the job on Rozee.pk", true), sub("Screen CVs"), sub("Book interviews")],
    }),
    T({
      title: "Draft: new dealer onboarding checklist",
      assigneeId: "p_hina",
      reviewerId: "p_imran",
      createdById: "p_imran",
      status: "draft",
      createdAt: h(-1),
      statusChangedAt: h(-1),
      dueAt: at(17, 0, 7),
    }),
    T({
      title: "Old: print brochures for the expo",
      assigneeId: "p_zoya",
      reviewerId: "p_mehwish",
      status: "cancelled",
      createdAt: h(-120),
      statusChangedAt: h(-70),
      dueAt: h(-60),
    }),
  ];

  /* keep due times inside working hours (09:00–18:00, Mon–Sat) so the demo reads like a real office */
  const snapDue = (isoStr: string, salt: number) => {
    const d = new Date(isoStr);
    const future = d.getTime() > now.getTime();
    const floor = Math.max(now.getTime(), realNow.getTime());
    const mins = d.getMinutes();
    d.setMinutes(mins < 15 ? 0 : mins < 45 ? 30 : 60, 0, 0);
    const hr = d.getHours() + d.getMinutes() / 60;
    if (hr >= 9 && hr <= 18 && d.getDay() !== 0) {
      if (future ? d.getTime() > floor + 30 * 60000 : d.getTime() < now.getTime()) return d.toISOString();
    }
    if (future) {
      const base = new Date(d);
      if (hr > 18) base.setDate(base.getDate() + 1);
      if (base.getDay() === 0) base.setDate(base.getDate() + 1);
      base.setHours(10 + (salt % 7), salt % 2 ? 30 : 0, 0, 0);
      while (base.getTime() <= floor || base.getDay() === 0) base.setDate(base.getDate() + 1);
      return base.toISOString();
    }
    const base = new Date(d);
    if (hr < 9) base.setDate(base.getDate() - 1);
    if (base.getDay() === 0) base.setDate(base.getDate() - 1);
    base.setHours(17, 0, 0, 0);
    if (base.getTime() >= now.getTime()) base.setTime(base.getTime() - 3 * 3600000);
    return base.toISOString();
  };
  tasks.forEach((t, i) => {
    if (!t.recurrence) t.dueAt = snapDue(t.dueAt, i * 3 + 1);
  });

  /* ---------------- activity (append-only log) ---------------- */
  const activity: Activity[] = [];
  let a = 0;
  const log = (atIso: string, actorId: string, kind: Activity["kind"], text: string, taskId?: string) =>
    activity.push({ id: `act_${++a}`, at: atIso, actorId, kind, text, taskId });
  const name = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";

  for (const t of tasks) {
    if (t.status === "draft") {
      log(t.createdAt, t.createdById, "created", "Saved as draft", t.id);
      continue;
    }
    log(t.createdAt, t.createdById, "assigned", `Assigned to ${name(t.assigneeId)}`, t.id);
    const created = new Date(t.createdAt).getTime();
    const firstResponse = t.acknowledgedAt ? new Date(t.acknowledgedAt).getTime() : now.getTime();
    for (let i = 0; i < t.remindersSent; i++) {
      const rt = created + (i + 1) * t.reminder.intervalMin * 60000;
      if (rt > firstResponse && t.acknowledgedAt) break;
      if (rt > now.getTime()) break;
      log(iso(new Date(rt)), "system", "reminder_sent", `Reminder ${i + 1} delivered to ${name(t.assigneeId)}'s phone and PC`, t.id);
    }
    if (t.escalationLevel >= 1) log(t.lastReminderAt ?? t.createdAt, "system", "escalated", `Escalated to level ${t.escalationLevel}`, t.id);
    if (t.acknowledgedAt) log(t.acknowledgedAt, t.assigneeId, "acknowledged", "Acknowledged", t.id);
    if (t.startedAt) log(t.startedAt, t.assigneeId, "started", "Started work", t.id);
    for (const c of t.comments) log(c.at, c.authorId, "commented", c.body, t.id);
    if (t.blockedAt) log(t.blockedAt, t.assigneeId, "blocked", `Blocked: ${t.blockedReason}`, t.id);
    if (t.submittedAt) log(t.submittedAt, t.assigneeId, "submitted", t.submissionNote ? `Submitted: ${t.submissionNote}` : "Submitted for review", t.id);
    if (t.approvedAt) log(t.approvedAt, t.requiresApproval ? t.reviewerId : "system", "approved", t.requiresApproval ? "Approved" : "Auto-approved (routine task)", t.id);
    if (t.status === "cancelled") log(t.statusChangedAt, t.reviewerId, "cancelled", "Cancelled: no longer needed after the expo was moved", t.id);
  }
  log(h(-22), "system", "reminders_paused", "Reminders paused until 9:00 AM — outside working hours", "task_9");
  log(m(-26 * 60), "system", "reminder_failed", "Push to Faisal's Android phone failed (subscription expired). Not counted as ignored.", "task_12");

  /* ---------------- attendance (last 14 days) ---------------- */
  const r = rng(42);
  const attendance: AttendanceDay[] = [];
  for (let d = 13; d >= 0; d--) {
    const day = subDays(today, d);
    const dateStr = format(day, "yyyy-MM-dd");
    for (const p of people) {
      if (day.getDay() === 0) {
        attendance.push({ personId: p.id, date: dateStr, breakMin: 0, status: "weekend" });
        continue;
      }
      if (p.id === "p_zoya" && d === 0) {
        attendance.push({ personId: p.id, date: dateStr, breakMin: 0, status: "leave" });
        continue;
      }
      const roll = r();
      if (roll < 0.03 && d > 0) {
        attendance.push({ personId: p.id, date: dateStr, breakMin: 0, status: "absent" });
        continue;
      }
      const jitter = r();
      const inMin = 9 * 60 - 14 + Math.floor(jitter * jitter * 46) + (p.workType === "field" ? 6 : 0);
      const outMin = 18 * 60 - 20 + Math.floor(r() * 70);
      const checkIn = iso(addMinutes(day, inMin));
      const isLate = inMin > 9 * 60 + 15;
      attendance.push({
        personId: p.id,
        date: dateStr,
        checkIn,
        checkOut: d === 0 ? undefined : iso(addMinutes(day, outMin)),
        breakMin: d === 0 ? 0 : 30 + Math.floor(r() * 30),
        status: isLate ? "late" : "present",
      });
    }
  }

  const leaves: Leave[] = [
    { id: "lv1", personId: "p_zoya", from: format(today, "yyyy-MM-dd"), to: format(addDays(today, 1), "yyyy-MM-dd"), type: "sick", status: "approved", note: "Fever, doctor's note shared" },
    { id: "lv2", personId: "p_faisal", from: format(addDays(today, 6), "yyyy-MM-dd"), to: format(addDays(today, 8), "yyyy-MM-dd"), type: "annual", status: "pending", note: "Sister's wedding in Sahiwal" },
    { id: "lv3", personId: "p_mariam", from: format(subDays(today, 9), "yyyy-MM-dd"), to: format(subDays(today, 9), "yyyy-MM-dd"), type: "casual", status: "approved" },
    { id: "lv4", personId: "p_danish", from: format(addDays(today, 12), "yyyy-MM-dd"), to: format(addDays(today, 12), "yyyy-MM-dd"), type: "casual", status: "pending", note: "University exam" },
  ];

  /* ---------------- channels & announcements ---------------- */
  const channels: ChannelSpace[] = [
    { id: "c_all", name: "Company notices", kind: "announcement", unitType: "org", unitId: "org", description: "Policies and notices for everyone" },
    { id: "c_sales", name: "Sales", kind: "open", unitType: "department", unitId: "d_sales", description: "Day-to-day coordination for the sales department" },
    { id: "c_ops", name: "Operations", kind: "open", unitType: "department", unitId: "d_ops", description: "Warehouse and dispatch" },
    { id: "c_acc", name: "Accounts", kind: "open", unitType: "department", unitId: "d_acc", description: "Billing and payments" },
    { id: "c_dev", name: "Development", kind: "open", unitType: "department", unitId: "d_dev", description: "Dealer app, website and design" },
    { id: "c_admin", name: "Admin & HR", kind: "open", unitType: "department", unitId: "d_admin", description: "Office, hiring and payroll" },
    { id: "c_launch", name: "Dealer app v2.3 launch", kind: "open", unitType: "group", unitId: "g_launch", description: "Release squad" },
    { id: "c_devfeed", name: "Development task feed", kind: "task_feed", unitType: "department", unitId: "d_dev", description: "Automatic stream of task events" },
  ];

  const everyone = people.map((p) => p.id);
  const ackSome = (ids: string[], hoursAgo: number) =>
    Object.fromEntries(ids.map((id, i) => [id, h(-hoursAgo + i * 0.3)]));

  const announcements: Announcement[] = [
    {
      id: "an1",
      channelId: "c_all",
      authorId: "p_imran",
      at: h(-20),
      title: "Use the Blocked button when you are stuck",
      body: "If you cannot continue a task because you are waiting on someone, tap Blocked and write one line. Reminders stop and your manager is told straight away. Being blocked never counts against you.",
      requiresAck: true,
      ackDueAt: h(4),
      ackBy: ackSome(everyone.filter((id) => !["p_kamran", "p_faisal", "p_hamza", "p_ali"].includes(id)), 19),
      readBy: ackSome(everyone.filter((id) => !["p_kamran", "p_faisal"].includes(id)), 19),
      pinned: true,
    },
    {
      id: "an2",
      channelId: "c_all",
      authorId: "p_imran",
      at: h(-70),
      title: "New leave policy from November",
      body: "Casual leave now needs one day's notice in the app. Sick leave can be marked the same morning. The full policy is pinned in this channel.",
      requiresAck: true,
      ackDueAt: h(-22),
      ackBy: ackSome(everyone.filter((id) => id !== "p_kamran"), 60),
      readBy: ackSome(everyone, 66),
    },
    {
      id: "an3",
      channelId: "c_dev",
      authorId: "p_saad",
      at: h(-5),
      title: "v2.3 goes to dealers on Thursday",
      body: "Code freeze is Wednesday 6 PM. Anything not merged by then moves to v2.4.",
      requiresAck: false,
      ackBy: {},
      readBy: ackSome(["p_danish", "p_mehwish"], 4),
    },
    {
      id: "an4",
      channelId: "c_ops",
      authorId: "p_sana",
      at: h(-26),
      title: "Stock audit on Saturday",
      body: "Auditors arrive at 10 AM. Racks A to D must be counted by Friday evening.",
      requiresAck: true,
      ackDueAt: h(20),
      ackBy: ackSome(["p_zain", "p_hamza"], 25),
      readBy: ackSome(["p_zain", "p_hamza", "p_rabia"], 25),
    },
    {
      id: "an5",
      channelId: "c_sales",
      authorId: "p_hina",
      at: h(-9),
      title: "Q4 price list is coming today",
      body: "Do not send any quotations until Omar publishes the new carton rates.",
      requiresAck: false,
      ackBy: {},
      readBy: ackSome(["p_usman", "p_ayesha", "p_kamran"], 8),
    },
  ];
  announcements.forEach((an, k) => {
    an.at = snapDue(an.at, k * 5 + 2);
    if (an.ackDueAt) an.ackDueAt = snapDue(an.ackDueAt, k * 5 + 4);
    const postedAt = new Date(an.at).getTime();
    const stamp = (map: Record<string, string>) =>
      Object.fromEntries(Object.keys(map).map((id, i) => [id, iso(new Date(Math.min(now.getTime(), postedAt + (i + 1) * 7 * 60000)))]));
    an.ackBy = stamp(an.ackBy);
    an.readBy = stamp(an.readBy);
  });
  for (const an of announcements) log(an.at, an.authorId, "announcement", `Posted "${an.title}"`);

  /* ---------------- questions & deadline requests ---------------- */
  const questions: Question[] = [
    { id: "q1", fromId: "p_rabia", toId: "p_imran", taskId: "task_14", body: "Should the rack B count include the damaged cartons kept aside?", at: m(-34) },
    { id: "q2", fromId: "p_ali", toId: "p_saad", taskId: "task_1", body: "Can I use the WhatsApp API key from the old project for the OTP fallback?", at: m(-20) },
    { id: "q3", fromId: "p_ayesha", toId: "p_hina", taskId: "task_15", body: "Can I send last quarter's rates to Shan Foods with a note?", at: h(-5), answer: "No, wait for Omar's new rates. I've asked him to prioritise it.", answeredAt: h(-4.8) },
  ];
  for (const q of questions) log(q.at, q.fromId, "question", `Asked ${name(q.toId)}: ${q.body}`, q.taskId);

  const deadlineRequests: DeadlineRequest[] = [
    { id: "dr1", taskId: "task_10", byId: "p_hamza", newDueAt: at(13, 0, 1), reason: "Two shops were closed, I will revisit them tomorrow morning.", at: m(-40), status: "pending" },
  ];

  /* ---------------- notifications ---------------- */
  const notifications: AppNotification[] = [];
  let nn = 0;
  const notify = (recipientId: string, kind: AppNotification["kind"], title: string, body: string, atIso: string, taskId?: string, read = false) =>
    notifications.push({ id: `n_${++nn}`, recipientId, kind, title, body, at: atIso, taskId, read });

  // owner
  notify("p_imran", "escalation", "Kamran has not responded for 27 hours", "Collect payment cheque from Gulberg distributor is level 4. 16 reminders delivered, none opened.", m(-24), "task_9");
  notify("p_imran", "question", "Rabia asked you a question", "Should the rack B count include the damaged cartons kept aside?", m(-34), "task_14");
  notify("p_imran", "escalation", "Hamza's delivery photos are 3 hours late", "Upload delivery photos for order #4412 reached level 3.", m(-15), "task_10");
  notify("p_imran", "submitted", "Zain's submission waiting 27 hours", "Renew insurance for van LHR-4471 is waiting on Sana's review.", h(-3), "task_16");
  notify("p_imran", "digest", "Yesterday's summary", "14 approved, 2 overdue, 1 blocked, 3 waiting for review.", at(18, 30, -1), undefined, true);
  // manager Saad
  notify("p_saad", "blocked", "Ali is blocked and waiting on you", "Investigate slow reports page: Need read access to the production database.", h(-2.2), "task_7");
  notify("p_saad", "submitted", "Danish submitted work for review", "Fix crash when the dealer has no orders.", m(-50), "task_19");
  notify("p_saad", "question", "Ali asked you a question", "Can I use the WhatsApp API key from the old project for the OTP fallback?", m(-20), "task_1");
  notify("p_saad", "submitted", "Ali submitted work for review", "Upload screenshots of the new checkout.", h(-3), "task_5", true);
  notify("p_saad", "escalation", "Danish has ignored 3 reminders", "Review pull request #212 — dealer search is level 1.", m(-5), "task_13");
  // employee Ali
  notify("p_ali", "reminder", "Reminder 3: Fix OTP login failing for dealers", "Urgent, due in 3 hours. Tap Acknowledge so Saad knows you've seen it.", m(-8), "task_1");
  notify("p_ali", "assigned", "Saad assigned you a task", "Write release notes for v2.3, due tomorrow 12:00 PM.", m(-12), "task_4");
  notify("p_ali", "announcement", "Imran posted a notice that needs your OK", "Use the Blocked button when you are stuck.", h(-20));
  notify("p_ali", "digest", "Your morning brief", "5 tasks today. Start with the OTP login fix, it is urgent.", at(9, 0), undefined, true);
  notify("p_ali", "approved", "Saad approved your work", "Update app icon for Android.", h(-24), "task_8", true);

  /* ---------------- 4 weeks of daily stats for reports ---------------- */
  const stats: DailyStat[] = [];
  const sr = rng(7);
  const reliability: Record<string, number> = {
    p_kamran: 0.55, p_faisal: 0.62, p_hamza: 0.7, p_mariam: 0.78, p_ali: 0.9, p_danish: 0.8,
    p_ayesha: 0.92, p_rabia: 0.85, p_zoya: 0.88, p_omar: 0.9, p_zain: 0.82, p_mehwish: 0.93,
    p_hina: 0.9, p_usman: 0.86, p_sana: 0.88, p_nadia: 0.91, p_saad: 0.87, p_imran: 0.95, p_farah: 0.9, p_waqas: 0.8,
  };
  for (let d = 27; d >= 0; d--) {
    const day = subDays(today, d);
    if (day.getDay() === 0) continue;
    for (const p of people) {
      if (p.role === "owner") continue;
      const rel = reliability[p.id] ?? 0.85;
      const assigned = 1 + Math.floor(sr() * (p.role === "manager" ? 3 : 4));
      const approved = Math.max(0, Math.round(assigned * (0.6 + sr() * 0.5) * (0.7 + rel * 0.3)));
      const onTime = Math.round(approved * (rel * 0.9 + sr() * 0.1));
      const remindersSent = Math.round(assigned * (1 + (1 - rel) * 6 + sr() * 2));
      const est = assigned * (1 + sr() * 2);
      stats.push({
        personId: p.id,
        date: format(day, "yyyy-MM-dd"),
        assigned,
        approved,
        onTime: Math.min(onTime, approved),
        ackMinutes: Math.round(4 + (1 - rel) * 120 * (0.5 + sr()) + (p.workType === "field" ? 25 : 0)),
        remindersSent,
        ackFirst: Math.round(assigned * rel * (0.7 + sr() * 0.3)),
        submissions: approved + (sr() < 0.15 ? 1 : 0),
        rejections: sr() < (1 - rel) * 0.6 ? 1 : 0,
        estHours: Math.round(est * 10) / 10,
        actualHours: Math.round(est * (0.85 + (1 - rel) * 0.9 + sr() * 0.3) * 10) / 10,
        escalations: sr() < (1 - rel) * 0.5 ? 1 : 0,
        reviewHours: Math.round((2 + sr() * 14) * 10) / 10,
      });
    }
  }

  /* ---------------- settings ---------------- */
  const settings: OrgSettings = {
    name: "Crescent Traders",
    timezone: "Asia/Karachi",
    workDays: [1, 2, 3, 4, 5, 6],
    workStart: "09:00",
    workEnd: "18:00",
    defaultReminder: { ...DEFAULT_REMINDER },
    escalation: { l1Ignored: 3, l2Ignored: 5, l3Ignored: 8, l4HoursPastDue: 24 },
    approvalByDefault: true,
    snoozeMaxPerDay: 3,
    reviewSlaHours: 24,
    holidays: [
      { date: format(addDays(today, 15), "yyyy-MM-dd"), name: "Iqbal Day" },
      { date: format(addDays(today, 70), "yyyy-MM-dd"), name: "Quaid-e-Azam Day" },
    ],
    digestMorning: "09:00",
    digestEvening: "18:30",
    retentionMonths: 24,
  };

  return {
    seededAt: iso(realNow),
    settings,
    people,
    departments,
    teams,
    groups,
    projects,
    tasks,
    activity: activity.sort((x, y) => (x.at < y.at ? 1 : -1)),
    notifications: notifications.sort((x, y) => (x.at < y.at ? 1 : -1)),
    channels,
    announcements,
    attendance,
    leaves,
    questions,
    deadlineRequests,
    stats,
  };
}
