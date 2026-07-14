// Habit Tracker - Screen navigation
//
// Switches between full-screen views (Home / Habits / Insights / Settings)
// like a native app's tab bar - no scrolling, one screen visible at a time.
// Pure UI: no data logic. Every screen's content is unchanged, just reused
// under a different parent container.

(function () {
  const nav = document.getElementById("bottomNav");
  if (!nav) return;

  const tabs = Array.from(nav.querySelectorAll(".nav-tab"));
  const pill = document.getElementById("navPill");
  const screens = Array.from(document.querySelectorAll(".screen"));

  function movePillTo(tab) {
    if (!pill || !tab) return;
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
  }

  function showScreen(name) {
    let activeScreen = null;
    screens.forEach((screen) => {
      const isActive = screen.id === `screen-${name}`;
      screen.classList.toggle("active", isActive);
      if (isActive) activeScreen = screen;
    });

    const tab = tabs.find((t) => t.dataset.screen === name);
    if (tab) {
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle("active", isActive);
        if (isActive) t.setAttribute("aria-current", "page");
        else t.removeAttribute("aria-current");
      });
      movePillTo(tab);
    }

    // Moves focus to the new screen so screen reader users get an audible
    // cue that the content changed - sighted keyboard users already see it.
    // tabindex="-1" keeps it out of the normal Tab order otherwise.
    if (activeScreen) activeScreen.focus({ preventScroll: true });

    document.dispatchEvent(new CustomEvent("screen:shown", { detail: { screen: name } }));
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showScreen(tab.dataset.screen));
  });

  document.querySelectorAll("[data-screen-link]").forEach((el) => {
    el.addEventListener("click", () => {
      showScreen(el.dataset.screenLink);
      const focusId = el.dataset.focus;
      if (focusId) {
        const focusEl = document.getElementById(focusId);
        if (focusEl) setTimeout(() => focusEl.focus(), 50);
      }
    });
  });

  window.addEventListener("resize", () => {
    const active = tabs.find((t) => t.classList.contains("active"));
    if (active) movePillTo(active);
  });

  const initialTab = tabs.find((t) => t.classList.contains("active")) || tabs[0];
  if (initialTab) movePillTo(initialTab);
})();
