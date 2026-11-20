/* PC Pulse service worker: oflayn qobiq + push bildirishnomalar (GitHub Pages pastki papkasida ham ishlaydi) */
const CACHE = "pcpulse-v4";
const SHELL = ["./", "./index.html", "./app.js", "./styles.css", "./theme-once.css", "./vendor/once-ui/tokens.css", "./fonts/Geist-VF.woff2", "./fonts/Geist-uz-okina.woff",
               "./config.js", "./manifest.webmanifest",
               "./icons/icon-192.png", "./icons/icon-512.png", "./icons/badge-96.png"];
const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map(scopeUrl))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // Supabase API — doim tarmoqdan
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match(scopeUrl("./index.html")))));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "PC Pulse", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "PC Pulse", {
    body: d.body || "",
    tag: d.tag || "pcpulse",
    renotify: d.renotify !== false,
    icon: scopeUrl("./icons/icon-192.png"),
    badge: scopeUrl("./icons/badge-96.png"),
    data: { url: d.url || "./#/overview" },
    timestamp: Date.now(),
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = scopeUrl((e.notification.data && e.notification.data.url) || "./");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
