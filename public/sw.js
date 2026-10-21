/* Pulse service worker: offline shell + notification actions */
const VERSION = "pulse-v1";
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

/* Real push from the server (phase 1 backend) */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Pulse", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pulse", {
      body: data.body || "",
      tag: data.taskId || "pulse",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: { taskId: data.taskId },
      actions: [
        { action: "ack", title: "Acknowledge" },
        { action: "snooze", title: "Snooze 30 min" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  const taskId = event.notification.data && event.notification.data.taskId;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length) {
        const c = clients[0];
        c.postMessage({ type: "reminder-action", action, taskId });
        return c.focus();
      }
      return self.clients.openWindow(`/today?task=${encodeURIComponent(taskId || "")}&action=${action}`);
    }),
  );
});
