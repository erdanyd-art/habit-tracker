// Habit Tracker - entry point

const STORAGE_KEY = "habits";
const THEME_KEY = "theme";
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const habitInput = document.getElementById("habitInput");
const addHabitBtn = document.getElementById("addHabitBtn");
const habitList = document.getElementById("habitList");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarDetail = document.getElementById("calendarDetail");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const calendarToday = new Date();
let calendarYear = calendarToday.getFullYear();
let calendarMonth = calendarToday.getMonth();
let selectedDateStr = null;

let habits = loadHabits();

function dateToStr(date) {
  // Local calendar date, not UTC - see localDateStr() below. Using
  // toISOString() here used to record completions against the wrong day
  // for any user ahead of UTC during the first hours after local midnight,
  // since the calendar grid was already local-date-based while this was
  // silently UTC-based. Every date-string in the app (history entries,
  // streaks, "today", the calendar, XP grants) is derived from this one
  // function, so fixing it here is sufficient - no other file needs to
  // change.
  return localDateStr(date.getFullYear(), date.getMonth(), date.getDate());
}

function todayString() {
  return dateToStr(new Date());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localDateStr(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

// Escapes the 5 characters that matter for breaking out of HTML text
// content or a quoted attribute. Every place user-entered text (habit
// names) is interpolated into an innerHTML template must be routed
// through this - see the audit finding this fixes.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function migrateHabit(h) {
  if (Array.isArray(h.history)) {
    if (!h.createdAt) {
      h.createdAt = h.history.length ? h.history.slice().sort()[0] : todayString();
    }
    if (!h.updatedAt) {
      h.updatedAt = new Date().toISOString();
    }
    if (!h.difficulty) {
      h.difficulty = "medium";
    }
    return h;
  }

  const history = [];
  if (h.completedToday && h.lastCompletedDate) {
    history.push(h.lastCompletedDate);
  }
  return {
    id: h.id,
    name: h.name,
    history,
    createdAt: history[0] || todayString(),
    updatedAt: new Date().toISOString(),
    difficulty: "medium",
  };
}

function loadHabits() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw).map(migrateHabit);
}

function saveHabits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  document.dispatchEvent(new CustomEvent("habits:updated"));
}

function calculateStreak(history) {
  const set = new Set(history);
  const cursor = new Date();
  let dateStr = dateToStr(cursor);

  if (!set.has(dateStr)) {
    cursor.setDate(cursor.getDate() - 1);
    dateStr = dateToStr(cursor);
  }

  let streak = 0;
  while (set.has(dateStr)) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
    dateStr = dateToStr(cursor);
  }
  return streak;
}

function getLastSevenDays() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function addHabit(name) {
  const habit = {
    id: Date.now().toString(),
    name,
    history: [],
    createdAt: todayString(),
    updatedAt: new Date().toISOString(),
    difficulty: "medium",
  };
  habits.push(habit);
  saveHabits();
  renderHabits();
  if (typeof CloudSync !== "undefined") CloudSync.queueUpsert(habit);
}

function deleteHabit(id) {
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;

  const confirmed = window.confirm(`Delete "${habit.name}"? This cannot be undone.`);
  if (!confirmed) return;

  habits = habits.filter((h) => h.id !== id);
  saveHabits();
  renderHabits();
  if (typeof CloudSync !== "undefined") CloudSync.queueDelete(id);
}

function renameHabit(id, newName) {
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;

  const trimmed = newName.trim();
  if (trimmed && trimmed !== habit.name) {
    habit.name = trimmed;
    habit.updatedAt = new Date().toISOString();
    saveHabits();
    if (typeof CloudSync !== "undefined") CloudSync.queueUpsert(habit);
  }
  renderHabits();
}

function toggleHabit(id) {
  const habit = habits.find((h) => h.id === id);
  if (!habit) return;

  const today = todayString();
  const idx = habit.history.indexOf(today);

  if (idx === -1) {
    habit.history.push(today);
  } else {
    habit.history.splice(idx, 1);
  }
  habit.updatedAt = new Date().toISOString();

  saveHabits();
  renderHabits();
  if (typeof CloudSync !== "undefined") CloudSync.queueUpsert(habit);
}

function renderHabits() {
  habitList.innerHTML = "";

  if (habits.length === 0) {
    habitList.innerHTML = `
      <li class="empty-state">
        <div class="empty-illustration">🌱</div>
        <p class="empty-title">Your journey starts today.</p>
        <button type="button" class="empty-cta" id="emptyCreateBtn">Create your first habit</button>
      </li>
    `;
    renderCalendar();
    return;
  }

  const today = todayString();
  const lastSevenDays = getLastSevenDays();

  habits.forEach((habit) => {
    const isCompletedToday = habit.history.includes(today);
    const streak = calculateStreak(habit.history);

    const weekDots = lastSevenDays
      .map((d) => {
        const dStr = dateToStr(d);
        const filled = habit.history.includes(dStr);
        const label = DAY_LABELS[d.getDay()];
        return `<span class="day-dot ${filled ? "filled" : ""}" title="${dStr}">${label}</span>`;
      })
      .join("");

    const li = document.createElement("li");
    li.className = "habit-item";
    li.dataset.id = habit.id;

    li.innerHTML = `
      <div class="habit-swipe-action habit-swipe-action-complete" aria-hidden="true">
        <span>✓ Complete</span>
      </div>
      <div class="habit-swipe-action habit-swipe-action-manage" aria-hidden="true">
        <button class="edit-btn" aria-label="Rename habit">✎</button>
        <button class="delete-btn" aria-label="Delete habit">✕</button>
      </div>
      <div class="habit-card-surface">
        <div class="habit-card-main">
          <div class="habit-icon-badge">${pickHabitIcon(habit.name)}</div>
          <div class="habit-info">
            <span class="habit-name ${isCompletedToday ? "completed" : ""}" id="habit-name-${habit.id}">${escapeHtml(habit.name)}</span>
            <div class="habit-meta">
              <span class="habit-category">${pickHabitCategory(habit.name)}</span>
              <span class="habit-meta-dot" aria-hidden="true">·</span>
              <span class="habit-schedule">Daily</span>
              <span class="habit-meta-dot" aria-hidden="true">·</span>
              <span class="habit-streak"><span aria-hidden="true">🔥</span> ${streak}</span>
            </div>
          </div>
          <label class="habit-check">
            <input type="checkbox" class="habit-checkbox" aria-labelledby="habit-name-${habit.id}" ${isCompletedToday ? "checked" : ""} />
            <span class="completion-circle ${isCompletedToday ? "completed" : ""}" aria-hidden="true"></span>
          </label>
        </div>
        <div class="habit-card-footer">
          <div class="habit-week">${weekDots}</div>
        </div>
      </div>
    `;

    li.querySelector(".habit-checkbox").addEventListener("change", () => toggleHabit(habit.id));
    li.querySelector(".delete-btn").addEventListener("click", () => deleteHabit(habit.id));
    li.querySelector(".edit-btn").addEventListener("click", () => enterEditMode(li, habit));

    habitList.appendChild(li);
  });

  renderCalendar();
}

const HABIT_ICONS = ["💧", "📚", "🏃", "🧘", "🖊️", "🎯", "🥗", "😴", "🎵", "🌱", "💪", "🧹"];
const HABIT_CATEGORIES = ["Health", "Mindfulness", "Learning", "Fitness", "Productivity", "Lifestyle"];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickHabitIcon(name) {
  return HABIT_ICONS[hashString(name) % HABIT_ICONS.length];
}

function pickHabitCategory(name) {
  return HABIT_CATEGORIES[hashString(`${name}cat`) % HABIT_CATEGORIES.length];
}

function getDayCompletionStatus(dStr) {
  if (habits.length === 0) return "none";
  const completedCount = habits.filter((h) => h.history.includes(dStr)).length;
  if (completedCount === 0) return "none";
  if (completedCount === habits.length) return "full";
  return "partial";
}

function renderCalendar() {
  const now = new Date();
  const todayLocalStr = localDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  calendarMonthLabel.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;

  const firstWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  calendarGrid.innerHTML = "";

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    calendarGrid.appendChild(empty);
  }

  const STATUS_LABELS = { none: "no habits completed", partial: "some habits completed", full: "all habits completed" };

  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = localDateStr(calendarYear, calendarMonth, day);
    const isFuture = dStr > todayLocalStr;
    const isToday = dStr === todayLocalStr;

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = String(day);

    if (isFuture) {
      cell.classList.add("future");
    } else {
      const status = getDayCompletionStatus(dStr);
      cell.classList.add(`status-${status}`, "clickable");
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      const dateLabel = `${MONTH_NAMES[calendarMonth]} ${day}${isToday ? " (today)" : ""}${dStr === selectedDateStr ? " (selected)" : ""}, ${STATUS_LABELS[status]}`;
      cell.setAttribute("aria-label", dateLabel);
      cell.addEventListener("click", () => selectCalendarDate(dStr));
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectCalendarDate(dStr);
        }
      });
    }

    if (isToday) cell.classList.add("today");
    if (dStr === selectedDateStr) cell.classList.add("selected");

    calendarGrid.appendChild(cell);
  }

  calendarGrid.classList.remove("fade-in");
  void calendarGrid.offsetWidth;
  calendarGrid.classList.add("fade-in");
}

function selectCalendarDate(dStr) {
  selectedDateStr = dStr;
  renderCalendarDetail(dStr);
  renderCalendar();
}

function renderCalendarDetail(dStr) {
  calendarDetail.hidden = false;

  if (habits.length === 0) {
    calendarDetail.innerHTML = `<p class="calendar-detail-empty">No habits to track yet.</p>`;
    return;
  }

  const [y, m, d] = dStr.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const completedCount = habits.filter((h) => h.history.includes(dStr)).length;

  const itemsHtml = habits
    .map((h) => {
      const done = h.history.includes(dStr);
      return `<li class="calendar-detail-item"><span>${escapeHtml(h.name)}</span><span>${done ? "✅" : "⬜️"}</span></li>`;
    })
    .join("");

  calendarDetail.innerHTML = `
    <h3 class="calendar-detail-title">${label} — ${completedCount}/${habits.length} completed</h3>
    <ul class="calendar-detail-list">${itemsHtml}</ul>
  `;
}

function changeCalendarMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  } else if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  selectedDateStr = null;
  calendarDetail.hidden = true;
  renderCalendar();
}

prevMonthBtn.addEventListener("click", () => changeCalendarMonth(-1));
nextMonthBtn.addEventListener("click", () => changeCalendarMonth(1));

function enterEditMode(li, habit) {
  const nameSpan = li.querySelector(".habit-name");

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "habit-edit-input";
  editInput.value = habit.name;

  nameSpan.replaceWith(editInput);
  editInput.focus();
  editInput.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      renameHabit(habit.id, editInput.value);
    } else {
      renderHabits();
    }
  };

  editInput.addEventListener("blur", () => finish(true));
  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
}

function handleAddHabit() {
  const name = habitInput.value.trim();
  if (!name) return;
  addHabit(name);
  habitInput.value = "";
  habitInput.focus();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (systemPrefersDark ? "dark" : "light");
  applyTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

themeToggleBtn.addEventListener("click", toggleTheme);

addHabitBtn.addEventListener("click", handleAddHabit);
habitInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAddHabit();
});

initTheme();
renderHabits();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
