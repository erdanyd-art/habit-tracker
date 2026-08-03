// Habit Tracker - Notification service (Supabase I/O)
//
// Wraps get_my_notifications() (security definer - needs the actor's
// profiles row for nudge/friend_accepted rows, which plain RLS wouldn't
// allow). Marking read and the unread badge count are plain, direct client
// calls instead - both only ever touch the caller's own rows, which the
// table's own RLS already permits, no RPC needed.

window.NotificationService = (function () {
  function getClient() {
    if (typeof CloudSync !== "undefined") {
      const c = CloudSync.getClient();
      if (c) return c;
    }
    return typeof getStandaloneSupabaseClient === "function" ? getStandaloneSupabaseClient() : null;
  }

  async function fetchNotifications(limit) {
    const supa = getClient();
    if (!supa) return [];

    const { data, error } = await supa.rpc("get_my_notifications", { p_limit: limit || 30 });
    if (error || !data) {
      console.warn("get_my_notifications failed:", error && error.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load notifications right now.");
      return [];
    }

    return data;
  }

  async function getUnreadCount() {
    const supa = getClient();
    const user = typeof CloudSync !== "undefined" ? CloudSync.getCurrentUser() : null;
    if (!supa || !user) return 0;

    const { count, error } = await supa
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.warn("Unread notification count failed:", error.message);
      return 0;
    }

    return count || 0;
  }

  async function markAllRead() {
    const supa = getClient();
    const user = typeof CloudSync !== "undefined" ? CloudSync.getCurrentUser() : null;
    if (!supa || !user) return;

    const { error } = await supa
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) console.warn("Marking notifications read failed:", error.message);
  }

  // Only notification type this app ever inserts directly from the client
  // (a plain self-action, RLS allows it) - see leaderboard-ui.js.
  async function postSelfNotification(fields) {
    const supa = getClient();
    const user = typeof CloudSync !== "undefined" ? CloudSync.getCurrentUser() : null;
    if (!supa || !user) return;

    const { error } = await supa.from("notifications").insert({ user_id: user.id, ...fields });
    if (error) console.warn("Notification post failed:", error.message);
  }

  return { fetchNotifications, getUnreadCount, markAllRead, postSelfNotification };
})();
