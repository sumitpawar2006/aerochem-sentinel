const SHELL_CACHE = "aerochem-shell-v5";
const RUNTIME_CACHE = "aerochem-runtime-v5";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./v2.css",
  "./v2.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/app-config.json",
  "./data/decision-model.json",
  "./data/environmental-snapshot.json",
  "./data/nearby-cities.json",
  "./templates/community-interviews.csv",
  "./templates/validation-observations.csv",
  "./templates/vendor-quote-comparison.csv",
  "./templates/site-permission-request.txt"
];

const OPTIONAL_LIBRARY_ASSETS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).then(() => Promise.allSettled(OPTIONAL_LIBRARY_ASSETS.map(asset => cache.add(asset)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(RUNTIME_CACHE).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com", "api.qrserver.com"].includes(url.hostname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});
