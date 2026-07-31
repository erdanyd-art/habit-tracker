// Habit Tracker - Leaderboard service (Supabase I/O)
//
// Thin wrapper around the single RPC get_friends_leaderboard() (see
// supabase/schema.sql) - ranks the caller + their friends by weekly
// completion rate -> current streak -> total XP, computed from public
// habits only. All the ranking math lives in the RPC; this file just calls
// it, same pattern as the other *-service.js files.

window.LeaderboardService = (function () {
  function getClient() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getClient();
  }

  async function fetchLeaderboard() {
    const supa = getClient();
    if (!supa) return [];

    const { data, error } = await supa.rpc("get_friends_leaderboard", {});
    if (error || !data) {
      console.warn("get_friends_leaderboard failed:", error && error.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load the leaderboard right now.");
      return [];
    }

    return data;
  }

  return { fetchLeaderboard };
})();
