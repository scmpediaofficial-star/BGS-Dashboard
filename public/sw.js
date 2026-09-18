/* BGS Dashboard service worker — hand-written, no build step.
 *
 *   static assets  → cache-first (content-hashed by Next.js, safe forever)
 *   page visits    → network-first, falling back to the last copy seen, then /offline
 *   data & actions → never cached: RSC payloads, Server Actions, APIs and Supabase always hit the network
 *   push           → shows the alert and focuses / opens the right page on tap
 */
const VERSION = "bgs-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/badge-96.png", "/brand/logo-white.png", "/brand/logo-color.png"];
const PAGE_LIMIT = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  // Signing out must not leave someone else's pages readable offline.
  if (event.data && event.data.type === "CLEAR_PAGES") event.waitUntil(caches.delete(PAGES));
});

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((k) => cache.delete(k)));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC)).put(request, response.clone());
  return response;
}

async function pageVisit(event) {
  const cache = await caches.open(PAGES);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    // Only keep successful, final HTML — never redirects to /login or error pages.
    if (response.ok && !response.redirected && (response.headers.get("content-type") || "").includes("text/html")) {
      cache.put(event.request, response.clone()).then(() => trim(PAGES, PAGE_LIMIT));
    }
    return response;
  } catch {
    return (await cache.match(event.request)) || (await caches.match("/offline")) || new Response("You are offline.", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // Server Actions and uploads go straight to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts, social networks
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (request.headers.get("RSC") || request.headers.get("Next-Router-Prefetch") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/") || /\.(?:woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(pageVisit(event));
});

// ── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "BGS Dashboard", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "BGS Dashboard", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
