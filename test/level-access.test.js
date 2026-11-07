const test = require('node:test');
const assert = require('node:assert/strict');
const access = require('../level-access.js');

function doc(locks, updatedAt, updatedBy) {
  return { locks: locks, updatedAt: updatedAt, updatedBy: updatedBy || 'teacher@school.test' };
}

test('unconfigured study stays open and booting does not', () => {
  const ctl = access.createController();
  assert.equal(ctl.snapshot().mode, 'booting');
  assert.equal(ctl.accessFor('A').reason, 'checking');
  assert.equal(ctl.accessFor('A').open, false);
  ctl.noteUnconfigured();
  assert.equal(ctl.accessFor('B').reason, 'unconfigured');
  assert.equal(ctl.accessFor('B').open, true);
  assert.equal(ctl.snapshot().canSave, false);
});

test('levels lock independently and a pass mark is not part of the document', () => {
  const ctl = access.createController();
  ctl.noteConfigured();
  const progress = { xp: 40, scores: { B3: 100 }, cards: { 'B3-0': 5 }, level: 'B' };
  const before = JSON.stringify(progress);
  const saved = access.buildLockDocument(
    { A: false, B: true, C: false },
    'Teacher@School.test',
    ['teacher@school.test'],
    50
  );
  assert.deepEqual(saved.locks, { A: false, B: true, C: false });
  assert.equal(saved.updatedBy, 'teacher@school.test');
  ctl.applySnapshot(saved, 50);
  assert.equal(ctl.accessFor('A').open, true);
  assert.equal(ctl.accessFor('B').reason, 'locked');
  assert.equal(ctl.accessFor('C').open, true);
  assert.equal(JSON.stringify(progress), before);
  const flipped = access.toggleLock(ctl.snapshot().locks, 'A', true);
  assert.deepEqual(flipped, { A: true, B: true, C: false });
  assert.equal(ctl.snapshot().locks.A, false);
});

test('study access fails closed unless the teacher or an approved student is signed in', () => {
  assert.equal(access.accessDecision({ signedIn: false }), 'signed-out');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: false, isTeacher: true }), 'unverified');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, isTeacher: true }), 'teacher');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, grantStatus: 'approved' }), 'approved');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, grantStatus: 'revoked' }), 'revoked');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true }), 'pending');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, readFailed: true, remembered: 'revoked' }), 'revoked');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, readFailed: true, remembered: 'pending' }), 'pending');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, readFailed: true }), 'blocked');
  assert.equal(access.accessDecision({ signedIn: true, emailVerified: true, readFailed: true, remembered: 'approved' }), 'approved-offline');
  assert.equal(access.canStudy('approved'), true);
  assert.equal(access.canStudy('teacher'), true);
  assert.equal(access.canStudy('revoked'), false);
  assert.equal(access.canStudy('pending'), false);
  assert.equal(access.canStudy('approved-offline'), true);
  assert.equal(access.validAccessRequest({ email: 'student@school.test', requestedAt: 10, status: 'approved' }, 'student@school.test'), false);
  assert.equal(access.validAccessRequest({ email: 'student@school.test', requestedAt: 10 }, 'student@school.test'), true);
  assert.equal(access.validGrant({ status: 'approved', updatedAt: 10, updatedBy: 'other@school.test' }, 'tchmk9@gmail.com'), false);
  assert.equal(access.validGrant({ status: 'approved', updatedAt: 10, updatedBy: 'tchmk9@gmail.com' }, 'tchmk9@gmail.com'), true);
});

test('password reset uses a generic result and does not grant access', () => {
  const success = 'If an account exists for that email, a reset message has been sent. Check your inbox.';
  assert.equal(access.emailForReset('  student@school.test  '), 'student@school.test');
  assert.equal(access.emailForReset('not-an-email'), '');
  assert.equal(access.emailForReset(''), '');
  assert.deepEqual(access.passwordResetMessage(null), { ok: true, message: success });
  assert.deepEqual(access.passwordResetMessage('auth/user-not-found'), { ok: true, message: success });
  assert.equal(access.passwordResetMessage('auth/invalid-email').ok, false);
  assert.match(access.passwordResetMessage('auth/too-many-requests').message, /Too many requests/);
  assert.match(access.passwordResetMessage('auth/network-request-failed').message, /connection/);
  assert.equal(access.canStudy(access.accessDecision({ signedIn: false })), false);
});

test('an unverified allowlisted address cannot write', () => {
  const list = ['tchmk9@gmail.com'];
  assert.equal(access.teacherWriteAllowed('tchmk9@gmail.com', false, list), false);
  assert.equal(access.teacherWriteAllowed('Tchmk9@gmail.com', true, list), true);
  assert.equal(access.teacherWriteAllowed('other@school.test', true, list), false);
  assert.equal(access.teacherWriteAllowed('tchmk9@gmail.com', undefined, list), false);
});

test('a student email cannot build a write', () => {
  assert.throws(
    () => access.buildLockDocument({ A: false, B: false, C: false }, 'student@school.test', ['teacher@school.test'], 1),
    (err) => err.code === 'not-teacher'
  );
});

test('invalid and older snapshots cannot clear a known lock', () => {
  const ctl = access.createController();
  ctl.applySnapshot(doc({ A: false, B: true, C: true }, 20), 20);
  const invalid = ctl.applySnapshot({ locks: { A: false, B: false }, updatedAt: 30, updatedBy: 'teacher@school.test' }, 30);
  assert.equal(invalid.reason, 'invalid');
  assert.equal(ctl.accessFor('B').reason, 'locked');
  assert.equal(ctl.accessFor('C').reason, 'locked');
  const stale = ctl.applySnapshot(doc({ A: false, B: false, C: false }, 10), 40);
  assert.equal(stale.reason, 'stale');
  assert.equal(ctl.accessFor('B').reason, 'locked');
  const failed = ctl.applyError({ code: 'unavailable' }, 45);
  assert.equal(failed.mode, 'cached');
  assert.equal(failed.canSave, false);
  assert.equal(ctl.accessFor('C').reason, 'locked');
  assert.equal(ctl.accessFor('A').open, true);
});

test('a cached database snapshot cannot unlock a known lock, then the server can', () => {
  const ctl = access.createController();
  ctl.restoreCache(doc({ A: false, B: true, C: false }, 15));
  ctl.noteConfigured();
  assert.equal(ctl.snapshot().mode, 'cached');
  const cached = ctl.applySnapshot(doc({ A: false, B: false, C: true }, 12), 16, { fromCache: true });
  assert.equal(cached.applied, true);
  assert.equal(ctl.accessFor('B').reason, 'locked');
  assert.equal(ctl.accessFor('C').reason, 'locked');
  assert.equal(ctl.snapshot().hasServer, false);
  ctl.applySnapshot(doc({ A: false, B: false, C: true }, 18), 18, { fromCache: false });
  assert.equal(ctl.accessFor('B').open, true);
  assert.equal(ctl.accessFor('C').reason, 'locked');
  assert.equal(ctl.snapshot().mode, 'live');
  assert.equal(ctl.snapshot().canSave, true);
  const lateCache = ctl.applySnapshot(doc({ A: false, B: false, C: false }, 19), 19, { fromCache: true });
  assert.equal(lateCache.reason, 'cache-after-server');
  assert.equal(ctl.accessFor('C').reason, 'locked');
});

test('a tampered future cache does not block the server document', () => {
  const ctl = access.createController();
  ctl.restoreCache(doc({ A: false, B: false, C: false }, 999999));
  ctl.applySnapshot(doc({ A: true, B: true, C: false }, 30), 30);
  assert.equal(ctl.accessFor('A').reason, 'locked');
  assert.equal(ctl.accessFor('B').reason, 'locked');
});

test('a missing server document opens every level only when nothing newer was saved', () => {
  const ctl = access.createController();
  ctl.restoreCache(doc({ A: false, B: true, C: false }, 8));
  ctl.applyMissing(9);
  assert.equal(ctl.accessFor('B').open, true);
  assert.equal(ctl.snapshot().mode, 'live');
  ctl.applySnapshot(doc({ A: false, B: true, C: false }, 12), 12);
  assert.equal(ctl.applyMissing(13).reason, 'stale');
  assert.equal(ctl.accessFor('B').reason, 'locked');
});

test('first-read failure with no known lock stays unknown rather than inventing locks', () => {
  const ctl = access.createController();
  ctl.noteConfigured();
  const snap = ctl.applyError({ code: 'timeout' }, 5);
  assert.equal(snap.mode, 'unknown');
  assert.equal(ctl.accessFor('A').reason, 'unknown');
  assert.equal(ctl.accessFor('A').open, true);
  assert.equal(ctl.snapshot().locks, null);
});

test('boot keeps known locks when the settings file fails after a previous connection', () => {
  const decision = access.resolveBoot({ configLoaded: false, wasConfigured: true });
  assert.equal(decision.configured, true);
  assert.equal(decision.useCache, true);
  assert.equal(decision.clearStored, false);
  const ctl = access.createController();
  ctl.restoreCache(doc({ A: false, B: true, C: false }, 4));
  ctl.noteConfigured();
  ctl.applyError({ code: 'unavailable' }, 6);
  assert.equal(ctl.accessFor('B').reason, 'locked');
});

test('a loaded file that is still a placeholder clears stored locks', () => {
  const decision = access.resolveBoot({
    configLoaded: true,
    config: {
      enabled: true,
      firebase: { apiKey: 'YOUR_API_KEY', authDomain: 'YOUR_PROJECT.firebaseapp.com', projectId: 'YOUR_PROJECT', appId: 'YOUR_APP_ID' },
      teacherEmails: ['replace-with-teacher@example.com']
    }
  });
  assert.equal(decision.configured, false);
  assert.equal(decision.status.reason, 'placeholder');
  assert.equal(decision.clearStored, true);
});

test('saved web settings stay off until a teacher is listed', () => {
  const status = access.configStatus({
    enabled: false,
    firebase: {
      apiKey: 'a'.repeat(20),
      authDomain: 'general-english-c7371.firebaseapp.com',
      projectId: 'general-english-c7371',
      appId: '1:2:web:abc'
    },
    teacherEmails: ['replace-with-teacher@example.com']
  });
  assert.equal(status.configured, false);
  assert.equal(status.reason, 'disabled');
  assert.equal(status.firebaseReady, true);
  assert.equal(status.projectId, 'general-english-c7371');
  assert.deepEqual(status.teacherEmails, []);
});

test('disabled and ready config are told apart', () => {
  assert.equal(access.configStatus({ enabled: false }).reason, 'disabled');
  assert.equal(access.configStatus({ enabled: false }).firebaseReady, false);
  assert.equal(access.configStatus(null).reason, 'missing');
  const ready = access.configStatus({
    enabled: true,
    firebase: { apiKey: 'a'.repeat(20), authDomain: 'kenj-english.firebaseapp.com', projectId: 'kenj-english', appId: '1:2:web:abc' },
    teacherEmails: ['Teacher@School.test']
  });
  assert.equal(ready.configured, true);
  assert.deepEqual(ready.teacherEmails, ['teacher@school.test']);
});

test('deep links and review words follow the lock', () => {
  assert.deepEqual(access.parseHash('#learn/b12'), { view: 'learn', lessonId: 'B12', level: 'B' });
  assert.deepEqual(access.parseHash('#B3'), { view: 'learn', lessonId: 'B3', level: 'B' });
  assert.deepEqual(access.parseHash('#level/C'), { view: 'learn', level: 'C' });
  assert.deepEqual(access.parseHash('#practice/A'), { view: 'practice', level: 'A' });
  assert.deepEqual(access.parseHash('#teacher'), { view: 'teacher' });
  assert.equal(access.parseHash('#nope').view, 'learn');
  const locks = { A: false, B: true, C: false };
  const accessFor = (level) => ({ open: !locks[level], reason: locks[level] ? 'locked' : 'open' });
  const words = [
    { key: 'A1-0', lesson: 'A1', w: 'name' },
    { key: 'B3-0', lesson: 'B3', w: 'habit' },
    { key: 'C1-0', lesson: 'C1', w: 'anyway' }
  ];
  const openWords = access.filterWordsByAccess(words, accessFor);
  assert.deepEqual(openWords.map((word) => word.w), ['name', 'anyway']);
  assert.equal(access.canStartScope('B3', 'A', accessFor).open, false);
  assert.equal(access.canStartScope('level', 'A', accessFor).open, true);
  assert.equal(access.canStartScope('level', 'B', accessFor).open, false);
  assert.equal(access.canStartScope('review', 'B', accessFor).reason, 'review');
});
