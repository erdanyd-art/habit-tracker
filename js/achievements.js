// Habit Tracker - Achievement definitions (pure, shared)
//
// Single source of truth for the achievement list and unlock math, used by
// the Insights screen (habit-insights.js) and the Profile screen
// (profile-stats.js) so the two never drift out of sync. Zero dependency on
// the DOM or Supabase - purely derived from habits data, same as the rest
// of the progression system.

window.Achievements = (function () {
  function computeLongestStreak(history) {
    if (!history.length) return 0;
    const days = Array.from(new Set(history))
      .map((d) => new Date(`${d}T00:00:00Z`).getTime())
      .sort((a, b) => a - b);

    let longest = 1;
    let current = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i] - days[i - 1] === 86400000) {
        current++;
      } else {
        current = 1;
      }
      longest = Math.max(longest, current);
    }
    return longest;
  }

  // Ordered roughly by increasing difficulty - "latest achievement" (see
  // profile-stats.js) is taken to be the last unlocked entry in this order.
  const LIST = [
    {
      icon: "🌱",
      title: "First Step",
      description: "Add your first habit",
      goal: 1,
      metric: (habits) => (habits.length > 0 ? 1 : 0),
    },
    {
      icon: "🔥",
      title: "Week Warrior",
      description: "Reach a 7-day streak",
      goal: 7,
      metric: (habits, longestOverall) => longestOverall,
    },
    {
      icon: "💪",
      title: "Two Weeks Strong",
      description: "Reach a 14-day streak",
      goal: 14,
      metric: (habits, longestOverall) => longestOverall,
    },
    {
      icon: "🏆",
      title: "Month Master",
      description: "Reach a 30-day streak",
      goal: 30,
      metric: (habits, longestOverall) => longestOverall,
    },
    {
      icon: "💯",
      title: "Century Club",
      description: "Complete 100 habits total",
      goal: 100,
      metric: (habits, longestOverall, totalCompleted) => totalCompleted,
    },
    {
      icon: "⭐",
      title: "Habit Legend",
      description: "Reach a 100-day streak",
      goal: 100,
      metric: (habits, longestOverall) => longestOverall,
    },
  ];

  // Re-evaluates every achievement against the current habits, live -
  // nothing is stored, so this is cheap to call on every render.
  function evaluate(habits) {
    const longestOverall = habits.reduce((max, h) => Math.max(max, computeLongestStreak(h.history)), 0);
    const totalCompleted = habits.reduce((sum, h) => sum + h.history.length, 0);

    return LIST.map((achievement) => {
      const rawValue = achievement.metric(habits, longestOverall, totalCompleted);
      const unlocked = rawValue >= achievement.goal;
      const pct = Math.min(100, Math.round((rawValue / achievement.goal) * 100));
      return {
        ...achievement,
        value: Math.min(rawValue, achievement.goal),
        unlocked,
        pct,
      };
    });
  }

  return { LIST, computeLongestStreak, evaluate };
})();
