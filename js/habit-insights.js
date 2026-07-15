// Habit Tracker - Achievements + auto-generated habit insights
//
// Purely presentational: every achievement and insight is evaluated live
// against existing habits data via window.Achievements (achievements.js).
// Nothing is stored, nothing is written to Supabase - re-derived from
// scratch on every render, same as the rest of the Insights screen.

(function () {
  const achievementsList = document.getElementById("achievementsList");
  const habitInsightsList = document.getElementById("habitInsightsList");

  if (!achievementsList || !habitInsightsList) return;

  const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(`${dateStrA}T00:00:00Z`);
    const b = new Date(`${dateStrB}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
  }

  function renderAchievements(habits) {
    achievementsList.innerHTML = Achievements.evaluate(habits).map((achievement) => {
      return `
        <div class="achievement-card ${achievement.unlocked ? "unlocked" : "locked"}">
          <div class="achievement-icon">${achievement.unlocked ? achievement.icon : "🔒"}</div>
          <p class="achievement-title">${achievement.title}</p>
          <p class="achievement-description">${achievement.description}</p>
          ${
            achievement.unlocked
              ? `<span class="achievement-badge">Unlocked</span>`
              : `<div class="achievement-progress-track"><div class="achievement-progress-fill" style="width:${achievement.pct}%"></div></div>
                 <span class="achievement-progress-label">${achievement.value}/${achievement.goal}</span>`
          }
        </div>
      `;
    }).join("");
  }

  function weekAverage(habits, offsetDays) {
    if (habits.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - offsetDays - i);
      const dStr = dateToStr(d);
      const completed = habits.filter((h) => h.history.includes(dStr)).length;
      sum += (completed / habits.length) * 100;
    }
    return sum / 7;
  }

  function computeHabitInsights(habits) {
    if (habits.length === 0) {
      return [{ icon: "🌱", label: "Get started", value: "Add a habit to see insights" }];
    }

    const insights = [];
    const today = todayString();

    const ratios = habits.map((h) => {
      const createdAt = h.createdAt || today;
      const tracked = Math.max(1, daysBetween(createdAt, today) + 1);
      return { name: h.name, ratio: h.history.length / tracked };
    });

    const mostConsistent = ratios.reduce((best, r) => (r.ratio > best.ratio ? r : best), ratios[0]);
    insights.push({ icon: "🥇", label: "Most Consistent", value: mostConsistent.name });

    if (habits.length >= 2) {
      const mostSkipped = ratios.reduce((worst, r) => (r.ratio < worst.ratio ? r : worst), ratios[0]);
      insights.push({ icon: "📉", label: "Most Skipped", value: mostSkipped.name });
    }

    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    habits.forEach((h) => {
      h.history.forEach((dStr) => {
        const day = new Date(`${dStr}T00:00:00Z`).getUTCDay();
        weekdayCounts[day]++;
      });
    });

    const totalEntries = weekdayCounts.reduce((a, b) => a + b, 0);
    if (totalEntries > 0) {
      let bestDay = 0;
      let worstDay = 0;
      for (let i = 1; i < 7; i++) {
        if (weekdayCounts[i] > weekdayCounts[bestDay]) bestDay = i;
        if (weekdayCounts[i] < weekdayCounts[worstDay]) worstDay = i;
      }
      insights.push({ icon: "📆", label: "Best Weekday", value: WEEKDAY_NAMES[bestDay] });
      if (weekdayCounts[bestDay] !== weekdayCounts[worstDay]) {
        insights.push({ icon: "🗓️", label: "Toughest Weekday", value: WEEKDAY_NAMES[worstDay] });
      }
    }

    const thisWeekAvg = weekAverage(habits, 0);
    const lastWeekAvg = weekAverage(habits, 7);
    let trendText = "Steady";
    if (thisWeekAvg > lastWeekAvg + 5) trendText = "Trending up";
    else if (thisWeekAvg < lastWeekAvg - 5) trendText = "Trending down";
    insights.push({ icon: "📈", label: "Completion Trend", value: trendText });
    insights.push({ icon: "📊", label: "Weekly Average", value: `${Math.round(thisWeekAvg)}%` });

    return insights;
  }

  function renderHabitInsights(habits) {
    habitInsightsList.innerHTML = computeHabitInsights(habits)
      .map(
        (insight) => `
          <div class="insight-row">
            <span class="insight-icon">${insight.icon}</span>
            <span class="insight-label">${insight.label}</span>
            <span class="insight-value">${escapeHtml(insight.value)}</span>
          </div>
        `
      )
      .join("");
  }

  function render() {
    const habits = loadHabits();
    renderAchievements(habits);
    renderHabitInsights(habits);
  }

  document.addEventListener("habits:updated", render);
  render();
})();
