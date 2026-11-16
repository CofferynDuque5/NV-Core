/*
 * NV Marketing service worker — minimal, install-friendly.
 *
 * Strategy:
 *  - Navigations (HTML): network-first, falling back to the cached app shell
 *    when offline, so the installed app still opens.
 *  - Same-origin static assets (Vite's hashed /assets/*): cache-first.
 *  - Never touches API/cross-origin requests (always straight to network).
 *
 * Safety rules (learned the hard way on shared hosting): only cache responses
 * that are OK *and* of the expected type. A deploy in progress can answer an
 * asset URL with the SPA's index.html (200, text/html); caching that would
 * poison the cache-first path and leave the app blank forever.
 */
const CACHE = "nvcore-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

function cacheable(res, kind) {
  if (!res || !res.ok || res.type === "opaque") return false;
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (kind === "asset") return !type.includes("text/html");
  return type.includes("text/html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page can ask us to wipe everything (self-heal when the app fails to boot).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "NV_CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API / cross-origin → network
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;

  // App navigations: network-first, cached shell as offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res, "html")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Hashed static assets: cache-first, but never cache an HTML answer.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit && cacheable(hit, "asset")) return hit;
        return fetch(req).then((res) => {
          if (cacheable(res, "asset")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      }),
    );
  }
});

// ── Push: new chat messages with the panel closed ──────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "NV Marketing", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "NV Marketing";
  const url = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // The panel is open and in front: it already rang, no double notice.
      if (wins.some((w) => w.visibilityState === "visible" && w.focused)) return undefined;
      return self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(path, self.location.origin);
  // Only our own pages open from a notice.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((c) => (c && "navigate" in c ? c.navigate(target.href) : c));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
