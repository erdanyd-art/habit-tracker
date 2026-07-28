// Habit Tracker - Standalone Supabase client (public-profile.html only)
//
// Several files run on that page without the full app shell: public-
// profile.js, relationship-status-service.js, friend-request-service.js,
// friend-service.js. Each has its own CloudSync-first getClient() fallback
// (same pattern xp-sync.js/profile-service.js use in the main app), but on
// THIS page CloudSync never exists, so all four would otherwise fall
// through to creating their own separate supabase-js client - multiple
// GoTrueClient instances sharing one page is a real footgun. This one
// memoized client is what all of their fallback branches resolve to
// instead. Not needed inside the main app (index.html), which always has
// CloudSync's own client via cloud-sync.js - only load this on
// public-profile.html.

window.getStandaloneSupabaseClient = (function () {
  let client = null;
  return function () {
    if (client) return client;
    if (typeof window.supabase === "undefined" || !window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url) {
      return null;
    }
    if (window.SUPABASE_CONFIG.url === "YOUR_SUPABASE_URL") return null;
    client = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    return client;
  };
})();
