// Habit Tracker - Relative time formatting (pure, shared)
//
// Extracted out of activity-ui.js so notifications-ui.js can reuse the
// exact same "2m / 1h / Yesterday / 3d / 7/29" formatting instead of
// duplicating it.

window.formatRelativeTime = function (iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
