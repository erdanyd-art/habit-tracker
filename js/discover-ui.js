// Habit Tracker - Discover screen (Sprint 2: User Discovery)
//
// Pure UI: reads/writes nothing directly, delegates all data access to
// UserSearchService / UserProfileService. Owns three states that never
// show at once - "browse" (Recently Viewed + Suggested, when the search
// box is empty), "searching" (debounced live results), and the shared
// loading/empty placeholders (mirrors public-profile.js's three-state
// loading/empty/content pattern).
//
// Search is debounced and deduped (skips refiring an unchanged query) to
// keep Supabase requests to a minimum, and stamps every request with a
// sequence number so a slow response for an old keystroke can never
// clobber a newer one on screen.

(function () {
  const searchInput = document.getElementById("discoverSearchInput");
  if (!searchInput) return;

  const resultsSection = document.getElementById("discoverResultsSection");
  const resultsList = document.getElementById("discoverResultsList");
  const recentSection = document.getElementById("discoverRecentSection");
  const recentList = document.getElementById("discoverRecentList");
  const suggestedSection = document.getElementById("discoverSuggestedSection");
  const suggestedList = document.getElementById("discoverSuggestedList");
  const emptyEl = document.getElementById("discoverEmpty");
  const emptyTextEl = document.getElementById("discoverEmptyText");
  const emptyEmojiEl = document.getElementById("discoverEmptyEmoji");
  const loadingEl = document.getElementById("discoverLoading");

  const DEBOUNCE_MS = 300;
  let debounceTimer = null;
  let requestSeq = 0;
  let lastQuery = null;
  let suggestionsLoaded = false;

  function avatarNode(profile) {
    if (profile.avatar_url) {
      const img = document.createElement("img");
      img.className = "discover-avatar";
      img.src = profile.avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const span = document.createElement("span");
    span.className = "discover-avatar discover-avatar-fallback";
    span.textContent = (profile.display_name || profile.username || "?")[0].toUpperCase();
    return span;
  }

  function resultCard(profile) {
    const level = Progression.getLevelProgress(profile.total_xp || 0).level;

    const card = document.createElement("a");
    card.className = "discover-result-card";
    card.href = UserProfileService.profileUrl(profile.username);
    card.appendChild(avatarNode(profile));

    const info = document.createElement("div");
    info.className = "discover-result-info";

    const nameEl = document.createElement("span");
    nameEl.className = "discover-result-name";
    nameEl.textContent = profile.display_name || profile.username;

    const usernameEl = document.createElement("span");
    usernameEl.className = "discover-result-username";
    usernameEl.textContent = `@${profile.username}`;

    info.append(nameEl, usernameEl);

    const meta = document.createElement("div");
    meta.className = "discover-result-meta";

    const levelEl = document.createElement("span");
    levelEl.className = "discover-result-badge";
    levelEl.textContent = `⭐ Lv ${level}`;

    const streakEl = document.createElement("span");
    streakEl.className = "discover-result-badge";
    streakEl.textContent = `🔥 ${profile.current_streak || 0}`;

    meta.append(levelEl, streakEl);
    card.append(info, meta);

    card.addEventListener("click", () => UserSearchService.addRecentlyViewed(profile));

    return card;
  }

  function renderList(container, profiles) {
    container.innerHTML = "";
    profiles.forEach((p, index) => {
      const card = resultCard(p);
      card.style.animationDelay = `${Math.min(index, 8) * 0.04}s`;
      container.appendChild(card);
    });
  }

  function showEmpty(message, emoji) {
    emptyTextEl.textContent = message;
    emptyEmojiEl.textContent = emoji;
    emptyEl.hidden = false;
  }

  function hideEmpty() {
    emptyEl.hidden = true;
  }

  function renderRecentlyViewed() {
    const recent = UserSearchService.getRecentlyViewed();
    recentSection.hidden = recent.length === 0;
    if (recent.length > 0) renderList(recentList, recent);
  }

  async function loadSuggestions() {
    loadingEl.hidden = false;
    suggestedSection.hidden = true;

    const { status, results } = await UserSearchService.getSuggestions("newest");

    loadingEl.hidden = true;

    if (status === "ok" && results.length > 0) {
      suggestedSection.hidden = false;
      renderList(suggestedList, results);
    }
  }

  function enterBrowseMode() {
    loadingEl.hidden = true;
    hideEmpty();
    resultsSection.hidden = true;
    resultsList.innerHTML = "";

    renderRecentlyViewed();

    if (!suggestionsLoaded) {
      suggestionsLoaded = true;
      loadSuggestions();
    } else {
      suggestedSection.hidden = suggestedList.children.length === 0;
    }
  }

  async function runSearch(query) {
    const seq = ++requestSeq;

    recentSection.hidden = true;
    suggestedSection.hidden = true;
    hideEmpty();

    if (!navigator.onLine) {
      loadingEl.hidden = true;
      resultsSection.hidden = true;
      showEmpty("Unable to search while offline.", "📡");
      return;
    }

    loadingEl.hidden = false;
    resultsSection.hidden = true;

    const { status, results } = await UserSearchService.search(query);

    if (seq !== requestSeq) return; // a newer keystroke's search already superseded this one

    loadingEl.hidden = true;

    if (status === "offline") {
      showEmpty("Unable to search while offline.", "📡");
      return;
    }

    if (results.length === 0) {
      showEmpty("No users found.", "🔍");
      return;
    }

    resultsSection.hidden = false;
    renderList(resultsList, results);
  }

  function handleInput() {
    const query = searchInput.value.trim();

    if (debounceTimer) clearTimeout(debounceTimer);

    if (query === "") {
      requestSeq++; // invalidate any in-flight search so it can't overwrite browse mode
      lastQuery = null;
      enterBrowseMode();
      return;
    }

    if (query === lastQuery) return; // unchanged query settled again - nothing new to fetch

    debounceTimer = setTimeout(() => {
      lastQuery = query;
      runSearch(query);
    }, DEBOUNCE_MS);
  }

  searchInput.addEventListener("input", handleInput);

  document.addEventListener("screen:shown", (e) => {
    if (e.detail.screen !== "discover") return;
    renderRecentlyViewed();
    if (searchInput.value.trim() === "" && !suggestionsLoaded) {
      suggestionsLoaded = true;
      loadSuggestions();
    }
  });

  renderRecentlyViewed();
})();
