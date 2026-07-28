// Habit Tracker - Public Profile page (js/public-profile.js)
//
// Standalone, unauthenticated page served at /u/:username (see vercel.json)
// via a rewrite - the browser URL stays /u/:username while Vercel serves
// public-profile.html, which is why the username is read from
// location.pathname here (with a ?u=/?username= query fallback for local
// testing, or in case a rewrite ever fails to apply).
//
// Talks to Supabase through exactly one RPC, get_public_profile() (see
// supabase/schema.sql) - that function is the only place raw completion
// history or xp_transactions rows are ever read; this page only ever
// receives already-derived numbers (streaks, booleans, counts) and never
// requests anything else directly from the habits/xp_transactions tables.

(function () {
  const loadingEl = document.getElementById("publicProfileLoading");
  const emptyEl = document.getElementById("publicProfileEmpty");
  const emptyEmojiEl = document.getElementById("ppEmptyEmoji");
  const emptyTextEl = document.getElementById("ppEmptyText");
  const contentEl = document.getElementById("publicProfileContent");

  const avatarImg = document.getElementById("ppAvatar");
  const avatarFallback = document.getElementById("ppAvatarFallback");
  const nameEl = document.getElementById("ppName");
  const usernameEl = document.getElementById("ppUsername");
  const bioEl = document.getElementById("ppBio");
  const joinedEl = document.getElementById("ppJoined");

  const friendSlot = document.getElementById("publicProfileFriendSlot");

  const statGrid = document.getElementById("ppStatGrid");
  const achievementsCard = document.getElementById("ppAchievementsCard");
  const ringProgress = document.getElementById("ppRingProgress");
  const ringPercent = document.getElementById("ppRingPercent");
  const progressLabel = document.getElementById("ppProgressLabel");
  const habitListEl = document.getElementById("ppHabitList");

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function resolveUsername() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get("u") || params.get("username");
    if (fromQuery) return fromQuery;

    const segments = location.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last || last.toLowerCase() === "public-profile.html") return null;
    return decodeURIComponent(last);
  }

  // Mirrors dateToStr()/todayString() in js/app.js - duplicated rather than
  // importing app.js, which is tightly coupled to the authenticated app's
  // own DOM and isn't meant to load on this standalone page.
  function localTodayString() {
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // Sprint 4 note: this used to create a brand-new supabase-js client on
  // every call. Now that this page also loads relationship-status-
  // service.js / friend-request-service.js / friend-service.js for the
  // dynamic friend button, all four share the one memoized client from
  // js/standalone-supabase-client.js instead of each spinning up its own -
  // multiple GoTrueClient instances on one page is a real footgun.
  function getClient() {
    return typeof getStandaloneSupabaseClient === "function" ? getStandaloneSupabaseClient() : null;
  }

  function showEmpty(message, emoji) {
    loadingEl.hidden = true;
    contentEl.hidden = true;
    emptyEl.hidden = false;
    emptyEmojiEl.textContent = emoji;
    emptyTextEl.textContent = message;
  }

  function formatJoinDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `Joined ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function renderHeader(profile) {
    if (profile.avatar_url) {
      avatarImg.src = profile.avatar_url;
      avatarImg.hidden = false;
      avatarFallback.hidden = true;
    } else {
      avatarImg.hidden = true;
      avatarFallback.hidden = false;
      const initial = profile.display_name || profile.username || "?";
      avatarFallback.textContent = initial[0].toUpperCase();
    }

    nameEl.textContent = profile.display_name || profile.username;
    usernameEl.textContent = `@${profile.username}`;

    if (profile.bio) {
      bioEl.textContent = profile.bio;
      bioEl.hidden = false;
    }

    if (profile.joined_at) {
      joinedEl.textContent = formatJoinDate(profile.joined_at);
      joinedEl.hidden = false;
    }

    document.title = `${profile.display_name || profile.username} (@${profile.username}) · Habit Tracker`;
  }

  function statCard(icon, value, label, index) {
    const card = document.createElement("div");
    card.className = "profile-stat-card";
    card.style.animationDelay = `${index * 0.05}s`;

    const iconEl = document.createElement("span");
    iconEl.className = "profile-stat-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;

    const valueEl = document.createElement("span");
    valueEl.className = "profile-stat-value";
    valueEl.textContent = String(value);

    const labelEl = document.createElement("span");
    labelEl.className = "profile-stat-label";
    labelEl.textContent = label;

    card.append(iconEl, valueEl, labelEl);
    return card;
  }

  function renderStats(profile) {
    const level = Progression.getLevelProgress(profile.total_xp).level;
    statGrid.innerHTML = "";
    statGrid.append(
      statCard("🔥", profile.current_streak, "Current Streak", 0),
      statCard("🏆", profile.longest_streak, "Longest Streak", 1),
      statCard("⭐", level, "Current Level", 2),
      statCard("✨", profile.total_xp, "Total XP", 3)
    );
  }

  function renderAchievements(profile) {
    const evaluated = Achievements.evaluateAggregates({
      habitsCount: profile.public_habit_count,
      longestOverall: profile.longest_streak,
      totalCompleted: profile.total_habits_completed,
    });
    const unlocked = evaluated.filter((a) => a.unlocked);
    const latest = unlocked.length ? unlocked[unlocked.length - 1] : null;
    const pct = evaluated.length ? Math.round((unlocked.length / evaluated.length) * 100) : 0;

    achievementsCard.innerHTML = "";

    const row = document.createElement("div");
    row.className = "profile-achievements-row";
    row.innerHTML = `
      <div class="profile-achievements-stat">
        <span class="profile-achievements-value">${unlocked.length}/${evaluated.length}</span>
        <span class="profile-achievements-label">Unlocked</span>
      </div>
      <div class="profile-achievements-stat">
        <span class="profile-achievements-value">${pct}%</span>
        <span class="profile-achievements-label">Complete</span>
      </div>
    `;

    const latestRow = document.createElement("div");
    latestRow.className = "profile-latest-achievement";
    const latestIcon = document.createElement("span");
    latestIcon.className = "profile-latest-icon";
    latestIcon.setAttribute("aria-hidden", "true");
    latestIcon.textContent = latest ? latest.icon : "🔒";
    const latestText = document.createElement("div");
    latestText.className = "profile-latest-text";
    latestText.innerHTML = `<span class="profile-latest-label">Latest Achievement</span>`;
    const latestTitle = document.createElement("span");
    latestTitle.className = "profile-latest-title";
    latestTitle.textContent = latest ? latest.title : "None yet";
    latestText.appendChild(latestTitle);
    latestRow.append(latestIcon, latestText);

    achievementsCard.append(row, latestRow);
  }

  function renderProgress(profile) {
    const total = profile.public_habit_count;
    const completed = profile.completed_today_count;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    ringProgress.style.setProperty("--progress", pct);
    ringPercent.textContent = `${pct}%`;
    progressLabel.textContent = `${completed} / ${total} Habits Completed`;
  }

  function habitRow(habit) {
    const row = document.createElement("div");
    row.className = "public-habit-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "public-habit-name";
    nameSpan.textContent = habit.name;

    const meta = document.createElement("span");
    meta.className = "public-habit-meta";

    const streak = document.createElement("span");
    streak.className = "public-habit-streak";
    streak.textContent = `🔥 ${habit.current_streak}`;

    const status = document.createElement("span");
    status.className = `public-habit-status ${habit.completed_today ? "is-done" : ""}`;
    status.textContent = habit.completed_today ? "✓" : "—";

    meta.append(streak, status);
    row.append(nameSpan, meta);
    return row;
  }

  function renderHabitList(habits) {
    habitListEl.innerHTML = "";
    if (!habits.length) {
      const empty = document.createElement("p");
      empty.className = "public-profile-habit-empty";
      empty.textContent = "No public habits yet.";
      habitListEl.appendChild(empty);
      return;
    }
    habits.forEach((h) => habitListEl.appendChild(habitRow(h)));
  }

  // --- Friend action button (Sprint 4) ----------------------------------
  //
  // Rendered into the #publicProfileFriendSlot extension point left empty
  // since Sprint 2/3. One button, label/behavior driven entirely by
  // RelationshipStatusService.getStatus() - see friend-request-service.js /
  // friend-service.js for the actual mutations.

  function setFriendButtonState(status, profileId) {
    if (!friendSlot) return;
    friendSlot.innerHTML = "";

    if (!status || ["self", "signed_out", "error"].includes(status.status)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pp-friend-btn";

    if (status.status === "none") {
      btn.textContent = "Add Friend";
      btn.classList.add("pp-friend-btn-add");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const result = await FriendRequestService.sendRequest(profileId);
        btn.disabled = false;
        setFriendButtonState(result, profileId);
      });
    } else if (status.status === "request_sent") {
      btn.textContent = "Request Sent";
      btn.classList.add("pp-friend-btn-pending");
      btn.addEventListener("click", async () => {
        if (!window.confirm("Cancel this friend request?")) return;
        btn.disabled = true;
        const result = await FriendRequestService.cancelRequest(status.request_id, profileId);
        btn.disabled = false;
        setFriendButtonState(result.status === "cancelled" ? { status: "none" } : result, profileId);
      });
    } else if (status.status === "request_received") {
      btn.textContent = "Accept Request";
      btn.classList.add("pp-friend-btn-accept");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const result = await FriendRequestService.respondToRequest(status.request_id, profileId, true);
        btn.disabled = false;
        setFriendButtonState(result, profileId);
      });
    } else if (status.status === "friends") {
      btn.textContent = "Friends";
      btn.classList.add("pp-friend-btn-friends");
      btn.addEventListener("click", async () => {
        if (!window.confirm("Remove this friend?")) return;
        btn.disabled = true;
        const result = await FriendService.removeFriend(profileId);
        btn.disabled = false;
        setFriendButtonState(result.status === "none" ? { status: "none" } : result, profileId);
      });
    } else {
      return;
    }

    friendSlot.appendChild(btn);
  }

  async function renderFriendButton(profile) {
    if (!friendSlot || typeof RelationshipStatusService === "undefined") return;

    const viewerId = await RelationshipStatusService.getCurrentUserId();
    if (!viewerId || viewerId === profile.id) return;

    const status = await RelationshipStatusService.getStatus(profile.id);
    setFriendButtonState(status, profile.id);
  }

  function renderProfile(profile) {
    renderHeader(profile);
    renderStats(profile);
    renderAchievements(profile);
    renderProgress(profile);
    renderHabitList(profile.habits || []);
    renderFriendButton(profile); // async, fire-and-forget - rest of the page shouldn't wait on it

    loadingEl.hidden = true;
    emptyEl.hidden = true;
    contentEl.hidden = false;
  }

  async function init() {
    const username = resolveUsername();
    if (!username) {
      showEmpty("User not found.", "🔍");
      return;
    }

    const supa = getClient();
    if (!supa) {
      showEmpty("This page isn't available right now.", "☁️");
      return;
    }

    const { data, error } = await supa.rpc("get_public_profile", {
      p_username: username,
      p_today: localTodayString(),
    });

    if (error || !data) {
      console.warn("get_public_profile failed:", error && error.message);
      showEmpty("This page isn't available right now.", "☁️");
      return;
    }

    if (data.status === "not_found") {
      showEmpty("User not found.", "🔍");
      return;
    }

    if (data.status === "private") {
      showEmpty("This profile is private.", "🔒");
      return;
    }

    renderProfile(data);
  }

  init();
})();
