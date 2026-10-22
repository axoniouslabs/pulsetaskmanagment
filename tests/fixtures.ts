import type { Person, Task } from "@/lib/types";
import { emptyWorld, type World } from "@/domain/world";

let n = 0;
export const uid = (p: string) => `${p}_${++n}`;

const person = (id: string, role: Person["role"], departmentId: string, teamId: string, extra: Partial<Person> = {}): Person => ({
  id,
  name: `${id.slice(2, 3).toUpperCase()}${id.slice(3)} Test`,
  initials: id.slice(2, 4).toUpperCase(),
  role,
  title: role,
  departmentId,
  teamId,
  hue: 100,
  capacityHours: 8,
  email: `${id.slice(2)}@test.pk`,
  phone: "",
  workType: "desk",
  devices: [{ id: "d1", kind: "android", label: "Phone", lastSeen: "2026-10-01T00:00:00Z", healthy: true }],
  ...extra,
});

/**
 * A small company: owner; Sales (head Hina) with team Field (lead Usman: Kamran, Faisal);
 * Development (head Saad) with team Product (lead Saad: Ali). Times are Pakistan time.
 */
export function makeWorld(): World {
  const w = emptyWorld();
  w.orgId = "org_test";
  w.settings = { ...w.settings, name: "Test Co", timezone: "Asia/Karachi", workDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "18:00" };
  w.people = [
    person("p_owner", "owner", "", ""),
    person("p_hina", "manager", "d_sales", "t_field"),
    person("p_usman", "manager", "d_sales", "t_field"),
    person("p_kamran", "employee", "d_sales", "t_field"),
    person("p_faisal", "employee", "d_sales", "t_field"),
    person("p_saad", "manager", "d_dev", "t_product"),
    person("p_ali", "employee", "d_dev", "t_product"),
  ];
  w.departments = [
    { id: "d_sales", name: "Sales", headId: "p_hina", description: "" },
    { id: "d_dev", name: "Development", headId: "p_saad", description: "" },
  ];
  w.teams = [
    { id: "t_field", name: "Field", departmentId: "d_sales", leadId: "p_usman" },
    { id: "t_product", name: "Product", departmentId: "d_dev", leadId: "p_saad" },
  ];
  w.channels = [{ id: "c_all", name: "Company", kind: "announcement", unitType: "org", unitId: "org", description: "" }];
  return w;
}

/** Pakistan local time → Date (PKT is UTC+5 all year) */
export const pkt = (isoLocal: string) => new Date(`${isoLocal}+05:00`);

export function task(over: Partial<Task> & Pick<Task, "id" | "assigneeId">): Task {
  return {
    title: "Test task",
    description: "",
    createdById: "p_usman",
    reviewerId: "p_usman",
    departmentId: "d_sales",
    priority: "normal",
    status: "assigned",
    createdAt: pkt("2026-10-21T09:00:00").toISOString(),
    dueAt: pkt("2026-10-23T17:00:00").toISOString(),
    estimateHours: 1,
    requiresApproval: true,
    requiresProof: false,
    requiresResult: false,
    reminder: { intervalMin: 30, window: "working", dailyCap: 12, channels: ["push", "inapp"], quietAfterAckMin: 60 },
    remindersSent: 0,
    remindersIgnored: 0,
    escalationLevel: 0,
    subtasks: [],
    comments: [],
    attachments: [],
    watcherIds: [],
    tags: [],
    rejections: 0,
    statusChangedAt: pkt("2026-10-21T09:00:00").toISOString(),
    snoozesToday: 0,
    loggedMinutes: 0,
    ...over,
  };
}
