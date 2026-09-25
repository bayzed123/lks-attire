// Service worker: offline-capable app shell + fast repeat visits on slow mobile networks.
// Static assets: cache-first. Catalogue API: stale-while-revalidate. Checkout/account/admin: always network.
const VERSION = "{{BUILD_ID}}";
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const PRECACHE = ["/", "/css/store.css", "/brand.css", "/js/app.js", "/js/core.js", "/js/i18n.js", "/js/components.js", "/assets/icon.svg", "/data/bd-geo.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/admin") || /^\/api\/(me|orders|cart|admin|auth|payments)/.test(url.pathname)) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
    return;
  }
  if (/^\/api\/(products|categories|banners|config|facets|testimonials)/.test(url.pathname)) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }
  if (/\.(css|js|svg|png|jpg|jpeg|webp|avif|woff2|json)$/.test(url.pathname) || url.pathname.startsWith("/media/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) caches.open(RUNTIME).then((c) => c.put(e.request, r.clone())); return r; })));
  }
});
