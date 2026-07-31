const CACHE_NAME = "habit-tracker-v31";
const ASSETS = [
  "./",
  "./index.html",
  "./public-profile.html",
  "./css/style.css",
  "./js/app.js",
  "./js/loading-ui.js",
  "./js/error-ui.js",
  "./js/analytics.js",
  "./js/habit-insights.js",
  "./js/achievements.js",
  "./js/supabase-config.js",
  "./js/standalone-supabase-client.js",
  "./js/cloud-sync.js",
  "./js/progression.js",
  "./js/xp-sync.js",
  "./js/xp-ui.js",
  "./js/profile-service.js",
  "./js/profile-stats.js",
  "./js/profile-ui.js",
  "./js/relationship-status-service.js",
  "./js/friend-request-service.js",
  "./js/friend-service.js",
  "./js/friend-requests-ui.js",
  "./js/activity-service.js",
  "./js/leaderboard-service.js",
  "./js/activity-ui.js",
  "./js/leaderboard-ui.js",
  "./js/social-ui.js",
  "./js/user-search-service.js",
  "./js/user-profile-service.js",
  "./js/discover-ui.js",
  "./js/public-profile.js",
  "./js/home-ui.js",
  "./js/habits-ui.js",
  "./js/habit-swipe.js",
  "./js/bottom-nav.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
