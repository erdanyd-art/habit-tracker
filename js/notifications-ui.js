// Habit Tracker - Notifications screen + bell badge
//
// Purely presentational: renders whatever NotificationService.fetchNotifications()
// returns, and keeps the global bell badge (see index.html - a fixed
// element outside any single screen) refreshed. Marks everything read the
// moment the Notifications screen is shown - standard "read on view",
// which is also what clears the badge.

(function () {
  const listEl = document.getElementById("notificationsList");
  const loadingEl = document.getElementById("notificationsLoading");
  const emptyEl = document.getElementById("notificationsEmpty");
  const bellBadge = document.getElementById("notificationBellBadge");

  if (!listEl || typeof NotificationService === "undefined") return;

  function messageFor(entry) {
    const actor = entry.actor_display_name || entry.actor_username || "Someone";

    if (entry.notification_type === "nudge") {
      if (entry.motivation_type === "streak_risk") {
        return `${actor} nudged you to keep your ${entry.streak_days}-day streak alive.`;
      }
      if (entry.motivation_type === "almost_done") return `${actor} nudged you — only one habit left. Finish strong!`;
      if (entry.motivation_type === "just_start") return `${actor} believes today is a great day to start.`;
      return `${actor} sent you a nudge.`;
    }

    if (entry.notification_type === "friend_accepted") {
      return `${actor} accepted your friend request.`;
    }

    if (entry.notification_type === "leaderboard_top3") {
      return `You entered the Top ${entry.rank || 3} this week.`;
    }

    return "";
  }

  function iconFor(entry) {
    if (entry.notification_type === "nudge") return entry.motivation_type === "streak_risk" ? "🔥" : "👋";
    if (entry.notification_type === "friend_accepted") return "🎉";
    if (entry.notification_type === "leaderboard_top3") return "🏆";
    return "🔔";
  }

  function avatarNode(entry) {
    if (entry.actor_avatar_url) {
      const img = document.createElement("img");
      img.className = "notification-avatar";
      img.src = entry.actor_avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const span = document.createElement("span");
    span.className = "notification-avatar notification-avatar-fallback";
    span.textContent = iconFor(entry);
    return span;
  }

  function row(entry, index) {
    const el = document.createElement("div");
    el.className = `notification-row${entry.read_at ? "" : " is-unread"}`;
    el.style.animationDelay = `${Math.min(index, 8) * 0.04}s`;

    const textWrap = document.createElement("div");
    textWrap.className = "notification-text";

    const line = document.createElement("p");
    line.className = "notification-line";
    line.textContent = messageFor(entry);

    const time = document.createElement("span");
    time.className = "notification-time";
    time.textContent = formatRelativeTime(entry.created_at);

    textWrap.append(line, time);

    const dot = document.createElement("span");
    dot.className = "notification-unread-dot";
    dot.setAttribute("aria-hidden", "true");

    el.append(avatarNode(entry), textWrap, dot);
    return el;
  }

  async function refreshBadge() {
    if (!bellBadge) return;
    const count = await NotificationService.getUnreadCount();
    if (count > 0) {
      bellBadge.textContent = count > 9 ? "9+" : String(count);
      bellBadge.hidden = false;
    } else {
      bellBadge.hidden = true;
    }
  }

  async function load() {
    loadingEl.hidden = false;
    emptyEl.hidden = true;
    listEl.innerHTML = "";

    const entries = await NotificationService.fetchNotifications(30);
    loadingEl.hidden = true;

    if (entries.length === 0) {
      emptyEl.hidden = false;
    } else {
      entries.forEach((entry, i) => listEl.appendChild(row(entry, i)));
    }

    await NotificationService.markAllRead();
    refreshBadge();
  }

  document.addEventListener("screen:shown", (e) => {
    if (e.detail.screen === "notifications") {
      load();
      return;
    }
    refreshBadge();
  });

  document.addEventListener("auth:changed", refreshBadge);

  refreshBadge();
})();
