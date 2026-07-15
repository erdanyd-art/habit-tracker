// Habit Tracker - Cloud Sync module
//
// Handles Google sign-in via Supabase Auth, session persistence, and
// offline-first sync of habits between localStorage and Supabase.
//
// Design: the app is always usable offline/guest with localStorage only
// (unchanged behavior). Once a user is signed in, every local mutation is
// queued and pushed to Supabase; a pull-and-merge runs on sign-in and on
// reconnect so edits made offline catch up automatically.

const GOOGLE_ICON_SVG = `
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.1-17.7 10.7z"/>
  <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.3 0-9.6-3.3-11.3-8l-6.6 5.1C9.9 39.9 16.4 44 24 44z"/>
  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C39.8 37 44 31 44 24c0-1.3-.1-2.7-.4-3.5z"/>
</svg>`;

const CloudSync = (function () {
  const QUEUE_KEY = "habits_sync_queue";
  const OWNER_KEY = "habits_owner";
  const TABLE = "habits";

  let client = null;
  let currentUser = null;
  let flushing = false;
  let lastSyncedAt = null;

  function getClient() {
    if (client) return client;
    if (typeof window.supabase === "undefined" || !window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url) {
      return null;
    }
    if (window.SUPABASE_CONFIG.url === "YOUR_SUPABASE_URL") return null;
    client = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
    return client;
  }

  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  function enqueue(op) {
    const queue = loadQueue();
    queue.push(op);
    saveQueue(queue);
  }

  function toRow(habit) {
    return {
      id: habit.id,
      user_id: currentUser.id,
      name: habit.name,
      history: habit.history,
      created_at: habit.createdAt,
      updated_at: habit.updatedAt || new Date().toISOString(),
      difficulty: habit.difficulty || "medium",
    };
  }

  function fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      history: row.history || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      difficulty: row.difficulty || "medium",
    };
  }

  // Purely presentational: how many sync operations are in flight right
  // now, so the auth button can show a small "syncing" badge. A counter
  // rather than a boolean because pullAndMerge and flushQueue can overlap -
  // one finishing shouldn't hide the indicator while the other still runs.
  let activeSyncCount = 0;

  function updateSyncIndicator() {
    const authBtn = document.getElementById("authBtn");
    if (authBtn) authBtn.classList.toggle("is-syncing", activeSyncCount > 0);
    document.dispatchEvent(new CustomEvent("sync:changed", { detail: { syncing: activeSyncCount > 0 } }));
  }

  function beginSync() {
    activeSyncCount++;
    updateSyncIndicator();
  }

  function endSync() {
    activeSyncCount = Math.max(0, activeSyncCount - 1);
    updateSyncIndicator();
  }

  async function flushQueue() {
    const supa = getClient();
    if (!supa || !currentUser || !navigator.onLine || flushing) return;

    flushing = true;
    beginSync();
    let queue = loadQueue();

    try {
      while (queue.length > 0) {
        const op = queue[0];
        try {
          if (op.type === "upsert") {
            const { error } = await supa.from(TABLE).upsert(op.row);
            if (error) throw error;
          } else if (op.type === "delete") {
            const { error } = await supa.from(TABLE).delete().eq("id", op.id).eq("user_id", currentUser.id);
            if (error) throw error;
          }
          queue.shift();
          saveQueue(queue);
        } catch (err) {
          console.warn("Habit sync deferred (will retry later):", (err && err.message) || err);
          if (typeof ErrorUI !== "undefined" && navigator.onLine) {
            ErrorUI.showToast("Couldn't sync your habits. We'll keep trying.");
          }
          break;
        }
      }
      lastSyncedAt = new Date().toISOString();
    } finally {
      flushing = false;
      endSync();
    }
  }

  function queueUpsert(habit) {
    if (!getClient() || !currentUser) return;
    enqueue({ type: "upsert", row: toRow(habit) });
    flushQueue();
  }

  function queueDelete(id) {
    if (!getClient() || !currentUser) return;
    enqueue({ type: "delete", id });
    flushQueue();
  }

  async function pullAndMerge() {
    const supa = getClient();
    if (!supa || !currentUser) return;

    beginSync();
    try {
      const { data, error } = await supa.from(TABLE).select("*").eq("user_id", currentUser.id);
      if (error) {
        console.warn("Habit pull failed:", error.message);
        if (typeof ErrorUI !== "undefined" && navigator.onLine) {
          ErrorUI.showToast("Couldn't sync your habits. We'll keep trying.");
        }
        return;
      }

      const remoteHabits = (data || []).map(fromRow);
      const remoteById = new Map(remoteHabits.map((h) => [h.id, h]));
      const localById = new Map(habits.map((h) => [h.id, h]));
      const merged = [];

      remoteById.forEach((remote, id) => {
        const local = localById.get(id);
        if (!local) {
          merged.push(remote);
          return;
        }
        const localTime = new Date(local.updatedAt || 0).getTime();
        const remoteTime = new Date(remote.updatedAt || 0).getTime();
        merged.push(remoteTime >= localTime ? remote : local);
      });

      localById.forEach((local, id) => {
        if (!remoteById.has(id)) {
          merged.push(local);
          queueUpsert(local);
        }
      });

      habits = merged;
      saveHabits();
      renderHabits();
      lastSyncedAt = new Date().toISOString();
    } finally {
      endSync();
    }
  }

  function renderAuthUI() {
    const authBtn = document.getElementById("authBtn");
    if (!authBtn) return;

    if (currentUser) {
      const avatar = currentUser.user_metadata && currentUser.user_metadata.avatar_url;
      authBtn.setAttribute("aria-label", "Sign out");
      authBtn.title = `Signed in as ${currentUser.email || "Google account"} - click to sign out`;
      authBtn.innerHTML = avatar
        ? `<img src="${avatar}" alt="" class="auth-avatar" referrerpolicy="no-referrer" />`
        : `<span class="auth-avatar-fallback">${(currentUser.email || "?")[0].toUpperCase()}</span>`;
    } else {
      authBtn.setAttribute("aria-label", "Sign in with Google");
      authBtn.title = "Sign in with Google to sync your habits across devices";
      authBtn.innerHTML = GOOGLE_ICON_SVG;
    }
  }

  async function handleAuthClick() {
    const supa = getClient();
    if (!supa) {
      if (typeof ErrorUI !== "undefined") {
        ErrorUI.showToast("Cloud sync isn't set up yet. Your habits still save on this device.");
      }
      return;
    }

    if (currentUser) {
      const confirmed = window.confirm("Sign out? Your habits stay saved in your account and will reappear next time you sign in.");
      if (!confirmed) return;
      await supa.auth.signOut();
      return;
    }

    await supa.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  function resetLocalState() {
    habits = [];
    saveHabits();
    renderHabits();
    saveQueue([]);
  }

  function getStoredOwner() {
    return localStorage.getItem(OWNER_KEY);
  }

  function setStoredOwner(userId) {
    if (userId) {
      localStorage.setItem(OWNER_KEY, userId);
    } else {
      localStorage.removeItem(OWNER_KEY);
    }
  }

  async function handleUserChange(user) {
    const previousOwner = getStoredOwner();
    currentUser = user;
    renderAuthUI();
    document.dispatchEvent(new CustomEvent("auth:changed", { detail: { user } }));

    if (!user) {
      // Signed out: don't leave the previous account's habits sitting in
      // localStorage looking like guest data (esp. on a shared device).
      if (previousOwner) resetLocalState();
      setStoredOwner(null);
      return;
    }

    if (previousOwner && previousOwner !== user.id) {
      // Different Google account than whatever this browser had cached -
      // the cached habits belong to someone else, don't merge/upload them.
      resetLocalState();
    }

    setStoredOwner(user.id);
    await pullAndMerge();
    flushQueue();
  }

  async function init() {
    const supa = getClient();
    const authBtn = document.getElementById("authBtn");
    if (authBtn) authBtn.addEventListener("click", handleAuthClick);

    if (!supa) {
      renderAuthUI();
      return;
    }

    try {
      const { data } = await supa.auth.getSession();
      await handleUserChange(data.session ? data.session.user : null);
    } catch (err) {
      console.warn("Supabase session check failed:", (err && err.message) || err);
      if (typeof ErrorUI !== "undefined" && navigator.onLine) {
        ErrorUI.showToast("Cloud features are temporarily unavailable. Your habits are safe on this device.");
      }
      renderAuthUI();
    }

    supa.auth.onAuthStateChange((_event, session) => {
      handleUserChange(session ? session.user : null);
    });

    window.addEventListener("online", flushQueue);
  }

  return {
    init,
    queueUpsert,
    queueDelete,
    isAuthed: () => !!currentUser,
    getClient,
    getCurrentUser: () => currentUser,
    getLastSyncedAt: () => lastSyncedAt,
  };
})();

document.addEventListener("DOMContentLoaded", CloudSync.init);
