// Habit Tracker - Profile screen UI
//
// Purely presentational + interaction wiring: renders the header, Journey
// Statistics, Achievements Summary, Habit Overview, and Account sections
// from data other modules already own (habits via app.js globals, XP via
// Progression/xp:updated, achievements via Achievements, the profile row
// via ProfileService). Edits go through ProfileService.updateProfile -
// nothing here talks to Supabase directly.

(function () {
  const avatarImg = document.getElementById("profileAvatar");
  const avatarFallback = document.getElementById("profileAvatarFallback");
  const nameEl = document.getElementById("profileName");
  const usernameEl = document.getElementById("profileUsername");
  const bioEl = document.getElementById("profileBio");
  const joinedEl = document.getElementById("profileJoined");
  const editBtn = document.getElementById("profileEditBtn");
  const signInBtn = document.getElementById("profileSignInBtn");

  const editPanel = document.getElementById("profileEditPanel");
  const editNameInput = document.getElementById("profileEditName");
  const editUsernameInput = document.getElementById("profileEditUsername");
  const editBioInput = document.getElementById("profileEditBio");
  const editError = document.getElementById("profileEditError");
  const editCancelBtn = document.getElementById("profileEditCancelBtn");
  const editSaveBtn = document.getElementById("profileEditSaveBtn");

  const statGrid = document.getElementById("profileStatGrid");
  const achievementsCard = document.getElementById("profileAchievementsCard");
  const overviewList = document.getElementById("profileOverviewList");
  const accountList = document.getElementById("profileAccountList");

  if (!nameEl || typeof ProfileStats === "undefined") return;

  const APP_VERSION = "1.0.0";
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  let latestTotalXP = 0;
  let latestProfile = null;

  function formatJoinDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `Joined ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function formatLastSync(iso) {
    if (!iso) return "Not yet synced";
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function renderHeader(profile) {
    const authed = typeof CloudSync !== "undefined" && CloudSync.isAuthed();
    const user = authed ? CloudSync.getCurrentUser() : null;

    if (!authed) {
      avatarImg.hidden = true;
      avatarFallback.hidden = false;
      avatarFallback.textContent = "🙂";
      nameEl.textContent = "Guest";
      usernameEl.hidden = true;
      bioEl.textContent = "Sign in to build your profile.";
      joinedEl.hidden = true;
      editBtn.hidden = true;
      signInBtn.hidden = false;
      return;
    }

    signInBtn.hidden = true;
    editBtn.hidden = false;

    const meta = user.user_metadata || {};
    const avatarUrl = (profile && profile.avatar_url) || meta.avatar_url;
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.hidden = false;
      avatarFallback.hidden = true;
    } else {
      avatarImg.hidden = true;
      avatarFallback.hidden = false;
      const initial = (profile && profile.display_name) || user.email || "?";
      avatarFallback.textContent = initial[0].toUpperCase();
    }

    const displayName = (profile && profile.display_name) || meta.full_name || meta.name || "You";
    nameEl.textContent = displayName;

    if (profile && profile.username) {
      usernameEl.textContent = `@${profile.username}`;
      usernameEl.hidden = false;
    } else {
      usernameEl.hidden = true;
    }

    bioEl.textContent = (profile && profile.bio) || "Building myself one day at a time.";

    const joinedIso = (profile && profile.joined_at) || user.created_at;
    if (joinedIso) {
      joinedEl.textContent = formatJoinDate(joinedIso);
      joinedEl.hidden = false;
    } else {
      joinedEl.hidden = true;
    }
  }

  function statCard(icon, value, label, index) {
    return `
      <div class="profile-stat-card" style="animation-delay:${index * 0.05}s">
        <span class="profile-stat-icon" aria-hidden="true">${icon}</span>
        <span class="profile-stat-value">${value}</span>
        <span class="profile-stat-label">${label}</span>
      </div>
    `;
  }

  function renderStats(stats) {
    statGrid.innerHTML = [
      statCard("🔥", stats.currentStreak, "Current Streak", 0),
      statCard("🏆", stats.longestStreak, "Longest Streak", 1),
      statCard("⭐", stats.level, "Current Level", 2),
      statCard("✨", stats.totalXP, "Total XP", 3),
      statCard("✅", stats.habitsCompleted, "Habits Completed", 4),
      statCard("📅", stats.totalActiveDays, "Total Active Days", 5),
    ].join("");
  }

  function renderAchievements(stats) {
    const latest = stats.latestAchievement;
    achievementsCard.innerHTML = `
      <div class="profile-achievements-row">
        <div class="profile-achievements-stat">
          <span class="profile-achievements-value">${stats.achievementsUnlocked}/${stats.achievementsTotal}</span>
          <span class="profile-achievements-label">Unlocked</span>
        </div>
        <div class="profile-achievements-stat">
          <span class="profile-achievements-value">${stats.achievementsPct}%</span>
          <span class="profile-achievements-label">Complete</span>
        </div>
      </div>
      <div class="profile-latest-achievement">
        <span class="profile-latest-icon" aria-hidden="true">${latest ? latest.icon : "🔒"}</span>
        <div class="profile-latest-text">
          <span class="profile-latest-label">Latest Achievement</span>
          <span class="profile-latest-title">${latest ? latest.title : "None yet"}</span>
        </div>
      </div>
      <button type="button" class="profile-view-all-btn" id="profileViewAllBtn">View All Achievements</button>
    `;

    // Re-created on every render, so wired here rather than relying on
    // bottom-nav.js's one-time [data-screen-link] scan - reuses the exact
    // same tab-click navigation path without duplicating it.
    const viewAllBtn = document.getElementById("profileViewAllBtn");
    if (viewAllBtn) {
      viewAllBtn.addEventListener("click", () => {
        const insightsTab = document.querySelector('.nav-tab[data-screen="insights"]');
        if (insightsTab) insightsTab.click();
      });
    }
  }

  function overviewRow(icon, label, value) {
    return `
      <div class="insight-row">
        <span class="insight-icon" aria-hidden="true">${icon}</span>
        <span class="insight-label">${label}</span>
        <span class="insight-value">${escapeHtml(String(value))}</span>
      </div>
    `;
  }

  function renderOverview(stats) {
    overviewList.innerHTML = [
      overviewRow("📋", "Current Habits", stats.currentHabitsCount),
      overviewRow("✅", "Completed Today", `${stats.completedTodayCount}/${stats.currentHabitsCount}`),
      overviewRow("📊", "Completion Rate", `${stats.completionRateTodayPct}%`),
      overviewRow("🥇", "Best Habit", stats.bestHabit || "—"),
      overviewRow("📉", "Needs Improvement", stats.needsImprovementHabit || "—"),
    ].join("");
  }

  function accountRow(label, value) {
    return `<div class="settings-row"><span class="settings-row-label">${label}</span><span class="profile-account-value">${escapeHtml(String(value))}</span></div>`;
  }

  function renderAccount(profile) {
    const authed = typeof CloudSync !== "undefined" && CloudSync.isAuthed();
    const user = authed ? CloudSync.getCurrentUser() : null;
    const authBtnEl = document.getElementById("authBtn");
    const syncing = authed && authBtnEl && authBtnEl.classList.contains("is-syncing");

    const meta = (user && user.user_metadata) || {};
    const googleAccount = authed ? (meta.full_name || meta.name || user.email || "Connected") : "Not connected";
    const email = authed ? (user.email || "—") : "—";
    const syncStatus = !authed ? "Signed out" : syncing ? "Syncing…" : navigator.onLine ? "Synced" : "Offline";
    const lastSync = authed && typeof CloudSync !== "undefined" ? formatLastSync(CloudSync.getLastSyncedAt()) : "—";

    accountList.innerHTML = [
      accountRow("Google Account", googleAccount),
      accountRow("Email", email),
      accountRow("Cloud Sync Status", syncStatus),
      accountRow("Last Sync", lastSync),
      accountRow("App Version", APP_VERSION),
    ].join("");
  }

  function render() {
    const habits = loadHabits();
    const stats = ProfileStats.compute(habits, latestTotalXP);
    renderHeader(latestProfile);
    renderStats(stats);
    renderAchievements(stats);
    renderOverview(stats);
    renderAccount(latestProfile);
  }

  // --- Edit Profile (display name, username, bio only) -----------------

  function openEditPanel() {
    editNameInput.value = (latestProfile && latestProfile.display_name) || nameEl.textContent;
    editUsernameInput.value = (latestProfile && latestProfile.username) || "";
    editBioInput.value = (latestProfile && latestProfile.bio) || "";
    editError.hidden = true;
    editPanel.hidden = false;
    requestAnimationFrame(() => editPanel.classList.add("open"));
    editNameInput.focus();
  }

  function closeEditPanel() {
    editPanel.classList.remove("open");
    setTimeout(() => {
      editPanel.hidden = true;
    }, 250);
  }

  function showEditError(message) {
    editError.textContent = message;
    editError.hidden = false;
  }

  async function saveEdit() {
    const displayName = editNameInput.value.trim();
    const username = editUsernameInput.value.trim().toLowerCase();
    const bio = editBioInput.value.trim();

    if (!displayName) {
      showEditError("Display name can't be empty.");
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      showEditError("Username must be 3-30 characters: lowercase letters, numbers, underscore.");
      return;
    }

    editSaveBtn.disabled = true;
    const result = await ProfileService.updateProfile({ display_name: displayName, username, bio });
    editSaveBtn.disabled = false;

    if (result.error) {
      showEditError(result.error);
      return;
    }

    closeEditPanel();
  }

  if (editBtn) editBtn.addEventListener("click", openEditPanel);
  if (editCancelBtn) editCancelBtn.addEventListener("click", closeEditPanel);
  if (editSaveBtn) editSaveBtn.addEventListener("click", saveEdit);
  if (signInBtn) {
    signInBtn.addEventListener("click", () => {
      const authBtnEl = document.getElementById("authBtn");
      if (authBtnEl) authBtnEl.click();
    });
  }

  document.addEventListener("habits:updated", render);
  document.addEventListener("auth:changed", render);
  document.addEventListener("sync:changed", () => renderAccount(latestProfile));

  document.addEventListener("xp:updated", (e) => {
    latestTotalXP = e.detail.totalXP;
    render();
  });

  document.addEventListener("profile:updated", (e) => {
    latestProfile = e.detail.profile;
    render();
  });

  render();
})();
