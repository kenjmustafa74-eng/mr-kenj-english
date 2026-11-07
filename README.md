# Your English Study Guide with Mr. Kenj

A General English study app for students: flashcards, word games, pronunciation practice and progress tracking, built on the Level A, B and C course material.

## Use it
Open the GitHub Pages link for this repository in any browser. On a phone, choose **Add to Home Screen** (Safari) or **Install app** (Chrome) to use it like a regular app — it also works offline after the first visit.

## Publishing (GitHub Pages)
1. Push these files to the `main` branch.
2. In the repository go to **Settings → Pages**, set *Source* to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

## Notes
- Each student's progress is saved in their own browser on their own device.
- Class features (homework hand-in to the teacher, the class progress/teacher view, and "Ask Mr. Kenj" sentence checks) rely on the Claude-hosted version of the app and are hidden or inactive on GitHub Pages.
- Level locks are one setting for every student. The app reads them from the General English Firebase project. `tchmk9@gmail.com` can change them after that address is confirmed. Until the teacher saves a lock, every level stays open. See `docs/level-access.md`. A lock closes a level inside the app; this public page is not a copy-protection system.

## Files
- `index.html` — the whole app
- `level-access.js` — shared rules for level locks
- `level-access.config.js` — public Firebase web settings for level locks
- `manifest.json`, `icon*.png`, `icon.svg` — home-screen install
- `sw.js` — offline support
