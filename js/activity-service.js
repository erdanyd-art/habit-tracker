// Habit Tracker - Activity feed generation (Supabase I/O)
//
// Purely event-reactive, same shape as xp-sync.js: listens to the existing
// "habits:updated" / "xp:updated" events (never touches app.js, xp-ui.js,
// xp-sync.js, or progression.js) and posts activity_feed rows when it
// detects a habit completing, a streak milestone, every habit being done
// for the day, or a level up. Only public habits ever generate a post -
// same cross-user privacy boundary used everywhere else in this app.

window.ActivityService = (function () {
  const MILESTONE_KEY = "activity_streak_milestones";
  const ALL_DONE_KEY = "activity_all_completed_last_date";
  const LEVEL_KEY = "activity_last_known_level";

  // Mirrors the streak goals in Achievements.LIST (Week Warrior/Two Weeks
  // Strong/Month Master/Habit Legend) as plain numbers - duplicated rather
  // than reverse-engineered from that list's metric functions, same small
  // deliberate duplication xp-ui.js already has for its own level tracking.
  const STREAK_MILESTONES = [7, 14, 30, 100];

  let previousCompletions = null; // Map<habitId, boolean> from the last habits:updated

  function getClient() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getClient();
  }

  function getUser() {
    return typeof CloudSync === "undefined" ? null : CloudSync.getCurrentUser();
  }

  async function postActivity(fields) {
    const supa = getClient();
    const user = getUser();
    if (!supa || !user) return;

    const { error } = await supa.from("activity_feed").insert({ user_id: user.id, ...fields });
    if (error) console.warn("Activity post failed:", error.message);
  }

  function loadMilestones() {
    try {
      return JSON.parse(localStorage.getItem(MILESTONE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveMilestones(milestones) {
    localStorage.setItem(MILESTONE_KEY, JSON.stringify(milestones));
  }

  function checkStreakMilestone(habit) {
    const streak = calculateStreak(habit.history);
    if (!STREAK_MILESTONES.includes(streak)) return;

    const milestones = loadMilestones();
    const posted = milestones[habit.id] || [];
    if (posted.includes(streak)) return;

    postActivity({ activity_type: "streak_milestone", habit_name: habit.name, streak_days: streak });
    milestones[habit.id] = [...posted, streak];
    saveMilestones(milestones);
  }

  function checkAllHabitsCompleted(habits, today) {
    if (habits.length === 0) return;
    const allDone = habits.every((h) => h.history.includes(today));
    if (!allDone) return;

    if (localStorage.getItem(ALL_DONE_KEY) === today) return;

    postActivity({ activity_type: "all_habits_completed" });
    localStorage.setItem(ALL_DONE_KEY, today);
  }

  function snapshotCompletions(habits, today) {
    const map = new Map();
    habits.forEach((h) => map.set(h.id, h.history.includes(today)));
    return map;
  }

  function handleHabitsUpdated() {
    if (typeof CloudSync === "undefined" || !CloudSync.isAuthed()) return;

    const habits = loadHabits();
    const today = todayString();
    const prevSnapshot = previousCompletions;
    previousCompletions = snapshotCompletions(habits, today);

    // First observation this session - nothing to diff against yet, so
    // don't retroactively post for habits that were already complete
    // before this page load (same reasoning xp-ui.js uses for level-ups).
    if (!prevSnapshot) return;

    habits.forEach((habit) => {
      const wasComplete = prevSnapshot.get(habit.id) || false;
      const isComplete = habit.history.includes(today);
      if (!wasComplete && isComplete && habit.isPublic) {
        postActivity({ activity_type: "habit_completed", habit_name: habit.name });
        checkStreakMilestone(habit);
      }
    });

    checkAllHabitsCompleted(habits, today);
  }

  function getLastKnownLevel() {
    const raw = localStorage.getItem(LEVEL_KEY);
    return raw ? parseInt(raw, 10) : null;
  }

  function handleXPUpdate(event) {
    if (typeof CloudSync === "undefined" || !CloudSync.isAuthed()) return;
    if (typeof Progression === "undefined") return;

    const level = Progression.getLevelProgress(event.detail.totalXP).level;
    const last = getLastKnownLevel();

    if (last === null) {
      localStorage.setItem(LEVEL_KEY, String(level));
      return;
    }

    if (level > last) {
      postActivity({ activity_type: "level_up", level });
    }
    localStorage.setItem(LEVEL_KEY, String(level));
  }

  async function fetchFriendsFeed(limit, offset) {
    const supa = getClient();
    if (!supa) return [];

    const { data, error } = await supa.rpc("get_friends_activity_feed", {
      p_limit: limit || 30,
      p_offset: offset || 0,
    });

    if (error || !data) {
      console.warn("get_friends_activity_feed failed:", error && error.message);
      if (typeof ErrorUI !== "undefined") ErrorUI.showToast("Couldn't load activity right now.");
      return [];
    }

    return data;
  }

  document.addEventListener("habits:updated", handleHabitsUpdated);
  document.addEventListener("xp:updated", handleXPUpdate);
  document.addEventListener("auth:changed", () => {
    previousCompletions = null;
  });

  return { fetchFriendsFeed };
})();
