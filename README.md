# Your English Study Guide with Mr. Kenj

A General English study app for students: flashcards, word games, pronunciation practice and progress tracking, built on the Level A, B and C course material.

## Use it
Open the GitHub Pages link for this repository in any browser. On a phone, choose **Add to Home Screen** (Safari) or **Install app** (Chrome) to use it like a regular app — it also works offline after the first visit.

## Publishing (GitHub Pages)
Pushes to `main` run `.github/workflows/pages.yml`. That workflow copies only the study app (the page, its scripts, the web-app manifest, the service worker and the icons) and publishes that folder with GitHub’s Pages actions. It does not upload tests, dependencies or the lock file.

GitHub still requires a repository admin to turn Pages on once: **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow cannot grant that setting by itself. After the first successful run, the public address is shown on that same settings page.

## Notes
- Each student's progress is saved in their own browser on their own device.
- Students see notes and homework on the Homework tab. Handing work back in, class progress and "Ask Mr. Kenj" sentence checks still rely on the Claude-hosted version of the app.
- The Teacher tab has a control panel for each student (approve, own level locks, display name) and an **Upload notes or homework** button for the whole class or one student. See `docs/student-access.md`.
- Class level locks are one setting for every student; a student can also have their own locks. The app reads them from the General English Firebase project. `tchmk9@gmail.com` can change them after that address is confirmed. Until the teacher saves a lock, every level stays open. See `docs/level-access.md`. A lock closes a level inside the app; this public page is not a copy-protection system.

## Files
- `index.html` — the whole app
- `level-access.js` — shared rules for level locks
- `level-access.config.js` — public Firebase web settings for level locks
- `manifest.json`, `icon*.png`, `icon.svg` — home-screen install
- `sw.js` — offline support
