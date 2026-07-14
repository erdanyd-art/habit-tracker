// Habit Tracker - Initial loading skeleton
//
// Covers exactly one gap: a returning signed-in user whose local cache is
// empty (new device, cleared storage) briefly can't tell "you truly have
// zero habits" apart from "we haven't pulled your habits yet". Guests and
// anyone with cached data already have something honest to show instantly,
// so this deliberately does nothing for them - a fake loading state for an
// already-instant operation would be worse than no loading state at all.
//
// Self-clearing: renderHabits() already runs again once the real state is
// known (via pullAndMerge's own re-render, or resetLocalState() if the
// session turns out to be signed-out) - see cloud-sync.js. No new event
// plumbing needed for that. A timeout is still here as a safety net in
// case a request hangs and neither path ever fires.

(function () {
  const habitListEl = document.getElementById("habitList");
  if (!habitListEl) return;

  const hasStoredOwner = !!localStorage.getItem("habits_owner");
  let currentHabits = [];
  try {
    currentHabits = JSON.parse(localStorage.getItem("habits") || "[]");
  } catch (e) {
    currentHabits = [];
  }

  if (!hasStoredOwner || currentHabits.length > 0) return;

  const skeleton = document.createElement("div");
  skeleton.className = "habit-skeleton";
  skeleton.innerHTML = `
    <div class="habit-skeleton-card skeleton"></div>
    <div class="habit-skeleton-card skeleton"></div>
    <div class="habit-skeleton-card skeleton"></div>
  `;

  habitListEl.hidden = true;
  habitListEl.insertAdjacentElement("beforebegin", skeleton);

  function reveal() {
    if (!skeleton.isConnected) return;
    skeleton.remove();
    habitListEl.hidden = false;
  }

  document.addEventListener("habits:updated", reveal, { once: true });
  setTimeout(reveal, 5000);
})();
