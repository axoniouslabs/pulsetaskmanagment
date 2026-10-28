"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { DEFAULT_REMINDER } from "./seed";
import type { Leave, OrgSettings, Role } from "./types";
import { channelMembersOf, emptyWorld, membersOf, WORLD_KEYS, type World } from "@/domain/world";
import { QUEUEABLE, isNetworkError, outbox, readSnapshot, saveSnapshot, setOutbox } from "./offline";
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
  /** dispatch, and show the refusal if the change isn't allowed */
  act: (cmd: Command) => ActionResult;

  openTask: (id: string | null) => void;
  /** open a task with one of its dialogs already showing (from a notification button) */
  openTaskDialog: (id: string, kind: "submit" | "block" | "reassign" | "deadline") => void;
  clearTaskDialog: () => void;
  openCreate: (defaults?: Partial<NewTaskInput>) => void;
  closeCreate: () => void;
  setCommandOpen: (open: boolean) => void;

  createTask: (input: NewTaskInput) => string;
  acknowledge: (taskId: string) => ActionResult;
  start: (taskId: string) => ActionResult;
  snooze: (taskId: string, minutes: number) => ActionResult;
  block: (taskId: string, reason: string, blockerOwnerId?: string) => ActionResult;
  unblock: (taskId: string, note?: string) => ActionResult;
  submit: (taskId: string, note: string) => ActionResult;
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
  addComment: (taskId: string, body: string, kind?: "text" | "voice", durationSec?: number, parentId?: string) => ActionResult;
  addAttachment: (taskId: string, name: string, kind: "image" | "file") => ActionResult;

  startTimer: (taskId: string) => ActionResult;
  stopTimer: (at?: string) => ActionResult;

  markRead: (id: string) => ActionResult;
  markAllRead: () => ActionResult;

  postAnnouncement: (input: { channelId: string; title: string; body: string; requiresAck: boolean; ackDueAt?: string }) => ActionResult;
  ackAnnouncement: (id: string) => ActionResult;
  remindAnnouncement: (id: string) => ActionResult;
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

export interface AppState extends World, Actions {
  status: "loading" | "ready" | "error" | "locked";
  /** showing the copy kept on this device: when it was saved (null when live) */
  staleSince: string | null;
  /** changes made offline, waiting to be sent */
  outboxCount: number;
  /** set when the company's access is paused: why, and who to contact */
  locked: { company: string; message: string } | null;
  /** this sign-in also runs the Pulse admin panel */
  platformAdmin: boolean;
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
  taskDialog: { taskId: string; kind: "submit" | "block" | "reassign" | "deadline" } | null;
  createOpen: boolean;
  createDefaults: Partial<NewTaskInput> | null;
  commandOpen: boolean;
  local: LocalSettings;
}

/* ------------------------------------------------------------------ */
/* talking to the server                                               */
/* ------------------------------------------------------------------ */

const newId = (prefix: string) => {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 14) : Math.random().toString(16).slice(2, 16);
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
      // anything already waiting goes first, so the server sees changes in the order they were made
      if (outbox().length) {
        if (QUEUEABLE.has(cmd.type)) return keepForLater(cmd);
        await flushOutbox();
      }
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cmd),
      });
      if (res.status === 401) return goToLogin();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 423)
          toast.error("Pulse is paused", {
            id: "paused",
            description: body.error,
          });
        else
          toast.error(res.status === 422 || res.status === 403 ? (body.error ?? "That didn't go through.") : "Couldn't save that change", {
            description: res.status >= 500 ? "Pulse had a problem saving. Your screen has been refreshed; please try again." : undefined,
          });
        localVersion++;
      }
    })
    .catch((e) => {
      if (isNetworkError(e) && QUEUEABLE.has(cmd.type)) return keepForLater(cmd);
      toast.error("You're offline", {
        description: "That change wasn't saved. It can't wait for the connection; try again when you're back online.",
      });
      localVersion++;
    })
    .finally(() => {
      pending--;
      if (!outbox().length) scheduleRefetch();
    });
}

/** offline: keep the change on this device and show it as done; it's sent when the connection is back */
function keepForLater(cmd: Command) {
  const personId = useApp.getState().viewer?.personId ?? "";
  const items = [...outbox(), { cmd, at: new Date().toISOString(), personId }];
  setOutbox(items);
  useApp.setState({ outboxCount: items.length });
  toast("Saved on this phone", { id: "outbox", description: `You're offline. ${items.length === 1 ? "It's" : `${items.length} changes are`} sent as soon as you're back online.` });
}

let flushing: Promise<void> | null = null;
/** send what was done offline, oldest first; a change that can no longer apply is kept as a comment on the task */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    let preserved = 0;
    let sent = 0;
    for (;;) {
      const [item, ...rest] = outbox();
      if (!item) break;
      let res: Response;
      try {
        res = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json", "x-pulse-offline-at": item.at }, body: JSON.stringify(item.cmd) });
      } catch {
        break; // still offline: try again later
      }
      if (res.status === 401) return goToLogin();
      const body = (await res.json().catch(() => ({}))) as { preserved?: boolean };
      if (body.preserved) preserved++;
      else if (res.ok) sent++;
      setOutbox(rest);
      useApp.setState({ outboxCount: rest.length });
    }
    if (sent || preserved) {
      toast.success(`Back online: ${sent} offline ${sent === 1 ? "change" : "changes"} saved`, {
        id: "outbox",
        description: preserved ? `${preserved} couldn't apply any more (the task had changed), so ${preserved === 1 ? "it was" : "they were"} added as a comment on the task instead.` : undefined,
      });
      localVersion++;
      void useApp.getState().load();
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

const worldOf = (s: AppState): World => {
  const w = {
    orgId: s.orgId,
    settings: s.settings,
    timers: s.timers,
    prefs: s.prefs,
    dayOrder: s.dayOrder,
    savedViews: s.savedViews,
  } as World;
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
    if (!s.viewer)
      return {
        ok: false,
        error: "You're signed out. Sign in again to continue.",
      };
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
    staleSince: null,
    outboxCount: 0,
    viewer: null,
    role: "employee",
    userIds: NOBODY,
    demoMode: false,
    serverOffsetMs: 0,
    engineLastTickAt: null,
    companyCreatedAt: null,
    locked: null,
    platformAdmin: false,
    pushPublicKey: null,
    openTaskId: null,
    taskDialog: null,
    createOpen: false,
    createDefaults: null,
    commandOpen: false,
    local: { systemNotifications: false },

    load: async () => {
      const startedAt = localVersion;
      try {
        const res = await fetch("/api/snapshot", { cache: "no-store" });
        if (res.status === 401) return goToLogin();
        if (res.status === 403) {
          // the account exists but the person was deactivated: sign out and explain on the sign-in page
          const { authClient } = await import("./auth-client");
          await authClient.signOut().catch(() => {});
          window.location.replace("/login?reason=deactivated");
          return;
        }
        if (res.status === 423) {
          const d = (await res.json()) as {
            locked: { company: string; message: string };
            platformAdmin?: boolean;
          };
          return set({
            status: "locked",
            locked: d.locked,
            platformAdmin: !!d.platformAdmin,
          });
        }
        if (!res.ok) throw new Error(String(res.status));
        const raw = await res.text();
        const data = JSON.parse(raw) as {
          viewer: Viewer & { name: string };
          world: World;
          serverTime: string;
          demoMode?: boolean;
          engineLastTickAt: string | null;
          companyCreatedAt?: string | null;
          platformAdmin?: boolean;
          pushPublicKey: string | null;
        };
        // a change made while this was loading wins; the next refetch brings both together
        if (pending > 0 || localVersion !== startedAt) return scheduleRefetch();
        const { personId, role } = data.viewer;
        void saveSnapshot(personId, data);
        set({
          staleSince: null,
          ...data.world,
          viewer: { personId, role },
          role,
          userIds: { owner: personId, manager: personId, employee: personId },
          demoMode: !!data.demoMode,
          engineLastTickAt: data.engineLastTickAt,
          companyCreatedAt: data.companyCreatedAt ?? null,
          platformAdmin: !!data.platformAdmin,
          locked: null,
          pushPublicKey: data.pushPublicKey,
          serverOffsetMs: new Date(data.serverTime).getTime() - Date.now(),
          status: "ready",
        });
      } catch (e) {
        // no connection: open the copy kept on this device, clearly marked as not live
        if (isNetworkError(e) || get().status !== "ready") {
          const kept = await readSnapshot<{ viewer: Viewer & { name: string }; world: World; serverTime: string; pushPublicKey: string | null; engineLastTickAt: string | null }>();
          if (kept && (!get().viewer || get().viewer?.personId === kept.personId)) {
            if (get().status !== "ready") {
              const { personId, role } = kept.data.viewer;
              set({
                ...kept.data.world,
                viewer: { personId, role },
                role,
                userIds: { owner: personId, manager: personId, employee: personId },
                engineLastTickAt: kept.data.engineLastTickAt,
                pushPublicKey: kept.data.pushPublicKey,
                status: "ready",
              });
            }
            set({ staleSince: get().staleSince ?? kept.savedAt, outboxCount: outbox().length });
            return;
          }
        }
        if (get().status === "loading") set({ status: "error" });
      }
    },
    dispatch,
    act: (cmd) => run(cmd),

    openTask: (id) => set({ openTaskId: id }),
    openTaskDialog: (id, kind) => set({ openTaskId: id, taskDialog: { taskId: id, kind } }),
    clearTaskDialog: () => set({ taskDialog: null }),
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
    submit: (taskId, note) => run({ type: "submit", taskId, note }),
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
    addComment: (taskId, body, kind, durationSec, parentId) => run({ type: "addComment", taskId, body, kind, durationSec, parentId }),
    addAttachment: (taskId, name, kind) => run({ type: "addAttachment", taskId, name, kind }),

    startTimer: (taskId) => run({ type: "start", taskId }),
    stopTimer: (at) => run({ type: "stopTimer", at }),

    markRead: (id) => run({ type: "markRead", id }),
    markAllRead: () => run({ type: "markAllRead" }),

    postAnnouncement: (input) => run({ type: "postAnnouncement", ...input }),
    ackAnnouncement: (id) => run({ type: "ackAnnouncement", id }),
    remindAnnouncement: (id) => run({ type: "remindAnnouncement", id }),
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
    if (raw)
      useApp.setState({
        local: { ...useApp.getState().local, ...JSON.parse(raw) },
      });
  } catch {}
}

export { membersOf, channelMembersOf };
export const useMe = () => useApp((s) => s.people.find((p) => p.id === s.viewer?.personId)!);
export const useMeId = () => useApp((s) => s.viewer?.personId ?? "");

export { DEFAULT_REMINDER };
