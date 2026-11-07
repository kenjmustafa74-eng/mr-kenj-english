# Student access

Only students the teacher approves can use the study screens. The teacher is `tchmk9@gmail.com` after that address is confirmed. Everyone else signs in and waits.

## What is checked on the server

These rules are in `firestore.rules`. They are **not deployed** by this change. Until they are published to `general-english-c7371`, the live database does not know about student approval.

- `accessRequests/{uid}` stores only the signed-in email and the time of the request. A verified student can create their own request once. They cannot add a status, edit it, or read anyone else's.
- `accessGrants/{uid}` stores `approved` or `revoked`. Only the verified teacher can write it, and `updatedBy` must be that teacher's address. A student can read only their own grant.
- Level locks stay in `settings/levelAccess`. Only the verified teacher can change them.

A removal is read by the student's open app and the lessons close. If this device already knows the account was removed, a failed reload or an offline visit does not open the lessons. A student who was approved and then goes offline can keep studying until the next successful check. A removal made during that gap applies when the app connects again.

## What this cannot hide

The lessons, words and games are inside the public page at GitHub Pages. Signing in hides those screens in the app. It does not stop someone downloading the page file, and it does not erase a copy already saved by an older install until that install is online and receives the new version. This is not confidential storage of the course text.

Progress on this device is kept separately for each signed-in account. Signing out does not delete it. The next account on the same device does not see it. The first approved account on a device that still has older unsigned progress receives that progress once, and the unsigned copy is then removed.

## Sign up

The signed-out gate and the teacher sign-in both offer **Sign in** and **Sign up**. Sign up calls Firebase Auth `createUserWithEmailAndPassword` (JavaScript SDK 10.14.1, project `general-english-c7371`) with the email and password from that form. The app does not keep the password. There is no separate student list and no extra teacher list: the allowlisted address is still only `tchmk9@gmail.com`, and only after that address is confirmed.

A new account is signed in with an unconfirmed email, so the lessons stay closed. Firebase is asked to send the usual confirmation email. Confirming it does not approve a student, restore a removed student, or change level locks. A confirmed student still waits for the teacher. A confirmed `tchmk9@gmail.com` account can approve students and change locks. Any other confirmed address cannot.

If the address is already registered, the form says so and points back to Sign in. An invalid email, a password shorter than 6 characters, a network failure, a rate limit, a turned-off email provider, and a website that Firebase has not allowed each get their own message. The button shows “Creating…” and ignores a second press.

**Forgot password?** stays on the Sign in form.

The public Auth settings for this project currently allow only `localhost`, `general-english-c7371.firebaseapp.com` and `general-english-c7371.web.app`. `kenjmustafa74-eng.github.io` is not on that list. Until it is added in Firebase Authentication settings, the live site cannot finish sign-up or sign-in. This repository does not change that setting.

## Forgotten password

**Forgot password?** sits on every sign-in form: the signed-out study gate, and the teacher sign-in shown when someone who can already study opens the teacher screen. It uses the email already typed in that form. The app calls Firebase Auth `sendPasswordResetEmail` (JavaScript SDK 10.14.1, project `general-english-c7371`) with that address only. It does not build its own reset page, and it does not keep the password or the reset code.

The success line is the same whether or not an account exists: “If an account exists for that email, a reset message has been sent. Check your inbox.” An empty or invalid address, a rate limit, and a network failure each say what went wrong without naming an account. The button shows “Sending…” and ignores a second press until the request finishes.

A reset message does not confirm the email address, approve a student, restore a removed student, or change the level locks. The person still signs in afterwards and passes the same checks.

## Deployment order

1. Publish this version of `firestore.rules` to `general-english-c7371`. Do not publish the app first if you want students to be checked against the new rules immediately. If the app is published first, unapproved people still cannot pass the sign-in screen, and the teacher can sign in.
2. Merge and publish the site. `enabled` stays true for this Firebase project.
3. The teacher confirms `tchmk9@gmail.com`, signs in, and approves or removes students. Approving a student is what creates their grant. This repository does not approve anyone.

## Student control panel

The Teacher tab lists every student who has signed up. **Open control panel** shows one student:

- approve or remove access;
- a display name that only the teacher sees (stored as `name` on the grant, up to 60 characters);
- their levels: **Same as class** or **Own settings** with Level A, B and C switches (see `docs/level-access.md`);
- notes and homework sent only to that student, with an **Upload notes or homework** button.

## Notes and homework

The teacher uploads from the Teacher tab (for the whole class) or from a student's control panel (preselected for that student; the **For** box can still change it). Each item has a type (notes or homework), a title, optional level, due date (homework), instructions, a file and/or an `https://` link.

- Files can be up to 5 MB: PDF, Word, PowerPoint, text, pictures or audio. Bigger files and videos should be shared as a link (for example Google Drive).
- The file is stored in Firestore, split into pieces of at most 600 KB (`materials/{id}/chunks/{n}`), so no paid Firebase Storage plan is needed.
- `materials/{id}` holds the details and `audience`: `all` or one student's uid.
- Approved students see their items on the **Homework** tab and choose **Open** to download the file. A student never receives another student's items or file pieces; students who are waiting or removed receive none.
- **Delete** removes the item and its file pieces.

Students do not upload work back through this tab yet.

## Publishing this version

1. Publish the new `firestore.rules` to `general-english-c7371` (Firebase console → Firestore Database → Rules → paste → Publish). Until then the class switches and approvals keep working, but own level switches, display names and uploads are refused with a message.
2. Publish the site. The offline cache name is `mr-kenj-v8`, so installed copies pick up the new page.
