// Habit Tracker - User Profile service (Supabase I/O)
//
// Sprint 2: User Discovery. Thin, reusable wrapper around the single RPC
// get_public_profile() (see supabase/schema.sql) - the same privacy-
// bypassing security definer function public-profile.js already calls
// directly. Pulling it out here means future features that need to look
// up another user's public profile (Friend Requests, Followers,
// Challenges, Circles - none implemented yet) have one place to call
// instead of duplicating the RPC call site again.
//
// public-profile.js is intentionally left untouched: it's a standalone
// unauthenticated page with no other app.js/CloudSync dependency, so it
// keeps its own inline copy rather than depending on this file loading.

window.UserProfileService = (function () {
  function getClient() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getClient();
  }

  async function fetchByUsername(username) {
    if (!username) return { status: "not_found" };
    if (!navigator.onLine) return { status: "offline" };

    const supa = getClient();
    if (!supa) return { status: "error" };

    const { data, error } = await supa.rpc("get_public_profile", {
      p_username: username,
      p_today: todayString(),
    });

    if (error || !data) {
      console.warn("get_public_profile failed:", error && error.message);
      return { status: "error" };
    }

    return data;
  }

  function profileUrl(username) {
    return `${location.origin}/u/${encodeURIComponent(username)}`;
  }

  return { fetchByUsername, profileUrl };
})();
