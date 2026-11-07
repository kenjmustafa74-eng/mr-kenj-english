# Level locks

One set of level locks applies to every student. There is no separate setting per class or per student. Levels A, B and C can be locked or opened on their own. Locking a level does not delete saved words, scores or points. Passing a lesson does not open a locked level.

This page is a public web app. A lock closes that level inside the app. It does not stop someone from reading `index.html`, so it is not a copy-protection system.

## What this copy does today

Progress is still saved in the browser on each device (`kenj-prog` in local storage). Homework hand-in, the class list and “Ask Mr. Kenj” still need the hosted class tools. On GitHub Pages those hosted tools are inactive, which matches the note in the README.

Level locks are separate from those hosted tools. They need a shared store that students can read and only a signed-in teacher can write.

The public web settings for the General English Firebase project `general-english-c7371` are in `level-access.config.js`, and `enabled` is **true**. Analytics is not used. The app reads `settings/levelAccess`. This repository does not create that document. Until the teacher saves one, every level stays open. The only writer is `tchmk9@gmail.com` after Firebase has verified that address. Any other account is denied.

Opening the page does not prove a teacher can write. That needs the verified teacher to sign in on the Teacher tab.

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

Students do not need an account to study or to read the locks. The security rules allow anyone to read `settings/levelAccess`. A create or update is allowed only when the signed-in email is `tchmk9@gmail.com`, Firebase has marked that email verified, the locks are booleans for A, B and C, and `updatedBy` is exactly that verified address. An unverified password account, even with the same address, cannot write. Delete is refused. Every other path is refused.

The page keeps the email and password sign-in. If that teacher is signed in but the address is not confirmed, the Teacher tab explains that and offers to send the confirmation message again. It does not show the lock switches until the address is confirmed.

## Owner setup still required

The web settings are already in `level-access.config.js`. Do not paste another app’s config over them. Nothing in this repository deploys rules, creates users, or turns on billing.

1. In Authentication for this project, turn on Email/Password and create the user `tchmk9@gmail.com`. Open the confirmation message Firebase sends and confirm the address before changing locks. The app can send that message again from the Teacher tab. No password is stored in this repository, and the user was not created from here. The rules now require `email_verified`. They are in this repository and have not been deployed from here.
2. Cloud Firestore for this project is already answering requests. Publish the verified-email rules in `firestore.rules` over the closed production rules. This repository does not deploy them.
3. The rules already allow a write only when the signed-in email is `tchmk9@gmail.com`. They deny every other account, deletes, and every other path. From this directory, after you log in to the Firebase CLI yourself, deploy only those rules to project `general-english-c7371`:

   ```bash
   firebase deploy --only firestore:rules
   ```

   `firebase.json` points at `firestore.rules`. There is no `.firebaserc` in this repository. Choose this project when the CLI asks, or add `.firebaserc` locally (it is gitignored).
4. In `level-access.config.js`, set `enabled` to `true`. The teacher address is already `tchmk9@gmail.com`. Do not put a password or a service-account file in it.
5. Publish the site. The config file has to be served beside `index.html`.
6. Open the Teacher tab, sign in, and lock or open each level. Other open devices should follow the change. Students do not sign in.

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
| Web settings for `general-english-c7371` | `enabled` is true | Students read the class document after this release is on the Pages site |
| Teacher sign-in and shared updates | Email and password, and only a verified `tchmk9@gmail.com` can write | The teacher still has to confirm the address and sign in |
| Security rules | Verified email, and `updatedBy` must match that address | Published to this project separately from this repository |
| GitHub Pages build | Static files, including the web settings | The public URL is the Pages site for this repository, after this release is published |
