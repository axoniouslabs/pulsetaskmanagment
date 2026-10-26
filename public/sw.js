/* Pulse service worker: offline shell + notification actions */
const VERSION = "pulse-v3";
const SHELL = ["/", "/today", "/overview", "/tasks", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // never cache during local development: code changes must show up at once
  if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") return;
  if (url.pathname.startsWith("/api/")) return;

  // pages: network first, fall back to the cached shell when offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/today") || caches.match("/"))),
    );
    return;
  }

  // build assets: cache first, they are content-hashed
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

/* Push from the server */
const report = (token, action) =>
  token
    ? fetch("/api/push/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action }) })
        .then((r) => r.json().catch(() => ({ ok: r.ok })))
        .catch(() => ({ ok: false }))
    : Promise.resolve({ ok: false });

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pulse", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Pulse", {
        body: data.body || "",
        tag: data.tag || data.taskId || "pulse",
        renotify: !!data.urgent,
        requireInteraction: !!data.urgent,
        icon: "/icon-192.png",
        badge: "/badge-72.png",
        data: { taskId: data.taskId, token: data.token },
        actions: Array.isArray(data.actions) ? data.actions : [],
      }),
      report(data.token, "receipt"),
      // tell open windows to refresh their data
      self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "pulse-refresh" }))),
    ]),
  );
});

const openApp = (taskId) =>
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    if (clients.length) {
      const c = clients[0];
      c.postMessage({ type: "reminder-action", action: "open", taskId });
      return c.focus();
    }
    return self.clients.openWindow(taskId ? `/today?task=${encodeURIComponent(taskId)}` : "/");
  });

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  const { taskId, token } = event.notification.data || {};
  event.notification.close();
  if (action === "ack" || action === "snooze") {
    // works from the lock screen without opening Pulse
    event.waitUntil(
      report(token, action).then((res) => {
        self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "pulse-refresh" })));
        if (res && res.ok) {
          return self.registration.showNotification(res.message || "Done", { body: "Pulse has recorded it.", tag: `done-${taskId}`, icon: "/icon-192.png", badge: "/badge-72.png", silent: true });
        }
        return openApp(taskId);
      }),
    );
    return;
  }
  event.waitUntil(Promise.all([report(token, "open"), openApp(taskId)]));
});
