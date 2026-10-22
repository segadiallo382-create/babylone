// Service worker : site installable, fichiers statiques en cache, page hors ligne simple.
const CACHE = "babylone-v1";
const SHELL = ["/", "/favicon.svg", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // API et temps réel : toujours le réseau (prix en direct)
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;
  // Fichiers versionnés et photos : cache d'abord
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/products/") || url.pathname.startsWith("/uploads/")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
    return;
  }
  // Pages : réseau d'abord, la coquille en cache si hors ligne
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  }
});
