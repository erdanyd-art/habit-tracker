// Habit Tracker - Weekly Leaderboard rendering
//
// Purely presentational: renders whatever LeaderboardService.fetchLeaderboard()
// returns (already ranked server-side by completion rate -> streak -> XP).
// Reloads every time the Leaderboard segment becomes visible, same as the
// Activity panel.

(function () {
  const listEl = document.getElementById("leaderboardList");
  const loadingEl = document.getElementById("leaderboardLoading");
  const emptyEl = document.getElementById("leaderboardEmpty");

  if (!listEl || typeof LeaderboardService === "undefined") return;

  const MEDALS = ["🥇", "🥈", "🥉"];

  function avatarNode(entry) {
    if (entry.avatar_url) {
      const img = document.createElement("img");
      img.className = "leaderboard-row-avatar";
      img.src = entry.avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const span = document.createElement("span");
    span.className = "leaderboard-row-avatar leaderboard-avatar-fallback";
    span.textContent = (entry.display_name || entry.username || "?")[0].toUpperCase();
    return span;
  }

  function row(entry, index) {
    const el = document.createElement("div");
    el.className = `leaderboard-row${entry.is_me ? " is-me" : ""}`;
    el.style.animationDelay = `${Math.min(index, 8) * 0.04}s`;

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = MEDALS[entry.rank - 1] || `#${entry.rank}`;

    const info = document.createElement("div");
    info.className = "leaderboard-info";
    const nameEl = document.createElement("span");
    nameEl.className = "leaderboard-name";
    nameEl.textContent = entry.display_name || entry.username;
    const usernameEl = document.createElement("span");
    usernameEl.className = "leaderboard-username";
    usernameEl.textContent = `@${entry.username}`;
    info.append(nameEl, usernameEl);

    const stats = document.createElement("div");
    stats.className = "leaderboard-stats";
    const pct = document.createElement("span");
    pct.className = "leaderboard-pct";
    pct.textContent = `${entry.completion_rate_pct}%`;
    const streak = document.createElement("span");
    streak.className = "leaderboard-streak";
    streak.textContent = `🔥 ${entry.current_streak}`;
    stats.append(pct, streak);

    el.append(rank, avatarNode(entry), info, stats);
    return el;
  }

  // Sprint 6: detected client-side, not server-side - there's no scheduled
  // job in this app that could notice "you're now top 3" on its own, so
  // this checks on every load and self-inserts a notification the moment
  // rank crosses into the top 3 (deduped via localStorage so re-opening
  // the tab while still in 1st/2nd/3rd doesn't re-notify).
  const TOP3_KEY = "leaderboard_last_known_rank";

  function checkTop3(entries) {
    const me = entries.find((e) => e.is_me);
    if (!me) return;

    const lastRank = parseInt(localStorage.getItem(TOP3_KEY) || "0", 10);
    if (me.rank <= 3 && lastRank > 3) {
      if (typeof NotificationService !== "undefined") {
        NotificationService.postSelfNotification({ notification_type: "leaderboard_top3", rank: me.rank });
      }
    }
    localStorage.setItem(TOP3_KEY, String(me.rank));
  }

  async function load() {
    loadingEl.hidden = false;
    emptyEl.hidden = true;
    listEl.innerHTML = "";

    const entries = await LeaderboardService.fetchLeaderboard();
    loadingEl.hidden = true;

    if (entries.length <= 1) {
      // Only "me" (or nothing) came back - no friends to rank against yet.
      emptyEl.hidden = false;
      return;
    }

    entries.forEach((entry, i) => listEl.appendChild(row(entry, i)));
    checkTop3(entries);
  }

  document.addEventListener("social-segment:shown", (e) => {
    if (e.detail.segment === "leaderboard") load();
  });
})();
