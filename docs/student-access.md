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

## Forgotten password

**Forgot password?** sits on every sign-in form: the signed-out study gate, and the teacher sign-in shown when someone who can already study opens the teacher screen. It uses the email already typed in that form. The app calls Firebase Auth `sendPasswordResetEmail` (JavaScript SDK 10.14.1, project `general-english-c7371`) with that address only. It does not build its own reset page, and it does not keep the password or the reset code.

The success line is the same whether or not an account exists: “If an account exists for that email, a reset message has been sent. Check your inbox.” An empty or invalid address, a rate limit, and a network failure each say what went wrong without naming an account. The button shows “Sending…” and ignores a second press until the request finishes.

A reset message does not confirm the email address, approve a student, restore a removed student, or change the level locks. The person still signs in afterwards and passes the same checks.

## Deployment order

1. Publish this version of `firestore.rules` to `general-english-c7371`. Do not publish the app first if you want students to be checked against the new rules immediately. If the app is published first, unapproved people still cannot pass the sign-in screen, and the teacher can sign in.
2. Merge and publish the site. `enabled` stays true for this Firebase project.
3. The teacher confirms `tchmk9@gmail.com`, signs in, and approves or removes students. Approving a student is what creates their grant. This repository does not approve anyone.
