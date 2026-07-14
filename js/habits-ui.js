// Habit Tracker - Habits screen chrome
//
// Purely presentational + interaction wiring: active-habit count, the
// floating action button that reveals the existing add-habit form, and the
// empty-state "Create your first habit" button. All mutations still go
// through the existing global functions from app.js.

(function () {
  const habitsSubtitle = document.getElementById("habitsSubtitle");
  const habitFab = document.getElementById("habitFab");
  const addHabitPanel = document.getElementById("addHabitPanel");
  const habitInputEl = document.getElementById("habitInput");
  const habitListEl = document.getElementById("habitList");

  if (!habitsSubtitle || !habitFab) return;

  function openAddForm() {
    addHabitPanel.hidden = false;
    requestAnimationFrame(() => addHabitPanel.classList.add("open"));
    habitFab.classList.add("is-open");
    habitInputEl.focus();
  }

  function closeAddForm(restoreFocus) {
    addHabitPanel.classList.remove("open");
    habitFab.classList.remove("is-open");
    setTimeout(() => {
      addHabitPanel.hidden = true;
    }, 300);
    if (restoreFocus) habitFab.focus();
  }

  function toggleAddForm() {
    if (addHabitPanel.hidden) {
      openAddForm();
    } else {
      closeAddForm();
    }
  }

  habitFab.addEventListener("click", toggleAddForm);

  habitInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddForm(true);
  });

  // Deliberately no auto-close after adding: the existing handleAddHabit()
  // already clears and refocuses #habitInput, so keeping the panel open
  // supports adding several habits in a row without reopening the FAB.

  habitListEl.addEventListener("click", (e) => {
    if (e.target.closest("#emptyCreateBtn")) openAddForm();
  });

  function updateSubtitle() {
    const count = loadHabits().length;
    habitsSubtitle.textContent = count === 1 ? "1 active habit" : `${count} active habits`;
  }

  document.addEventListener("habits:updated", updateSubtitle);
  updateSubtitle();
})();
