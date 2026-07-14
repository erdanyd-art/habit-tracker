// Habit Tracker - Home screen
//
// Purely presentational: reads the existing habits data and renders the
// greeting, hero progress card, "Continue Today" task list, and weekly
// activity strip. Mutations (toggling a habit) go through the existing
// global toggleHabit() from app.js - no new business logic is introduced.

(function () {
  const greetingText = document.getElementById("greetingText");
  const homeSubtitle = document.getElementById("homeSubtitle");
  const heroRingProgress = document.getElementById("heroRingProgress");
  const heroPercent = document.getElementById("heroPercent");
  const heroCount = document.getElementById("heroCount");
  const heroMessage = document.getElementById("heroMessage");
  const heroStreak = document.getElementById("heroStreak");
  const todayTaskList = document.getElementById("todayTaskList");
  const weeklyActivityLabels = document.getElementById("weeklyActivityLabels");
  const weeklyActivityChips = document.getElementById("weeklyActivityChips");

  if (!heroRingProgress) return;

  let lastPct = 0;
  let countRafId = null;

  function timeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }

  function getDisplayName() {
    if (typeof CloudSync === "undefined" || !CloudSync.isAuthed()) return null;
    const user = CloudSync.getCurrentUser();
    if (!user) return null;

    const meta = user.user_metadata || {};
    if (meta.given_name) return meta.given_name;

    const fullName = meta.full_name || meta.name;
    if (fullName) return fullName.split(" ")[0];

    if (user.email) return user.email.split("@")[0];
    return null;
  }

  function subtitleFor(pct, completed, total) {
    if (total === 0) return "Small steps every day add up.";
    const remaining = total - completed;
    if (remaining === 0) return "Everything is complete.";
    if (remaining === 1) return "One habit left.";
    if (pct >= 50) return "You're halfway there.";
    return "Small steps every day add up.";
  }

  function heroMessageFor(pct, total) {
    if (total === 0) return "Every streak starts with one step.";
    if (pct === 100) return "Amazing. See you again tomorrow.";
    if (pct >= 50) return "You're almost there.";
    if (pct > 0) return "Nice start. Keep going.";
    return "Every streak starts with one step.";
  }

  function bestCurrentStreak(habits) {
    let max = 0;
    habits.forEach((h) => {
      max = Math.max(max, calculateStreak(h.history));
    });
    return max;
  }

  function animatePercent(from, to) {
    if (countRafId) cancelAnimationFrame(countRafId);
    const duration = 900;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      heroPercent.textContent = `${value}%`;
      if (t < 1) {
        countRafId = requestAnimationFrame(tick);
      } else {
        countRafId = null;
      }
    }

    countRafId = requestAnimationFrame(tick);
  }

  function renderTodayTasks(habits) {
    const today = todayString();
    const incomplete = habits.filter((h) => !h.history.includes(today));

    todayTaskList.innerHTML = "";

    if (habits.length === 0) {
      todayTaskList.innerHTML = `<p class="today-empty">No habits yet. Add one to get started.</p>`;
      return;
    }

    if (incomplete.length === 0) {
      todayTaskList.innerHTML = `
        <div class="today-complete">
          <span class="today-complete-emoji">🎉</span>
          <p class="today-complete-title">Everything completed today.</p>
          <p class="today-complete-subtitle">See you tomorrow.</p>
        </div>
      `;
      return;
    }

    incomplete.forEach((habit, index) => {
      const streak = calculateStreak(habit.history);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "today-task-card";
      card.style.animationDelay = `${index * 0.05}s`;
      card.setAttribute("aria-label", `${habit.name}${streak > 0 ? `, ${streak} day streak` : ""} - mark as complete`);
      card.innerHTML = `
        <span class="today-task-icon" aria-hidden="true">${pickHabitIcon(habit.name)}</span>
        <span class="today-task-name">${escapeHtml(habit.name)}</span>
        ${streak > 0 ? `<span class="today-task-streak" aria-hidden="true">🔥 ${streak}</span>` : ""}
        <span class="today-task-check" aria-hidden="true"></span>
      `;
      card.addEventListener("click", () => {
        if (card.classList.contains("completing")) return;
        card.classList.add("completing");
        setTimeout(() => toggleHabit(habit.id), 300);
      });
      todayTaskList.appendChild(card);
    });
  }

  function renderWeeklyActivity() {
    const days = getLastSevenDays();
    const today = todayString();

    weeklyActivityLabels.innerHTML = days
      .map((d) => `<span>${DAY_LABELS[d.getDay()]}</span>`)
      .join("");

    weeklyActivityChips.innerHTML = days
      .map((d) => {
        const dStr = dateToStr(d);
        const filled = getDayCompletionStatus(dStr) === "full";
        const isToday = dStr === today;
        return `<span class="weekly-chip ${filled ? "filled" : ""} ${isToday ? "is-today" : ""}"></span>`;
      })
      .join("");
  }

  function render() {
    const currentHabits = loadHabits();
    const today = todayString();
    const total = currentHabits.length;
    const completed = currentHabits.filter((h) => h.history.includes(today)).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (greetingText) {
      const name = getDisplayName();
      greetingText.textContent = name ? `${timeGreeting()}, ${name}` : timeGreeting();
    }
    if (homeSubtitle) homeSubtitle.textContent = subtitleFor(pct, completed, total);

    heroRingProgress.style.setProperty("--progress", pct);
    animatePercent(lastPct, pct);
    lastPct = pct;

    heroCount.textContent = `${completed}/${total}`;
    heroMessage.textContent = heroMessageFor(pct, total);
    heroStreak.textContent = String(bestCurrentStreak(currentHabits));

    renderTodayTasks(currentHabits);
    renderWeeklyActivity();
  }

  document.addEventListener("habits:updated", render);
  document.addEventListener("auth:changed", render);
  render();
})();
