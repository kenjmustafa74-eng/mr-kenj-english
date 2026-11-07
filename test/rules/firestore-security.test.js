const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');

const TEACHER = 'tchmk9@gmail.com';
const RULES = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');

function validDoc(updatedBy) {
  return {
    locks: { A: false, B: true, C: false },
    updatedAt: 1700000000000,
    updatedBy: updatedBy
  };
}

let testEnv;

function context(uid, token) {
  return token ? testEnv.authenticatedContext(uid, token) : testEnv.unauthenticatedContext();
}

function dbFor(uid, token) {
  return context(uid, token).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-general-english',
    firestore: { rules: RULES }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test('an anonymous reader can read the level document and cannot write it', async () => {
  const db = dbFor();
  const ref = doc(db, 'settings', 'levelAccess');
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(ref, validDoc(TEACHER)));
});

test('an unverified allowlisted email cannot write', async () => {
  const db = dbFor('unverified-teacher', { email: TEACHER, email_verified: false });
  await assertFails(setDoc(doc(db, 'settings', 'levelAccess'), validDoc(TEACHER)));
});

test('a verified allowlisted email can write only as that identity', async () => {
  const db = dbFor('verified-teacher', { email: 'Tchmk9@gmail.com', email_verified: true });
  const ref = doc(db, 'settings', 'levelAccess');
  await assertSucceeds(setDoc(ref, validDoc(TEACHER)));
  await assertFails(setDoc(ref, validDoc('someone-else@school.test')));
  await assertFails(setDoc(ref, validDoc('Tchmk9@gmail.com')));
});

test('a verified different email and an account with no email are denied', async () => {
  const other = dbFor('other-person', { email: 'other@school.test', email_verified: true });
  await assertFails(setDoc(doc(other, 'settings', 'levelAccess'), validDoc('other@school.test')));
  const nameless = dbFor('nameless-person', { email_verified: true });
  await assertFails(setDoc(doc(nameless, 'settings', 'levelAccess'), validDoc(TEACHER)));
});

test('a verified teacher cannot write an invalid document, delete, or touch another path', async () => {
  const db = dbFor('verified-teacher', { email: TEACHER, email_verified: true });
  const ref = doc(db, 'settings', 'levelAccess');
  await assertFails(setDoc(ref, {
    locks: { A: 'open', B: false, C: false },
    updatedAt: 1,
    updatedBy: TEACHER
  }));
  await assertFails(setDoc(ref, Object.assign(validDoc(TEACHER), { note: 'extra' })));
  await assertSucceeds(setDoc(ref, validDoc(TEACHER)));
  await assertFails(deleteDoc(ref));
  await assertFails(setDoc(doc(db, 'settings', 'other'), validDoc(TEACHER)));
});
