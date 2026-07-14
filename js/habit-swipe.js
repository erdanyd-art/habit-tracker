// Habit Tracker - Swipe gestures for habit cards
//
// Pure interaction layer: drags the existing card surface and, past a
// threshold, triggers the exact same controls a tap already triggers
// (the real .habit-checkbox / .edit-btn / .delete-btn elements app.js
// already wires up). No new business logic - swipes just end in a native
// click on an existing control.
//
// Re-binds via MutationObserver rather than the "habits:updated" event,
// because saveHabits() (which fires that event) runs before renderHabits()
// rebuilds the list DOM - binding on the event would attach to elements
// that get replaced a moment later.
//
// Keyboard access: Edit/Delete are real, always-tabbable buttons (never
// display:none), so Tab already reaches them - the only gap was that the
// tray sits visually behind the surface until swiped open, so a focused
// button could be invisible/aria-hidden. Focusing either button opens its
// card's tray the same way a swipe would, and closes it again once focus
// moves elsewhere - no separate keyboard-only code path to maintain.

(function () {
  const habitListEl = document.getElementById("habitList");
  if (!habitListEl) return;

  const OPEN_X = -120;
  const OPEN_THRESHOLD = -60;
  const COMPLETE_THRESHOLD = 70;
  const DRAG_MAX = 80;
  const TAP_SLOP = 8;

  let openCard = null;

  function setManageExposed(card, exposed) {
    const manage = card.querySelector(".habit-swipe-action-manage");
    if (manage) manage.setAttribute("aria-hidden", exposed ? "false" : "true");
  }

  function closeCard(card, immediate) {
    if (!card) return;
    const surface = card.querySelector(".habit-card-surface");
    if (!surface) return;
    surface.style.transition = immediate ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
    surface.style.transform = "translateX(0px)";
    card.dataset.swipeState = "closed";
    setManageExposed(card, false);
    if (openCard === card) openCard = null;
  }

  function openCardTray(card) {
    if (openCard && openCard !== card) closeCard(openCard);
    const surface = card.querySelector(".habit-card-surface");
    if (!surface) return;
    surface.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
    surface.style.transform = `translateX(${OPEN_X}px)`;
    card.dataset.swipeState = "open";
    setManageExposed(card, true);
    openCard = card;
  }

  function bindCard(card) {
    const surface = card.querySelector(".habit-card-surface");
    if (!surface || surface.dataset.swipeBound) return;
    surface.dataset.swipeBound = "true";

    const manage = card.querySelector(".habit-swipe-action-manage");
    if (manage && !manage.dataset.focusBound) {
      manage.dataset.focusBound = "true";
      manage.addEventListener("focusin", () => openCardTray(card));
      manage.addEventListener("focusout", (e) => {
        if (!manage.contains(e.relatedTarget)) closeCard(card);
      });
    }

    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let dragging = false;
    let pointerId = null;

    surface.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".habit-check")) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      baseX = card.dataset.swipeState === "open" ? OPEN_X : 0;
      dragging = false;
      surface.style.transition = "none";
    });

    surface.addEventListener("pointermove", (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (!dragging) {
        if (Math.abs(deltaX) < TAP_SLOP || Math.abs(deltaY) > Math.abs(deltaX)) return;
        dragging = true;
        surface.setPointerCapture(pointerId);
      }

      const next = Math.min(DRAG_MAX, Math.max(OPEN_X - 20, baseX + deltaX));
      surface.style.transform = `translateX(${next}px)`;
    });

    function finish(e) {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return;
      const wasDragging = dragging;
      pointerId = null;
      dragging = false;

      if (!wasDragging) {
        if (card.dataset.swipeState === "open") {
          closeCard(card);
        } else {
          openCardTray(card);
        }
        return;
      }

      const match = /translateX\(([-\d.]+)px\)/.exec(surface.style.transform);
      const currentX = match ? parseFloat(match[1]) : 0;

      if (currentX <= OPEN_THRESHOLD) {
        openCardTray(card);
      } else if (currentX >= COMPLETE_THRESHOLD && baseX === 0) {
        closeCard(card, true);
        const checkbox = card.querySelector(".habit-checkbox");
        if (checkbox) checkbox.click();
      } else {
        closeCard(card);
      }
    }

    surface.addEventListener("pointerup", finish);
    surface.addEventListener("pointercancel", finish);
  }

  function bindAll() {
    habitListEl.querySelectorAll(".habit-item").forEach(bindCard);
  }

  document.addEventListener("click", (e) => {
    if (!openCard) return;
    if (!openCard.contains(e.target)) closeCard(openCard);
  });

  const observer = new MutationObserver(() => {
    openCard = null;
    bindAll();
  });
  observer.observe(habitListEl, { childList: true });

  bindAll();
})();
