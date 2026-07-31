// Habit Tracker - Activity Feed rendering
//
// Purely presentational: renders whatever ActivityService.fetchFriendsFeed()
// returns. Reloads fresh every time the Activity segment becomes visible
// (see social-ui.js's "social-segment:shown" event) rather than caching for
// the whole session, since friends' activity changes over time.

(function () {
  const listEl = document.getElementById("activityList");
  const loadingEl = document.getElementById("activityLoading");
  const emptyEl = document.getElementById("activityEmpty");
  const loadMoreBtn = document.getElementById("activityLoadMoreBtn");

  if (!listEl || typeof ActivityService === "undefined") return;

  const PAGE_SIZE = 30;
  let offset = 0;

  const TYPE_ICON = {
    level_up: "🏆",
    streak_milestone: "🔥",
    all_habits_completed: "✅",
  };

  function iconFor(entry) {
    if (entry.activity_type === "habit_completed") {
      return typeof pickHabitIcon === "function" ? pickHabitIcon(entry.habit_name || "") : "✅";
    }
    return TYPE_ICON[entry.activity_type] || "•";
  }

  function textFor(entry) {
    switch (entry.activity_type) {
      case "habit_completed":
        return `completed ${entry.habit_name}`;
      case "streak_milestone":
        return `reached a ${entry.streak_days}-day streak`;
      case "level_up":
        return `leveled up to Level ${entry.level}`;
      case "all_habits_completed":
        return "completed all habits today";
      default:
        return "";
    }
  }

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d`;
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function avatarNode(entry) {
    if (entry.avatar_url) {
      const img = document.createElement("img");
      img.className = "activity-row-avatar";
      img.src = entry.avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const span = document.createElement("span");
    span.className = "activity-row-avatar activity-avatar-fallback";
    span.textContent = (entry.display_name || entry.username || "?")[0].toUpperCase();
    return span;
  }

  function row(entry, index) {
    const el = document.createElement("div");
    el.className = "activity-row";
    el.style.animationDelay = `${Math.min(index, 8) * 0.04}s`;

    const icon = document.createElement("span");
    icon.className = "activity-row-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconFor(entry);

    const textWrap = document.createElement("div");
    textWrap.className = "activity-row-text";

    const line = document.createElement("p");
    line.className = "activity-row-line";
    const nameEl = document.createElement("strong");
    nameEl.textContent = entry.display_name || entry.username;
    line.appendChild(nameEl);
    line.appendChild(document.createTextNode(" " + textFor(entry)));

    const time = document.createElement("span");
    time.className = "activity-row-time";
    time.textContent = relativeTime(entry.created_at);

    textWrap.append(line, time);
    el.append(icon, avatarNode(entry), textWrap);
    return el;
  }

  async function load(reset) {
    if (reset) {
      offset = 0;
      listEl.innerHTML = "";
    }

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    loadMoreBtn.hidden = true;

    const entries = await ActivityService.fetchFriendsFeed(PAGE_SIZE, offset);
    loadingEl.hidden = true;

    if (entries.length === 0 && offset === 0) {
      emptyEl.hidden = false;
      return;
    }

    entries.forEach((entry, i) => listEl.appendChild(row(entry, i)));
    offset += entries.length;
    loadMoreBtn.hidden = entries.length < PAGE_SIZE;
  }

  loadMoreBtn.addEventListener("click", () => load(false));

  document.addEventListener("social-segment:shown", (e) => {
    if (e.detail.segment === "activity") load(true);
  });
})();
