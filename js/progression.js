// Habit Tracker - Progression system (pure utilities)
//
// Zero dependency on the DOM or Supabase - this is the reusable core that
// xp-sync.js, xp-ui.js, and future features (Achievements, Weekly Reports,
// Leaderboards) should all import from, so the XP/level math only ever
// lives in one place.

window.Progression = (function () {
  const XP_VALUES = {
    easy: 5,
    medium: 10,
    hard: 20,
    extreme: 35,
  };

  function getHabitXPValue(difficulty) {
    return XP_VALUES[difficulty] || XP_VALUES.medium;
  }

  // XP required to advance from `level` to `level + 1`. A formula, not a
  // lookup table, so it supports unlimited future levels with no code
  // changes. Grows faster than linear (^1.5) so progression stays cheap
  // early on and gradually gets more demanding.
  function xpRequiredForLevel(level) {
    return Math.round(100 * Math.pow(level, 1.5));
  }

  // Walks the formula upward to find which level a given lifetime XP total
  // lands on, plus how far into that level the user is. O(level) - trivial
  // even at level 1000, and avoids needing a closed-form inverse of the
  // formula above.
  function getLevelProgress(totalXP) {
    const safeTotal = Math.max(0, totalXP || 0);
    let level = 1;
    let xpConsumed = 0;

    while (true) {
      const needed = xpRequiredForLevel(level);
      if (xpConsumed + needed > safeTotal) break;
      xpConsumed += needed;
      level++;
    }

    const xpForNextLevel = xpRequiredForLevel(level);
    const currentLevelXP = safeTotal - xpConsumed;

    return {
      level,
      totalXP: safeTotal,
      currentLevelXP,
      xpForNextLevel,
      progressPct: Math.min(100, Math.round((currentLevelXP / xpForNextLevel) * 100)),
    };
  }

  // Best-effort local total (sum over CURRENT habits only). Used as an
  // instant-render fallback before the authoritative ledger total loads,
  // and as the only source of truth for guests who aren't signed in.
  // Note this does NOT survive habit deletion the way the Supabase ledger
  // does - a deleted habit's past XP won't show here.
  function computeLocalTotalXP(habits) {
    return habits.reduce((sum, h) => sum + h.history.length * getHabitXPValue(h.difficulty), 0);
  }

  // For future Weekly Reports: XP earned within an inclusive date range,
  // from the same local habit data.
  function computeLocalXPInRange(habits, startDateStr, endDateStr) {
    return habits.reduce((sum, h) => {
      const count = h.history.filter((d) => d >= startDateStr && d <= endDateStr).length;
      return sum + count * getHabitXPValue(h.difficulty);
    }, 0);
  }

  return {
    XP_VALUES,
    getHabitXPValue,
    xpRequiredForLevel,
    getLevelProgress,
    computeLocalTotalXP,
    computeLocalXPInRange,
  };
})();
