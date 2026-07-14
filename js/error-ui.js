// Habit Tracker - Reusable error/status UI
//
// Three small primitives, all created dynamically (no HTML changes needed):
//   - showBanner/hideBanner: persistent strip at the top, for an ongoing
//     condition (offline). Auto-wired to the online/offline events below.
//   - showToast: transient, self-dismissing note for a one-off failure.
//     De-duped per message text so a retry loop can never spam the user.
//   - showInlineError/clearInlineError: fills a specific card (e.g. a
//     broken chart) with a calm fallback instead of leaving it blank.
//
// Every caller passes its own short, friendly copy - this module never
// surfaces error.message or a stack trace itself, and callers must not
// pass one in either.

window.ErrorUI = (function () {
  const TOAST_DURATION_MS = 4500;
  const TOAST_COOLDOWN_MS = 15000;

  let bannerEl = null;
  let toastHost = null;
  const recentToasts = new Map();

  function ensureBanner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement("div");
    bannerEl.className = "error-banner";
    bannerEl.setAttribute("role", "status");
    bannerEl.setAttribute("aria-live", "polite");
    document.body.appendChild(bannerEl);
    return bannerEl;
  }

  function ensureToastHost() {
    if (toastHost) return toastHost;
    toastHost = document.createElement("div");
    toastHost.className = "error-toast-host";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
    return toastHost;
  }

  function showBanner(message) {
    const el = ensureBanner();
    el.textContent = message;
    requestAnimationFrame(() => el.classList.add("visible"));
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove("visible");
  }

  function dismissToast(toast) {
    if (!toast.isConnected) return;
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 350);
  }

  function showToast(message, icon) {
    const now = Date.now();
    const last = recentToasts.get(message);
    if (last && now - last < TOAST_COOLDOWN_MS) return;
    recentToasts.set(message, now);

    const host = ensureToastHost();
    const toast = document.createElement("div");
    toast.className = "error-toast";
    toast.innerHTML = `<span class="error-toast-icon">${icon || "☁️"}</span><span>${message}</span>`;
    toast.addEventListener("click", () => dismissToast(toast));
    host.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => dismissToast(toast), TOAST_DURATION_MS);
  }

  function showInlineError(container, message, icon) {
    if (!container) return;
    let el = container.querySelector(".inline-error");
    if (!el) {
      el = document.createElement("div");
      el.className = "inline-error";
      container.appendChild(el);
    }
    el.innerHTML = `<span class="inline-error-icon">${icon || "⚠️"}</span><span>${message}</span>`;
  }

  function clearInlineError(container) {
    if (!container) return;
    const el = container.querySelector(".inline-error");
    if (el) el.remove();
  }

  function updateOnlineState() {
    if (!navigator.onLine) {
      showBanner("You're offline. Changes will sync when you're back online.");
    } else {
      hideBanner();
    }
  }

  window.addEventListener("online", updateOnlineState);
  window.addEventListener("offline", updateOnlineState);
  document.addEventListener("DOMContentLoaded", updateOnlineState);

  return { showBanner, hideBanner, showToast, showInlineError, clearInlineError };
})();
