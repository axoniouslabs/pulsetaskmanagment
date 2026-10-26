"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { DEFAULT_REMINDER } from "./seed";
import type { Leave, OrgSettings, Role } from "./types";
import { emptyWorld, membersOf, WORLD_KEYS, type World } from "@/domain/world";
import { tryCommand, type Command, type CommandResult, type NewTaskInput } from "@/domain/commands";

export type { NewTaskInput };
type ActionResult = CommandResult;

/** settings that only live in this browser */
export interface LocalSettings {
  systemNotifications: boolean;
}

export interface Viewer {
  personId: string;
  role: Role;
}

interface Actions {
  load: () => Promise<void>;
  dispatch: (cmd: Command) => ActionResult;

  openTask: (id: string | null) => void;
  openCreate: (defaults?: Partial<NewTaskInput>) => void;
  closeCreate: () => void;
  setCommandOpen: (open: boolean) => void;

  createTask: (input: NewTaskInput) => string;
  acknowledge: (taskId: string) => ActionResult;
  start: (taskId: string) => ActionResult;
  snooze: (taskId: string, minutes: number) => ActionResult;
  block: (taskId: string, reason: string, blockerOwnerId?: string) => ActionResult;
  unblock: (taskId: string, note?: string) => ActionResult;
  submit: (taskId: string, note: string, proofName?: string) => ActionResult;
  approve: (taskId: string, note?: string) => ActionResult;
  reject: (taskId: string, reason: string) => ActionResult;
  cancel: (taskId: string, reason: string) => ActionResult;
  reassign: (taskId: string, toId: string, reason: string) => ActionResult;
  changeDeadline: (taskId: string, newDueAt: string, reason: string) => ActionResult;
  requestDeadline: (taskId: string, newDueAt: string, reason: string) => ActionResult;
  decideDeadline: (requestId: string, approve: boolean) => ActionResult;
  claimTask: (taskId: string) => ActionResult;
  publishDraft: (taskId: string) => ActionResult;
  toggleSubtask: (taskId: string, subtaskId: string) => ActionResult;
  addSubtask: (taskId: string, title: string) => ActionResult;
  addComment: (taskId: string, body: string, kind?: "text" | "voice", durationSec?: number) => ActionResult;
  addAttachment: (taskId: string, name: string, kind: "image" | "file") => ActionResult;

  startTimer: (taskId: string) => ActionResult;
  stopTimer: () => ActionResult;

  markRead: (id: string) => ActionResult;
  markAllRead: () => ActionResult;

  postAnnouncement: (input: { channelId: string; title: string; body: string; requiresAck: boolean; ackDueAt?: string }) => ActionResult;
  ackAnnouncement: (id: string) => ActionResult;
  readAnnouncement: (id: string) => ActionResult;

  askQuestion: (input: { toId: string; body: string; taskId?: string }) => ActionResult;
  answerQuestion: (id: string, answer: string) => ActionResult;

  checkIn: () => ActionResult;
  checkOut: () => ActionResult;
  requestLeave: (input: Omit<Leave, "id" | "status" | "personId">) => ActionResult;
  decideLeave: (id: string, approve: boolean) => ActionResult;

  updateSettings: (patch: Partial<OrgSettings>) => ActionResult;
  addHoliday: (date: string, name: string) => ActionResult;
  removeHoliday: (date: string) => ActionResult;
  addDepartment: (input: { name: string; headId: string; description: string }) => ActionResult;
  addTeam: (input: { name: string; departmentId: string; leadId: string }) => ActionResult;
  addGroup: (input: { name: string; description: string; memberIds: string[] }) => ActionResult;
  movePerson: (personId: string, teamId: string) => ActionResult;
  setTeamLead: (teamId: string, personId: string) => ActionResult;
  setDepartmentHead: (departmentId: string, personId: string) => ActionResult;
  setOnLeave: (personId: string, onLeave: boolean) => ActionResult;
  setPref: (key: string, value: boolean) => ActionResult;
  setDayOrder: (ids: string[]) => ActionResult;
  setLocal: (patch: Partial<LocalSettings>) => void;
}

export interface Subscription {
  state: "active" | "expiring" | "expired" | "suspended";
  expiresAt: string | null;
  daysLeft: number | null;
  planName: string | null;
  maxUsers: number | null;
  usedUsers: number;
  /** what to tell people (who to contact), when there's something to say */
  notice: string | null;
}

export interface AppState extends World, Actions {
  status: "loading" | "ready" | "error" | "locked";
  /** set when the company's access is paused: why, and who to contact */
  locked: { company: string; message: string } | null;
  /** this sign-in also runs the Pulse admin panel */
  platformAdmin: boolean;
  subscription: Subscription | null;
  viewer: Viewer | null;
  /** the signed-in person's role; kept as `role` so screens read one value */
  role: Role;
  /** every role maps to the signed-in person (screens look up `userIds[role]`) */
  userIds: Record<Role, string>;
  demoMode: boolean;
  serverOffsetMs: number;
  /** when the reminder engine last ran (null: never) */
  engineLastTickAt: string | null;
  /** when this company was created on Pulse */
  companyCreatedAt: string | null;
  /** VAPID public key for Web Push; null when push isn't set up on the server */
  pushPublicKey: string | null;
  openTaskId: string | null;
  createOpen: boolean;
  createDefaults: Partial<NewTaskInput> | null;
  commandOpen: boolean;
  local: LocalSettings;
}

/* ------------------------------------------------------------------ */
/* talking to the server                                               */
/* ------------------------------------------------------------------ */

const newId = (prefix: string) => {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 14)
      : Math.random().toString(16).slice(2, 16);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
};

let queue: Promise<void> = Promise.resolve();
let pending = 0;
/** bumped by every local change, so a snapshot that started earlier never overwrites it */
let localVersion = 0;
let refetchTimer: ReturnType<typeof setTimeout> | undefined;

function goToLogin() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
}

function scheduleRefetch(delay = 350) {
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    if (pending === 0) void useApp.getState().load();
    else scheduleRefetch(delay);
  }, delay);
}

function send(cmd: Command) {
  pending++;
  queue = queue
    .then(async () => {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cmd),
      });
      if (res.status === 401) return goToLogin();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 402) toast.error("Changes are paused", { id: "read-only", description: body.error });
        else toast.error(res.status === 422 || res.status === 403 ? body.error ?? "That didn't go through." : "Couldn't save that change", {
          description: res.status >= 500 ? "Pulse had a problem saving. Your screen has been refreshed; please try again." : undefined,
        });
        localVersion++;
      }
    })
    .catch(() => {
      toast.error("You're offline", { description: "That change wasn't saved. Check your connection and try again." });
      localVersion++;
    })
    .finally(() => {
      pending--;
      scheduleRefetch();
    });
}

const worldOf = (s: AppState): World => {
  const w = { orgId: s.orgId, settings: s.settings, timers: s.timers, prefs: s.prefs, dayOrder: s.dayOrder } as World;
  for (const k of WORLD_KEYS) (w as unknown as Record<string, unknown>)[k] = s[k];
  return w;
};

/* ------------------------------------------------------------------ */
/* the store                                                           */
/* ------------------------------------------------------------------ */

const NOBODY: Record<Role, string> = { owner: "", manager: "", employee: "" };

export const useApp = create<AppState>()((set, get) => {
  const dispatch = (cmd: Command): ActionResult => {
    const s = get();
    if (!s.viewer) return { ok: false, error: "You're signed out. Sign in again to continue." };
    const { world, result } = tryCommand(worldOf(s), cmd, {
      actorId: s.viewer.personId,
      now: new Date(Date.now() + s.serverOffsetMs),
      uid: newId,
    });
    if (!result.ok) return result;
    localVersion++;
    set(world);
    send(cmd);
    return result;
  };
  /** named actions report a refusal themselves, so a button never pretends it worked */
  const run = (cmd: Command) => {
    const r = dispatch(cmd);
    if (!r.ok) toast.error(r.error, { id: `refused:${r.error}` });
    return r;
  };

  return {
    ...emptyWorld(),
    status: "loading",
    viewer: null,
    role: "employee",
    userIds: NOBODY,
    demoMode: false,
    serverOffsetMs: 0,
    engineLastTickAt: null,
    companyCreatedAt: null,
    locked: null,
    platformAdmin: false,
    subscription: null,
    pushPublicKey: null,
    openTaskId: null,
    createOpen: false,
    createDefaults: null,
    commandOpen: false,
    local: { systemNotifications: false },

    load: async () => {
      const startedAt = localVersion;
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (res.status === 401) return goToLogin();
        if (res.status === 423) {
          const d = (await res.json()) as { locked: { company: string; message: string }; platformAdmin?: boolean };
          return set({ status: "locked", locked: d.locked, platformAdmin: !!d.platformAdmin });
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          viewer: Viewer & { name: string };
          world: World;
          serverTime: string;
          demoMode?: boolean;
          engineLastTickAt: string | null;
          companyCreatedAt?: string | null;
          platformAdmin?: boolean;
          subscription?: Subscription | null;
          pushPublicKey: string | null;
        };
        // a change made while this was loading wins; the next refetch brings both together
        if (pending > 0 || localVersion !== startedAt) return scheduleRefetch();
        const { personId, role } = data.viewer;
        set({
          ...data.world,
          viewer: { personId, role },
          role,
          userIds: { owner: personId, manager: personId, employee: personId },
          demoMode: !!data.demoMode,
          engineLastTickAt: data.engineLastTickAt,
          companyCreatedAt: data.companyCreatedAt ?? null,
          platformAdmin: !!data.platformAdmin,
          subscription: data.subscription ?? null,
          locked: null,
          pushPublicKey: data.pushPublicKey,
          serverOffsetMs: new Date(data.serverTime).getTime() - Date.now(),
          status: "ready",
        });
      } catch {
        if (get().status === "loading") set({ status: "error" });
      }
    },
    dispatch,

    openTask: (id) => set({ openTaskId: id }),
    openCreate: (defaults) => set({ createOpen: true, createDefaults: defaults ?? null }),
    closeCreate: () => set({ createOpen: false, createDefaults: null }),
    setCommandOpen: (open) => set({ commandOpen: open }),

    createTask: (input) => {
      const id = newId("task");
      const r = dispatch({ type: "createTask", id, input });
      if (!r.ok) {
        toast.error(r.error);
        return "";
      }
      return id;
    },
    acknowledge: (taskId) => run({ type: "acknowledge", taskId }),
    start: (taskId) => run({ type: "start", taskId }),
    snooze: (taskId, minutes) => run({ type: "snooze", taskId, minutes }),
    block: (taskId, reason, blockerOwnerId) => run({ type: "block", taskId, reason, blockerOwnerId }),
    unblock: (taskId, note) => run({ type: "unblock", taskId, note }),
    submit: (taskId, note, proofName) => run({ type: "submit", taskId, note, proofName }),
    approve: (taskId, note) => run({ type: "approve", taskId, note }),
    reject: (taskId, reason) => run({ type: "reject", taskId, reason }),
    cancel: (taskId, reason) => run({ type: "cancel", taskId, reason }),
    reassign: (taskId, toId, reason) => run({ type: "reassign", taskId, toId, reason }),
    changeDeadline: (taskId, newDueAt, reason) => run({ type: "changeDeadline", taskId, newDueAt, reason }),
    requestDeadline: (taskId, newDueAt, reason) => run({ type: "requestDeadline", taskId, newDueAt, reason }),
    decideDeadline: (requestId, approve) => run({ type: "decideDeadline", requestId, approve }),
    claimTask: (taskId) => run({ type: "claimTask", taskId }),
    publishDraft: (taskId) => run({ type: "publishDraft", taskId }),
    toggleSubtask: (taskId, subtaskId) => run({ type: "toggleSubtask", taskId, subtaskId }),
    addSubtask: (taskId, title) => run({ type: "addSubtask", taskId, title }),
    addComment: (taskId, body, kind, durationSec) => run({ type: "addComment", taskId, body, kind, durationSec }),
    addAttachment: (taskId, name, kind) => run({ type: "addAttachment", taskId, name, kind }),

    startTimer: (taskId) => run({ type: "start", taskId }),
    stopTimer: () => run({ type: "stopTimer" }),

    markRead: (id) => run({ type: "markRead", id }),
    markAllRead: () => run({ type: "markAllRead" }),

    postAnnouncement: (input) => run({ type: "postAnnouncement", ...input }),
    ackAnnouncement: (id) => run({ type: "ackAnnouncement", id }),
    readAnnouncement: (id) => {
      const s = get();
      const a = s.announcements.find((x) => x.id === id);
      if (!a || !s.viewer || a.readBy[s.viewer.personId]) return { ok: true };
      return run({ type: "readAnnouncement", id });
    },

    askQuestion: (input) => run({ type: "askQuestion", ...input }),
    answerQuestion: (id, answer) => run({ type: "answerQuestion", id, answer }),

    checkIn: () => run({ type: "checkIn" }),
    checkOut: () => run({ type: "checkOut" }),
    requestLeave: (input) => run({ type: "requestLeave", input }),
    decideLeave: (id, approve) => run({ type: "decideLeave", id, approve }),

    updateSettings: (patch) => run({ type: "updateSettings", patch }),
    addHoliday: (date, name) => run({ type: "addHoliday", date, name }),
    removeHoliday: (date) => run({ type: "removeHoliday", date }),
    addDepartment: (input) => run({ type: "addDepartment", ...input }),
    addTeam: (input) => run({ type: "addTeam", ...input }),
    addGroup: (input) => run({ type: "addGroup", ...input }),
    movePerson: (personId, teamId) => run({ type: "movePerson", personId, teamId }),
    setTeamLead: (teamId, personId) => run({ type: "setTeamLead", teamId, personId }),
    setDepartmentHead: (departmentId, personId) => run({ type: "setDepartmentHead", departmentId, personId }),
    setOnLeave: (personId, onLeave) => run({ type: "setOnLeave", personId, onLeave }),
    setPref: (key, value) => run({ type: "setPref", key, value }),
    setDayOrder: (ids) => run({ type: "setDayOrder", ids }),
    setLocal: (patch) => {
      const local = { ...get().local, ...patch };
      set({ local });
      try {
        localStorage.setItem("pulse-local", JSON.stringify(local));
      } catch {}
    },
  };
});

/** restore per-browser settings once on the client */
if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem("pulse-local");
    if (raw) useApp.setState({ local: { ...useApp.getState().local, ...JSON.parse(raw) } });
  } catch {}
}

export { membersOf };
export const useMe = () => useApp((s) => s.people.find((p) => p.id === s.viewer?.personId)!);
export const useMeId = () => useApp((s) => s.viewer?.personId ?? "");

export { DEFAULT_REMINDER };
