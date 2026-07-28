// Habit Tracker - User Search service (Supabase I/O)
//
// Sprint 2: User Discovery. Talks to Supabase through two RPCs,
// search_public_profiles() and suggested_public_profiles() (see
// supabase/schema.sql) - same privacy boundary as get_public_profile()
// used by public-profile.js: is_public = true only, derived numbers only,
// raw habit history/xp_transactions rows never leave the database.
//
// Also owns "recently viewed" profiles, which is pure localStorage and has
// nothing to do with Supabase - it lives here because it's still part of
// the user-discovery surface, not because it's cloud data.
//
// Reuses CloudSync's client and the global todayString() from app.js
// (both already loaded before this file in index.html) rather than
// duplicating either - unlike public-profile.js, which is a standalone
// page without app.js and has to duplicate that helper.
//
// Future home for Followers/Friend Requests search filters - none of that
// is implemented yet, but this is the file that would grow those methods.

window.UserSearchService = (function () {
  const RECENT_KEY = "discover_recently_viewed";
  const RECENT_LIMIT = 10;

  function getClient() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getClient();
  }

  // Both RPC wrappers are wrapped in try/catch, not just the {data,error}
  // envelope Supabase normally resolves with - a hard network failure (DNS,
  // no connectivity despite navigator.onLine still reporting true, an ad
  // blocker on the supabase.co domain, etc.) can make supabase-js's
  // underlying fetch reject instead of resolving with `error`. Without this,
  // an unhandled rejection here means discover-ui.js's `loadingEl.hidden =
  // true` line after the `await` never runs, leaving the loading skeleton
  // stuck on screen forever.
  async function search(query) {
    if (!navigator.onLine) return { status: "offline", results: [] };

    const supa = getClient();
    if (!supa) return { status: "error", results: [] };

    try {
      const { data, error } = await supa.rpc("search_public_profiles", {
        p_query: query,
        p_today: todayString(),
      });

      if (error) {
        console.warn("search_public_profiles failed:", error.message);
        if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Search is having trouble right now.");
        return { status: "error", results: [] };
      }

      return { status: "ok", results: data || [] };
    } catch (err) {
      console.warn("search_public_profiles threw:", err && err.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Search is having trouble right now.");
      return { status: "error", results: [] };
    }
  }

  async function getSuggestions(sort) {
    if (!navigator.onLine) return { status: "offline", results: [] };

    const supa = getClient();
    if (!supa) return { status: "error", results: [] };

    try {
      const { data, error } = await supa.rpc("suggested_public_profiles", {
        p_sort: sort || "newest",
        p_today: todayString(),
      });

      if (error) {
        console.warn("suggested_public_profiles failed:", error.message);
        if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load suggestions right now.");
        return { status: "error", results: [] };
      }

      return { status: "ok", results: data || [] };
    } catch (err) {
      console.warn("suggested_public_profiles threw:", err && err.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load suggestions right now.");
      return { status: "error", results: [] };
    }
  }

  function loadRecentlyViewed() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function addRecentlyViewed(profile) {
    if (!profile || !profile.username) return;

    const existing = loadRecentlyViewed().filter((p) => p.username !== profile.username);
    existing.unshift({
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    });

    localStorage.setItem(RECENT_KEY, JSON.stringify(existing.slice(0, RECENT_LIMIT)));
  }

  return {
    search,
    getSuggestions,
    getRecentlyViewed: loadRecentlyViewed,
    addRecentlyViewed,
  };
})();
