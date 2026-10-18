{% load static %}
const CACHE_NAME = "ai-assistant-{{ cache_version }}";

// The "app shell": everything needed to open the app with no internet.
const APP_SHELL = [
  "/",
  "/offline/",
  "{% url 'manifest' %}",
  "{% static 'assistant/css/style.css' %}",
  "{% static 'assistant/js/app.js' %}",
  "{% static 'assistant/icons/icon-192.png' %}",
  "{% static 'assistant/icons/icon-512.png' %}",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Add one by one so a single failed file doesn't break the install.
        Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache chat requests or non-GET requests.
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // Pages: try the network first, fall back to the cached copy, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match("/"))
            .then((hit) => hit || caches.match("/offline/"))
        )
    );
    return;
  }

  // Static files: serve from cache, fetch and store if missing.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => Response.error())
    )
  );
});
