// Habit Tracker - Analytics module (additive, reads data via app.js's global helpers)

(function () {
  const statCurrentStreak = document.getElementById("statCurrentStreak");
  const statLongestStreak = document.getElementById("statLongestStreak");
  const statCompletionRate = document.getElementById("statCompletionRate");
  const statTotalCompleted = document.getElementById("statTotalCompleted");
  const insightsRingProgress = document.getElementById("insightsRingProgress");
  const insightsHeroMessage = document.getElementById("insightsHeroMessage");
  const weeklyCanvas = document.getElementById("weeklyChart");

  if (!statCurrentStreak || !weeklyCanvas) return;

  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let weeklyChart = null;
  let lastRate = 0;
  let countRafId = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(`${dateStrA}T00:00:00Z`);
    const b = new Date(`${dateStrB}T00:00:00Z`);
    return Math.round((b - a) / 86400000);
  }

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

  function getMondayOfThisWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  }

  function computeStats(habits) {
    const today = todayString();

    let currentStreak = 0;
    let longestStreak = 0;
    let totalCompleted = 0;
    let totalPossible = 0;

    habits.forEach((habit) => {
      currentStreak = Math.max(currentStreak, calculateStreak(habit.history));
      longestStreak = Math.max(longestStreak, computeLongestStreak(habit.history));
      totalCompleted += habit.history.length;

      const createdAt = habit.createdAt || today;
      const tracked = Math.max(1, daysBetween(createdAt, today) + 1);
      totalPossible += tracked;
    });

    const completionRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    return { currentStreak, longestStreak, totalCompleted, completionRate };
  }

  function computeWeeklyData(habits) {
    const monday = getMondayOfThisWeek();
    const labels = [];
    const values = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = dateToStr(d);
      labels.push(WEEKDAY_LABELS[i]);

      if (habits.length === 0) {
        values.push(0);
      } else {
        const completed = habits.filter((h) => h.history.includes(dStr)).length;
        values.push(Math.round((completed / habits.length) * 100));
      }
    }

    const todayIndex = indexOfToday(monday);
    return { labels, values, todayIndex };
  }

  function indexOfToday(monday) {
    const today = todayString();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (dateToStr(d) === today) return i;
    }
    return -1;
  }

  function heroMessageFor(stats, total) {
    if (total === 0) return "Add your first habit to start tracking.";
    if (stats.currentStreak >= 30) return "Unstoppable. A month-long streak.";
    if (stats.currentStreak >= 7) return "A full week strong. Keep it up.";
    if (stats.completionRate >= 80) return "Excellent consistency overall.";
    if (stats.completionRate >= 50) return "Solid progress. Keep building.";
    if (stats.completionRate > 0) return "Every day counts. Keep going.";
    return "Your journey starts with day one.";
  }

  function animateRate(from, to) {
    if (countRafId) cancelAnimationFrame(countRafId);
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      statCompletionRate.textContent = `${value}%`;
      if (t < 1) {
        countRafId = requestAnimationFrame(tick);
      } else {
        countRafId = null;
      }
    }

    countRafId = requestAnimationFrame(tick);
  }

  function renderHero(stats, total) {
    statCurrentStreak.textContent = String(stats.currentStreak);
    statLongestStreak.textContent = String(stats.longestStreak);
    statTotalCompleted.textContent = String(stats.totalCompleted);

    if (insightsRingProgress) {
      insightsRingProgress.style.setProperty("--progress", stats.completionRate);
    }
    animateRate(lastRate, stats.completionRate);
    lastRate = stats.completionRate;

    if (insightsHeroMessage) {
      insightsHeroMessage.textContent = heroMessageFor(stats, total);
    }
  }

  function renderWeeklyChart(data) {
    const wrapper = weeklyCanvas.closest(".chart-wrapper");

    if (typeof Chart === "undefined") {
      if (wrapper) {
        weeklyCanvas.style.visibility = "hidden";
        if (typeof ErrorUI !== "undefined") {
          ErrorUI.showInlineError(wrapper, "Chart unavailable right now.", "📊");
        }
      }
      return;
    }

    try {
      const accent = cssVar("--color-accent") || "#0071e3";
      const textSecondary = cssVar("--color-text-secondary") || "#86868b";
      const border = cssVar("--color-border") || "#d2d2d7";

      const ctx = weeklyCanvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 0, weeklyCanvas.clientHeight || 260);
      gradient.addColorStop(0, hexToRgba(accent, 0.3));
      gradient.addColorStop(1, hexToRgba(accent, 0));

      const pointRadii = data.values.map((_, i) => (i === data.todayIndex ? 7 : 3.5));
      const pointColors = data.values.map((_, i) => (i === data.todayIndex ? accent : "#fff"));
      const pointBorderColors = data.values.map((_, i) => (i === data.todayIndex ? "#fff" : accent));
      const pointBorderWidths = data.values.map((_, i) => (i === data.todayIndex ? 3 : 2));

      if (weeklyChart) weeklyChart.destroy();
      weeklyChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: data.labels,
          datasets: [
            {
              label: "Completion %",
              data: data.values,
              borderColor: accent,
              backgroundColor: gradient,
              pointBackgroundColor: pointColors,
              pointBorderColor: pointBorderColors,
              pointBorderWidth: pointBorderWidths,
              pointRadius: pointRadii,
              pointHoverRadius: 8,
              borderWidth: 3,
              tension: 0.45,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 12, right: 8, bottom: 0, left: 0 } },
          animation: { duration: 900, easing: "easeOutQuart" },
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 10,
              cornerRadius: 10,
              displayColors: false,
              callbacks: { label: (item) => `${item.parsed.y}% completed` },
            },
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { color: textSecondary, callback: (v) => `${v}%`, stepSize: 25, font: { size: 11 } },
              grid: { color: hexToRgba(border, 0.5) },
              border: { display: false },
            },
            x: {
              ticks: { color: textSecondary, font: { size: 12, weight: "600" } },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      });
    } catch (err) {
      console.warn("Chart rendering failed:", (err && err.message) || err);
      if (wrapper) {
        weeklyCanvas.style.visibility = "hidden";
        if (typeof ErrorUI !== "undefined") {
          ErrorUI.showInlineError(wrapper, "Chart unavailable right now.", "📊");
        }
      }
      return;
    }

    if (wrapper) {
      weeklyCanvas.style.visibility = "";
      if (typeof ErrorUI !== "undefined") ErrorUI.clearInlineError(wrapper);
    }
  }

  function renderAnalytics() {
    const habits = loadHabits();
    renderHero(computeStats(habits), habits.length);
    renderWeeklyChart(computeWeeklyData(habits));
  }

  document.addEventListener("habits:updated", renderAnalytics);

  if (typeof themeToggleBtn !== "undefined" && themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => setTimeout(renderAnalytics, 0));
  }

  renderAnalytics();
})();
