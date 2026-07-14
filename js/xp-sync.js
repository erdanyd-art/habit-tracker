// Habit Tracker - XP sync
//
// The only file that talks to Supabase for the progression system. Reuses
// CloudSync's existing authenticated client/session (via the getClient /
// getCurrentUser getters it exposes) instead of creating a second Supabase
// client. Does not touch CloudSync's own habit-sync code paths.
//
// Grants XP by batch-upserting every (habit, date) pair currently in
// history into xp_transactions, relying on that table's unique constraint
// to make repeat attempts no-ops - see progression.js / schema.sql for why.

(function () {
  const TABLE = "xp_transactions";

  function getClient() {
    if (typeof CloudSync === "undefined") return null;
    return CloudSync.getClient();
  }

  function getUser() {
    if (typeof CloudSync === "undefined") return null;
    return CloudSync.getCurrentUser();
  }

  async function grantXPForHistory(habits) {
    const supa = getClient();
    const user = getUser();
    if (!supa || !user) return;

    const rows = [];
    habits.forEach((h) => {
      const xpAmount = Progression.getHabitXPValue(h.difficulty);
      h.history.forEach((dateStr) => {
        rows.push({
          user_id: user.id,
          habit_id: h.id,
          completed_date: dateStr,
          xp_amount: xpAmount,
        });
      });
    });

    if (rows.length === 0) return;

    const { error } = await supa
      .from(TABLE)
      .upsert(rows, { onConflict: "user_id,habit_id,completed_date", ignoreDuplicates: true });

    if (error) {
      console.warn("XP grant deferred:", error.message);
      if (typeof ErrorUI !== "undefined" && navigator.onLine) {
        ErrorUI.showToast("Couldn't sync your progress. We'll keep trying.");
      }
    }
  }

  async function fetchLifetimeXP() {
    const supa = getClient();
    const user = getUser();
    if (!supa || !user) return null;

    const { data, error } = await supa.from(TABLE).select("xp_amount").eq("user_id", user.id);
    if (error) {
      console.warn("XP fetch failed:", error.message);
      if (typeof ErrorUI !== "undefined" && navigator.onLine) {
        ErrorUI.showToast("Couldn't sync your progress. We'll keep trying.");
      }
      return null;
    }

    return (data || []).reduce((sum, row) => sum + row.xp_amount, 0);
  }

  async function syncAndBroadcast() {
    const habits = loadHabits();
    const localTotal = Progression.computeLocalTotalXP(habits);

    // Render instantly with the local best-effort number so the UI never
    // waits on a network round-trip.
    document.dispatchEvent(new CustomEvent("xp:updated", { detail: { totalXP: localTotal } }));

    if (!getClient() || !getUser()) return;

    // Signals the brief window where the number on screen is a local
    // estimate, not yet the authoritative lifetime total from Supabase.
    document.dispatchEvent(new CustomEvent("xp:syncing"));

    await grantXPForHistory(habits);
    const lifetimeXP = await fetchLifetimeXP();
    if (lifetimeXP !== null) {
      document.dispatchEvent(new CustomEvent("xp:updated", { detail: { totalXP: lifetimeXP } }));
    } else {
      document.dispatchEvent(new CustomEvent("xp:sync-failed"));
    }
  }

  document.addEventListener("habits:updated", syncAndBroadcast);
  document.addEventListener("auth:changed", syncAndBroadcast);

  syncAndBroadcast();
})();
