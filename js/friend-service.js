// Habit Tracker - Friend service (Supabase I/O)
//
// Wraps remove_friend() (see supabase/schema.sql) - kept as its own file,
// separate from friend-request-service.js, per the sprint's requested
// separation of Friend Service vs Friend Request Service. This is also
// where a future Friends List would add a listFriends() method; not
// implemented yet.

window.FriendService = (function () {
  function getClient() {
    if (typeof CloudSync !== "undefined") {
      const c = CloudSync.getClient();
      if (c) return c;
    }
    return typeof getStandaloneSupabaseClient === "function" ? getStandaloneSupabaseClient() : null;
  }

  async function removeFriend(otherUserId) {
    const supa = getClient();
    if (!supa) {
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't remove that friend. Try again.");
      return { status: "error" };
    }

    const { data, error } = await supa.rpc("remove_friend", { p_other_user_id: otherUserId });
    if (error || !data) {
      console.warn("remove_friend failed:", error && error.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't remove that friend. Try again.");
      return { status: "error" };
    }

    RelationshipStatusService.setCached(otherUserId, data);
    return data;
  }

  return { removeFriend };
})();
