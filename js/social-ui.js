// Habit Tracker - Social screen segmented control
//
// Pure UI state: shows/hides the three panels (Discover/Activity/
// Leaderboard) and slides the pill indicator, same sliding-pill mechanic
// bottom-nav.js already uses for the main tabs. Dispatches
// "social-segment:shown" on every switch (and once on load for the default
// segment) so discover-ui.js / activity-ui.js / leaderboard-ui.js each know
// when to (re)load their own panel's data - none of them have to guess
// whether they're currently visible.

(function () {
  const control = document.getElementById("socialSegmentedControl");
  if (!control) return;

  const pill = document.getElementById("socialSegmentPill");
  const buttons = Array.from(control.querySelectorAll(".segmented-btn"));
  const panels = {
    discover: document.getElementById("socialDiscoverPanel"),
    activity: document.getElementById("socialActivityPanel"),
    leaderboard: document.getElementById("socialLeaderboardPanel"),
  };

  function movePill(btn) {
    if (!pill || !btn) return;
    pill.style.width = `${btn.offsetWidth}px`;
    pill.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  function showSegment(segment) {
    Object.keys(panels).forEach((key) => {
      if (panels[key]) panels[key].hidden = key !== segment;
    });

    buttons.forEach((btn) => {
      const isActive = btn.dataset.segment === segment;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) movePill(btn);
    });

    document.dispatchEvent(new CustomEvent("social-segment:shown", { detail: { segment } }));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => showSegment(btn.dataset.segment));
  });

  window.addEventListener("resize", () => {
    const active = buttons.find((b) => b.classList.contains("active"));
    if (active) movePill(active);
  });

  // Returning to the Social tab via the bottom nav (not the segmented
  // control itself) should still refresh whichever segment is already
  // active - activity/leaderboard data can go stale while the user was
  // elsewhere in the app.
  document.addEventListener("screen:shown", (e) => {
    if (e.detail.screen !== "social") return;
    const active = buttons.find((b) => b.classList.contains("active"));
    if (!active) return;
    movePill(active);
    document.dispatchEvent(new CustomEvent("social-segment:shown", { detail: { segment: active.dataset.segment } }));
  });

  const initial = buttons.find((b) => b.classList.contains("active")) || buttons[0];
  if (initial) {
    movePill(initial);
    document.dispatchEvent(new CustomEvent("social-segment:shown", { detail: { segment: initial.dataset.segment } }));
  }
})();
