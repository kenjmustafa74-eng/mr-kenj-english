const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, deleteDoc } = require('firebase/firestore');

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

function studentToken(email, verified) {
  return { email: email, email_verified: verified === true };
}

test('students can create only their own plain request and cannot approve themselves', async () => {
  const student = dbFor('student-a', studentToken('student@school.test', true));
  const request = doc(student, 'accessRequests', 'student-a');
  await assertSucceeds(setDoc(request, { email: 'student@school.test', requestedAt: 20 }));
  await assertFails(setDoc(doc(student, 'accessRequests', 'student-a'), { email: 'student@school.test', requestedAt: 21, status: 'approved' }));
  await assertFails(setDoc(doc(student, 'accessRequests', 'student-b'), { email: 'student@school.test', requestedAt: 20 }));
  await assertFails(setDoc(doc(student, 'accessGrants', 'student-a'), { status: 'approved', updatedAt: 20, updatedBy: TEACHER }));
  const unverified = dbFor('student-a', studentToken('student@school.test', false));
  await assertFails(setDoc(doc(unverified, 'accessRequests', 'student-a'), { email: 'student@school.test', requestedAt: 20 }));
});

test('a student cannot read another student, and a verified teacher can approve or remove access', async () => {
  const studentA = dbFor('student-a', studentToken('student@school.test', true));
  await assertSucceeds(setDoc(doc(studentA, 'accessRequests', 'student-a'), { email: 'student@school.test', requestedAt: 20 }));
  const teacher = dbFor('teacher-person', { email: TEACHER, email_verified: true });
  await assertSucceeds(getDoc(doc(teacher, 'accessRequests', 'student-a')));
  const studentB = dbFor('student-b', studentToken('second@school.test', true));
  await assertFails(getDoc(doc(studentB, 'accessRequests', 'student-a')));
  await assertFails(getDocs(collection(studentB, 'accessRequests')));
  await assertSucceeds(getDocs(collection(teacher, 'accessRequests')));
  const grant = doc(teacher, 'accessGrants', 'student-a');
  await assertSucceeds(setDoc(grant, { status: 'approved', updatedAt: 30, updatedBy: TEACHER }));
  await assertFails(setDoc(grant, { status: 'approved', updatedAt: 31, updatedBy: 'student@school.test' }));
  await assertFails(setDoc(grant, { status: 'teacher', updatedAt: 32, updatedBy: TEACHER }));
  const otherTeacher = dbFor('other-teacher', { email: 'other@school.test', email_verified: true });
  await assertFails(setDoc(doc(otherTeacher, 'accessGrants', 'student-a'), { status: 'revoked', updatedAt: 33, updatedBy: 'other@school.test' }));
  await assertSucceeds(setDoc(grant, { status: 'revoked', updatedAt: 34, updatedBy: TEACHER }));
  await assertSucceeds(getDoc(doc(studentA, 'accessGrants', 'student-a')));
  await assertFails(getDoc(doc(studentA, 'accessGrants', 'student-b')));
  await assertFails(getDocs(collection(studentA, 'accessGrants')));
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
