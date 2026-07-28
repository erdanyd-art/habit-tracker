// Habit Tracker - Friend Request service (Supabase I/O)
//
// Wraps the friend request lifecycle RPCs (see supabase/schema.sql):
// send_friend_request, respond_to_friend_request, cancel_friend_request,
// list_friend_requests. Every one of these is security definer server-side
// - this file never touches the friend_requests/friendships tables
// directly, same one-chokepoint-per-concern pattern as get_public_profile.
//
// After any mutation, updates RelationshipStatusService's cache directly
// (optimistic) rather than forcing a refetch - the whole point of that
// cache existing.

window.FriendRequestService = (function () {
  function getClient() {
    if (typeof CloudSync !== "undefined") {
      const c = CloudSync.getClient();
      if (c) return c;
    }
    return typeof getStandaloneSupabaseClient === "function" ? getStandaloneSupabaseClient() : null;
  }

  function fail(message) {
    if (typeof ErrorUI !== "undefined") ErrorUI.showToast(message);
    return { status: "error" };
  }

  async function sendRequest(otherUserId) {
    const supa = getClient();
    if (!supa) return fail("Couldn't send that request. Try again.");

    const { data, error } = await supa.rpc("send_friend_request", { p_receiver_id: otherUserId });
    if (error || !data) {
      console.warn("send_friend_request failed:", error && error.message);
      return fail("Couldn't send that request. Try again.");
    }

    RelationshipStatusService.setCached(otherUserId, data);
    return data;
  }

  async function respondToRequest(requestId, otherUserId, accept) {
    const supa = getClient();
    if (!supa) return fail("Couldn't do that right now. Try again.");

    const { data, error } = await supa.rpc("respond_to_friend_request", {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error || !data) {
      console.warn("respond_to_friend_request failed:", error && error.message);
      return fail("Couldn't do that right now. Try again.");
    }

    if (otherUserId) RelationshipStatusService.setCached(otherUserId, data);
    return data;
  }

  async function cancelRequest(requestId, otherUserId) {
    const supa = getClient();
    if (!supa) return fail("Couldn't cancel that request. Try again.");

    const { data, error } = await supa.rpc("cancel_friend_request", { p_request_id: requestId });
    if (error || !data) {
      console.warn("cancel_friend_request failed:", error && error.message);
      return fail("Couldn't cancel that request. Try again.");
    }

    if (otherUserId) RelationshipStatusService.setCached(otherUserId, { status: "none" });
    return data;
  }

  function localToday() {
    if (typeof todayString === "function") return todayString();
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  async function listRequests() {
    const supa = getClient();
    if (!supa) return { incoming: [], outgoing: [] };

    const { data, error } = await supa.rpc("list_friend_requests", { p_today: localToday() });
    if (error || !data) {
      console.warn("list_friend_requests failed:", error && error.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load friend requests.");
      return { incoming: [], outgoing: [] };
    }

    return data;
  }

  return { sendRequest, respondToRequest, cancelRequest, listRequests };
})();
