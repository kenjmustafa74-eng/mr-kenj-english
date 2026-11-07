# Level locks

One set of level locks applies to every student. There is no separate setting per class or per student. Levels A, B and C can be locked or opened on their own. Locking a level does not delete saved words, scores or points. Passing a lesson does not open a locked level.

This page is a public web app. A lock closes that level inside the app. It does not stop someone from reading `index.html`, so it is not a copy-protection system.

## What this copy does today

Progress is still saved in the browser on each device (`kenj-prog` in local storage). Homework hand-in, the class list and “Ask Mr. Kenj” still need the hosted class tools. On GitHub Pages those hosted tools are inactive, which matches the note in the README.

Level locks are separate from those hosted tools. They need a shared store that students can read and only a signed-in teacher can write. Nothing in this repository is already connected to such a store. Until the owner finishes the setup below, the app stays usable and says so. It does not show lock switches, because a switch stored only in this browser would not change anyone else’s device.

The app is **code-ready** for that store. It is **not live-ready** until the owner creates the project, deploys the rules, adds the config file and signs in. Do not treat a successful page load as proof that locks are shared.

Firebase’s free Spark plan is an optional way to host the single settings document. It is not a requirement, and this repository does not contain a Firebase project or any credentials.

## Defaults

| Situation | What students get |
| --- | --- |
| No settings file, or `enabled` is false, or the file still has placeholders | Every level is open on that device. A banner says the locks are not connected. This is not a class-wide unlock. |
| Settings are connected and the teacher has never saved | Every level is open. That open state is the shared default, not a private bypass. |
| Teacher locks a level | That level is closed for every student. The others stay as they were. |
| This device has received locks before | Those locks are kept, including while offline or after a failed refresh. A known lock is not cleared by an error. |
| Connected, but this device has never received a document, and the read fails | Lessons stay available on this device until the first successful check. A banner explains that. The class document is not changed. |
| Page is still loading the settings file | Level screens stay closed for that short wait, so a slow connection cannot skip a lock. |

Factory default for a new document: A open, B open, C open (`locks` values `false`). The owner can lock any combination after signing in. There is no per-student override.

## How a lock is enforced

Students and the teacher read one document, `settings/levelAccess`:

```json
{
  "locks": { "A": false, "B": true, "C": false },
  "updatedAt": 0,
  "updatedBy": "teacher@school.example"
}
```

`true` means locked. The app blocks a locked level at each of these places:

- the level switch on Lessons and Practice
- Continue, lesson cards, and the word of the day
- lesson practice and level practice, including Play again
- review, which drops words from locked levels
- homework “Open lesson”
- the address hash, including `#learn/B3`, `#B3`, `#level/B`, `#learn/B` and `#practice/B`

While a level is locked the screen names the level and says that saved progress is kept. It does not show that level’s word list. If a game is already open and the level becomes locked, the game closes without writing a new pass mark. Answers already stored remain stored.

An older snapshot cannot replace a newer one. A cached snapshot from the database cannot unlock a level this device already knows is locked. The next snapshot that comes from the server, not from its cache, is the authority and may open a level again.

## Loading, failure, offline and stale behaviour

- The last good document is stored on the device under `kenj-level-access` so a refresh does not flash every level open.
- If a later read fails, locks already seen stay in force. The banner says the device is showing the last settings it received.
- The app does not replace a known lock with “everything open” because a request failed.
- If this device was connected before (`kenj-level-access-on`) and the settings file fails to load, known locks still apply. Teacher sign-in waits until the file loads, so an offline page cannot invent a save.
- Turning the feature off properly means loading a settings file with `enabled: false` (or placeholders). That clears the on-device copy of the locks. Removing the file while offline does not clear locks already seen.
- A student can edit local storage or the page on their own device. The shared document does not change, and the next successful read puts the teacher’s settings back. That limit is why the public page is not a lock on the file itself.

## What students cannot do

Students do not need an account to study or to read the locks. The security rules allow anyone to read `settings/levelAccess` and allow create or update only for the listed teacher email, and only when the document has boolean locks for A, B and C. Delete is refused. Every other path in a project that uses this rules file is refused.

The page also refuses to build a write unless the signed-in email is on the teacher list. The rules are the real control. A student signed in with another email cannot change the class setting.

## Owner setup

Do this in the owner’s own Firebase project. Do not reuse another app’s config. No project is created by the app.

1. Create a Firebase project and stay on the free Spark plan unless you choose otherwise.
2. Add a web app and copy its config. You will need the api key, auth domain, project id and app id.
3. In Authentication, turn on Email/Password and create the teacher user. Put that email, in lower case, in both places below.
4. Create a Cloud Firestore database.
5. In `firestore.rules`, replace `replace-with-teacher@example.com` with that email. Add further quoted emails inside the same list if more than one teacher should edit the same global settings.
6. From this directory, after installing the Firebase CLI and logging in yourself, deploy only the rules:

   ```bash
   firebase deploy --only firestore:rules
   ```

   `firebase.json` points at `firestore.rules`. There is no `.firebaserc` in this repository. The CLI will ask you to choose the project, or you can add `.firebaserc` locally (it is gitignored).
7. Copy `level-access.config.example.js` to `level-access.config.js`. Set `enabled` to `true`, paste the web config, and set `teacherEmails` to the same lower-case address. Do not commit `level-access.config.js`. Do not put a password or a service-account file in it.
8. Publish the site, including `level-access.js` and `level-access.config.js`, to GitHub Pages (or open it over http on your machine). The config file has to be served beside `index.html`.
9. Open the Teacher tab, sign in, and lock or open each level. Other open devices should follow the change. Students do not sign in.

If the rules and the email list disagree, the save is refused and the previous locks stay as they are.

## Checks

```bash
npm install
npm test
npm run test:browser
```

`npm test` checks the lock rules in `level-access.js` and the shape of `firestore.rules`. The browser script opens the real page in Chrome and walks the lesson, practice, deep-link and teacher screens. The browser script uses a localhost-only test hook so it can run without a Firebase project. That hook is not active on GitHub Pages, and it does not create a shared store.

## Code-ready and live-ready

| | Code-ready in this repository | Live for the class |
| --- | --- | --- |
| Lock and open screens, deep links, saved progress | Yes | Only after a real document is being read |
| Teacher sign-in and shared updates | The code is wired | No, until the steps above are done |
| Security rules | Written and checked as text | Not deployed from here |
| GitHub Pages build | Static files, including the new script | Still has no store until the config file is published by the owner |
