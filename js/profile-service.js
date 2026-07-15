// Habit Tracker - Profile service (Supabase I/O)
//
// The only file that talks to Supabase for the "profiles" table. Reuses
// CloudSync's existing authenticated client/session (via its getClient /
// getCurrentUser getters) instead of creating a second Supabase client -
// same pattern as xp-sync.js. Knows nothing about rendering; profile-ui.js
// reacts to the "profile:updated" event this dispatches.

window.ProfileService = (function () {
  const TABLE = "profiles";
  let cachedProfile = null;

  function getClient() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getClient();
  }

  function getUser() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getCurrentUser();
  }

  function usernameFromEmail(email) {
    const local = (email || "user").split("@")[0];
    const cleaned = local.toLowerCase().replace(/[^a-z0-9_]/g, "");
    return cleaned || "user";
  }

  // Used both by the SQL trigger's seed row (see schema.sql) and as a
  // client-side fallback for accounts that existed before that trigger was
  // added - so a signed-in user is never left with zero profile rows.
  function defaultsFromAuthUser(user) {
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || (user.email ? user.email.split("@")[0] : "You");
    return {
      id: user.id,
      display_name: fullName,
      username: usernameFromEmail(user.email),
      bio: "",
      avatar_url: meta.avatar_url || null,
      joined_at: user.created_at || new Date().toISOString(),
    };
  }

  async function fetchProfile() {
    const supa = getClient();
    const user = getUser();
    if (!supa || !user) {
      cachedProfile = null;
      return null;
    }

    const { data, error } = await supa.from(TABLE).select("*").eq("id", user.id).maybeSingle();
    if (error) {
      console.warn("Profile fetch failed:", error.message);
      if (typeof ErrorUI !== "undefined" && navigator.onLine) {
        ErrorUI.showToast("Couldn't load your profile. We'll keep trying.");
      }
      return cachedProfile;
    }

    if (data) {
      cachedProfile = data;
      return data;
    }

    // No row yet - pre-migration account, or the on-signup trigger hasn't
    // run for some other reason. Seed one now rather than showing a blank
    // profile forever.
    const seed = defaultsFromAuthUser(user);
    const { data: inserted, error: insertError } = await supa.from(TABLE).insert(seed).select().maybeSingle();
    if (insertError) {
      console.warn("Profile seed failed:", insertError.message);
      cachedProfile = seed;
      return seed;
    }

    cachedProfile = inserted;
    return inserted;
  }

  async function updateProfile(fields) {
    const supa = getClient();
    const user = getUser();
    if (!supa || !user) return { error: "You need to sign in to edit your profile." };

    const patch = { updated_at: new Date().toISOString() };
    if (typeof fields.display_name === "string") patch.display_name = fields.display_name.trim();
    if (typeof fields.username === "string") patch.username = fields.username.trim();
    if (typeof fields.bio === "string") patch.bio = fields.bio.trim();

    const { data, error } = await supa.from(TABLE).update(patch).eq("id", user.id).select().maybeSingle();
    if (error) {
      // Postgres unique_violation - the only constraint on this table
      // besides the primary key, so it can only mean the username.
      const message = error.code === "23505" ? "That username is already taken." : "Couldn't save your profile. Try again.";
      return { error: message };
    }

    cachedProfile = data;
    document.dispatchEvent(new CustomEvent("profile:updated", { detail: { profile: data } }));
    return { profile: data };
  }

  async function syncAndBroadcast() {
    const profile = await fetchProfile();
    document.dispatchEvent(new CustomEvent("profile:updated", { detail: { profile } }));
  }

  document.addEventListener("auth:changed", syncAndBroadcast);

  return {
    getCached: () => cachedProfile,
    fetchProfile,
    updateProfile,
    refresh: syncAndBroadcast,
  };
})();
