# Habit Tracker

Simple, premium-feel PWA habit tracker. HTML + CSS + Vanilla JS + LocalStorage.

## Run locally

PWA features (service worker, install) need `http://`, not `file://`.

**Option A — VS Code Live Server**
1. Install the "Live Server" extension.
2. Right-click `index.html` → "Open with Live Server".

**Option B — Python**
```bash
cd habit-tracker
python3 -m http.server 8080
```
Then open `http://localhost:8080`.

## Features
- Add / rename / delete habits
- Daily check-in with streak counter
- 7-day history grid per habit
- Dark mode (system-aware + manual toggle)
- Installable PWA with offline support
- Data persisted in LocalStorage

## Notes
- Bump `CACHE_NAME` in `sw.js` after changing cached files so installed PWAs pick up updates.
