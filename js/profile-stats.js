// Habit Tracker - Profile stats (pure)
//
// Computes every number the Profile page's Journey Statistics, Achievements
// Summary, and Habit Overview sections need. Zero dependency on the DOM or
// Supabase - reads habits via the existing global helpers from app.js and
// leans on Progression (progression.js) and Achievements (achievements.js)
// for the math those own, so none of it is duplicated here.

window.ProfileStats = (function () {
  function currentStreakAcross(habits) {
    return habits.reduce((max, h) => Math.max(max, calculateStreak(h.history)), 0);
  }

  function longestStreakAcross(habits) {
    return habits.reduce((max, h) => Math.max(max, Achievements.computeLongestStreak(h.history)), 0);
  }

  // Distinct calendar days on which at least one habit was completed -
  // "how many days were you active", not "days since you joined".
  function totalActiveDays(habits) {
    const days = new Set();
    habits.forEach((h) => h.history.forEach((d) => days.add(d)));
    return days.size;
  }

  function completionRatio(habit, today) {
    const createdAt = habit.createdAt || today;
    const tracked = Math.max(1, Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${createdAt}T00:00:00Z`)) / 86400000) + 1);
    return habit.history.length / tracked;
  }

  function bestAndWeakestHabit(habits, today) {
    if (habits.length === 0) return { best: null, weakest: null };
    const ratios = habits.map((h) => ({ name: h.name, ratio: completionRatio(h, today) }));
    const best = ratios.reduce((top, r) => (r.ratio > top.ratio ? r : top), ratios[0]);
    if (habits.length < 2) return { best: best.name, weakest: null };
    const weakest = ratios.reduce((low, r) => (r.ratio < low.ratio ? r : low), ratios[0]);
    return { best: best.name, weakest: weakest.name === best.name ? null : weakest.name };
  }

  // Latest achievement = the last-unlocked entry in Achievements' ordering
  // (roughly increasing difficulty). Nothing persists unlock timestamps, so
  // this is the closest honest reading of "latest" available.
  function latestAchievement(achievements) {
    const unlocked = achievements.filter((a) => a.unlocked);
    return unlocked.length ? unlocked[unlocked.length - 1] : null;
  }

  function compute(habits, totalXP) {
    const today = todayString();
    const progress = Progression.getLevelProgress(totalXP || 0);
    const achievements = Achievements.evaluate(habits);
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    const completedToday = habits.filter((h) => h.history.includes(today)).length;
    const { best, weakest } = bestAndWeakestHabit(habits, today);

    return {
      currentStreak: currentStreakAcross(habits),
      longestStreak: longestStreakAcross(habits),
      level: progress.level,
      totalXP: progress.totalXP,
      currentLevelXP: progress.currentLevelXP,
      xpForNextLevel: progress.xpForNextLevel,
      levelProgressPct: progress.progressPct,
      habitsCompleted: habits.reduce((sum, h) => sum + h.history.length, 0),
      totalActiveDays: totalActiveDays(habits),
      achievementsUnlocked: unlockedCount,
      achievementsTotal: achievements.length,
      achievementsPct: achievements.length ? Math.round((unlockedCount / achievements.length) * 100) : 0,
      latestAchievement: latestAchievement(achievements),
      currentHabitsCount: habits.length,
      completedTodayCount: completedToday,
      completionRateTodayPct: habits.length ? Math.round((completedToday / habits.length) * 100) : 0,
      bestHabit: best,
      needsImprovementHabit: weakest,
    };
  }

  return { compute };
})();
