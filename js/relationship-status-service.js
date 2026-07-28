// Habit Tracker - Relationship status service (Supabase I/O)
//
// Wraps the single RPC get_relationship_status() (see supabase/schema.sql),
// which returns one of: self / friends / request_sent / request_received
// (with request_id) / none / signed_out. Not security definer server-side -
// RLS already lets a signed-in user see any friend_requests/friendships row
// they're a party to, which is exactly what's needed here.
//
// Owns an in-memory cache keyed by other-user-id so the same profile isn't
// re-fetched on every render (the sprint's "avoid unnecessary Supabase
// requests" ask) - js/friend-request-service.js and js/friend-service.js
// call setCached()/invalidate() after a mutation so a visible button
// reflects the new state immediately without a round trip.
//
// Uses CloudSync's client when available (inside the main app), falling
// back to the shared standalone client (js/standalone-supabase-client.js)
// on public-profile.html, which has no CloudSync at all.

window.RelationshipStatusService = (function () {
  const cache = new Map();

  function getClient() {
    if (typeof CloudSync !== "undefined") {
      const c = CloudSync.getClient();
      if (c) return c;
    }
    return typeof getStandaloneSupabaseClient === "function" ? getStandaloneSupabaseClient() : null;
  }

  async function getCurrentUserId() {
    if (typeof CloudSync !== "undefined") {
      const user = CloudSync.getCurrentUser();
      if (user) return user.id;
    }
    const supa = getClient();
    if (!supa) return null;
    const { data } = await supa.auth.getSession();
    return data.session ? data.session.user.id : null;
  }

  async function getStatus(otherUserId, options) {
    const force = options && options.force;
    if (!force && cache.has(otherUserId)) return cache.get(otherUserId);

    const supa = getClient();
    if (!supa) return { status: "signed_out" };

    const { data, error } = await supa.rpc("get_relationship_status", { p_other_user_id: otherUserId });
    if (error || !data) {
      console.warn("get_relationship_status failed:", error && error.message);
      return { status: "error" };
    }

    cache.set(otherUserId, data);
    return data;
  }

  function setCached(otherUserId, status) {
    cache.set(otherUserId, status);
  }

  function invalidate(otherUserId) {
    cache.delete(otherUserId);
  }

  return { getClient, getCurrentUserId, getStatus, setCached, invalidate };
})();
