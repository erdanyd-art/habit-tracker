// Habit Tracker - XP/Level UI
//
// Renders the Settings level progress bar and the level-up modal. Knows
// nothing about Supabase - reacts only to the "xp:updated" event dispatched
// by xp-sync.js, and does all math via Progression (progression.js).

(function () {
  const LAST_LEVEL_KEY = "xp_last_known_level";

  const levelValueEl = document.getElementById("levelValue");
  const levelBarFill = document.getElementById("levelBarFill");
  const levelXPLabel = document.getElementById("levelXPLabel");
  const levelCardEl = document.querySelector(".level-card");

  const overlay = document.getElementById("levelUpOverlay");
  const confettiHost = document.getElementById("levelUpConfetti");
  const fromLevelEl = document.getElementById("levelUpFrom");
  const toLevelEl = document.getElementById("levelUpTo");
  const continueBtn = document.getElementById("levelUpContinueBtn");

  if (!levelValueEl || typeof Progression === "undefined") return;

  const appEl = document.querySelector(".app");
  const navEl = document.getElementById("bottomNav");
  let previouslyFocused = null;

  const CONFETTI_COLORS = ["#0071e3", "#34c759", "#ff9500", "#af52de"];

  function getLastKnownLevel() {
    const raw = localStorage.getItem(LAST_LEVEL_KEY);
    return raw ? parseInt(raw, 10) : null;
  }

  function setLastKnownLevel(level) {
    localStorage.setItem(LAST_LEVEL_KEY, String(level));
  }

  function spawnConfetti() {
    if (!confettiHost) return;
    confettiHost.innerHTML = "";

    for (let i = 0; i < 18; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiHost.appendChild(piece);
    }

    setTimeout(() => {
      confettiHost.innerHTML = "";
    }, 1800);
  }

  function showLevelUpModal(fromLevel, toLevel) {
    if (!overlay) return;
    fromLevelEl.textContent = String(fromLevel);
    toLevelEl.textContent = String(toLevel);

    previouslyFocused = document.activeElement;
    if (appEl) appEl.inert = true;
    if (navEl) navEl.inert = true;

    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("open"));
    spawnConfetti();
    if (continueBtn) continueBtn.focus();
  }

  function closeLevelUpModal() {
    if (!overlay) return;
    overlay.classList.remove("open");
    setTimeout(() => {
      overlay.hidden = true;
    }, 250);

    if (appEl) appEl.inert = false;
    if (navEl) navEl.inert = false;

    if (previouslyFocused && document.contains(previouslyFocused) && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  }

  function getFocusableInModal() {
    const modal = overlay.querySelector(".level-up-modal");
    if (!modal) return [];
    return Array.from(
      modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  if (continueBtn) continueBtn.addEventListener("click", closeLevelUpModal);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeLevelUpModal();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeLevelUpModal();
        return;
      }
      if (e.key !== "Tab") return;

      // inert already keeps focus from reaching the background, but with
      // only one focusable control inside the modal, an un-cycled Tab would
      // otherwise land on <body> - which is outside the overlay, so this
      // same listener would stop receiving Escape too. Wrapping keeps focus
      // (and Escape) inside the trap regardless of how many controls it has.
      const focusable = getFocusableInModal();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function renderProgressBar(progress) {
    levelValueEl.textContent = `Level ${progress.level}`;
    if (levelBarFill) levelBarFill.style.width = `${progress.progressPct}%`;
    if (levelXPLabel) {
      levelXPLabel.textContent = `${progress.currentLevelXP} / ${progress.xpForNextLevel} XP`;
    }
  }

  function handleXPUpdate(event) {
    if (levelCardEl) levelCardEl.classList.remove("is-syncing");

    const totalXP = event.detail.totalXP;
    const progress = Progression.getLevelProgress(totalXP);
    renderProgressBar(progress);

    const lastKnownLevel = getLastKnownLevel();
    if (lastKnownLevel === null) {
      // First time we've ever observed a level for this browser - record it
      // without celebrating, so a page reload doesn't trigger a false
      // "level up" for progress the user already had.
      setLastKnownLevel(progress.level);
      return;
    }

    if (progress.level > lastKnownLevel) {
      showLevelUpModal(lastKnownLevel, progress.level);
      setLastKnownLevel(progress.level);
    } else if (progress.level < lastKnownLevel) {
      // Total XP can only grow in this system, but stay defensive in case
      // of a guest/account switch producing a lower total.
      setLastKnownLevel(progress.level);
    }
  }

  document.addEventListener("xp:updated", handleXPUpdate);

  document.addEventListener("xp:syncing", () => {
    if (levelCardEl) levelCardEl.classList.add("is-syncing");
  });

  document.addEventListener("xp:sync-failed", () => {
    if (levelCardEl) levelCardEl.classList.remove("is-syncing");
  });
})();
