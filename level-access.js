/* Level locks for Your English Study Guide with Mr. Kenj.
   One class-wide document, plus optional locks for each student on their grant. This file has no network calls so it can be tested on its own.
   The page decides when a store is configured and feeds snapshots in. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KenjLevelAccess = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var LEVEL_IDS = ['A', 'B', 'C'];
  var CACHE_KEY = 'kenj-level-access';
  var FLAG_KEY = 'kenj-level-access-on';

  function emptyLocks() {
    return { A: false, B: false, C: false };
  }

  function cloneLocks(locks) {
    var out = emptyLocks();
    for (var i = 0; i < LEVEL_IDS.length; i++) {
      var id = LEVEL_IDS[i];
      out[id] = !!(locks && locks[id]);
    }
    return out;
  }

  function normaliseDocument(data) {
    if (!data || typeof data !== 'object') return null;
    var locks = data.locks;
    if (!locks || typeof locks !== 'object') return null;
    for (var i = 0; i < LEVEL_IDS.length; i++) {
      if (typeof locks[LEVEL_IDS[i]] !== 'boolean') return null;
    }
    var updatedAt = Number(data.updatedAt);
    if (!Number.isFinite(updatedAt)) return null;
    var updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : '';
    return { locks: cloneLocks(locks), updatedAt: updatedAt, updatedBy: updatedBy };
  }

  function createController() {
    var state = {
      configured: false,
      mode: 'booting',
      locks: null,
      updatedAt: 0,
      updatedBy: '',
      hasServer: false,
      serverUpdatedAt: 0,
      error: '',
      checkedAt: 0
    };

    function canSave() {
      return !!(state.hasServer && state.mode === 'live');
    }

    function snapshot() {
      return {
        configured: state.configured,
        mode: state.mode,
        locks: state.locks ? cloneLocks(state.locks) : null,
        updatedAt: state.updatedAt,
        updatedBy: state.updatedBy,
        hasServer: state.hasServer,
        error: state.error,
        checkedAt: state.checkedAt,
        canSave: canSave()
      };
    }

    function noteConfigured() {
      state.configured = true;
      if (state.mode === 'live') return;
      state.mode = state.locks ? 'cached' : 'checking';
    }

    function noteUnconfigured() {
      state.configured = false;
      state.mode = 'unconfigured';
      state.locks = null;
      state.updatedAt = 0;
      state.updatedBy = '';
      state.hasServer = false;
      state.serverUpdatedAt = 0;
      state.error = '';
    }

    function restoreCache(raw) {
      if (state.hasServer) return false;
      var doc = normaliseDocument(raw);
      if (!doc) return false;
      state.locks = doc.locks;
      state.updatedAt = doc.updatedAt;
      state.updatedBy = doc.updatedBy;
      return true;
    }

    function applySnapshot(data, now, opts) {
      opts = opts || {};
      var doc = normaliseDocument(data);
      if (!doc) {
        state.error = 'invalid';
        return { applied: false, reason: 'invalid' };
      }
      if (opts.fromCache && state.hasServer) return { applied: false, reason: 'cache-after-server' };
      if (!opts.fromCache && state.hasServer && doc.updatedAt < state.serverUpdatedAt) {
        return { applied: false, reason: 'stale' };
      }
      var locks = doc.locks;
      if (opts.fromCache && state.locks) {
        locks = cloneLocks(locks);
        for (var i = 0; i < LEVEL_IDS.length; i++) {
          var id = LEVEL_IDS[i];
          if (state.locks[id]) locks[id] = true;
        }
      }
      state.locks = locks;
      state.updatedBy = doc.updatedBy;
      state.configured = true;
      state.error = '';
      state.checkedAt = now || Date.now();
      if (opts.fromCache) {
        if (doc.updatedAt > state.updatedAt) state.updatedAt = doc.updatedAt;
        state.mode = 'cached';
      } else {
        state.hasServer = true;
        state.serverUpdatedAt = doc.updatedAt;
        state.updatedAt = doc.updatedAt;
        state.mode = 'live';
      }
      return { applied: true, doc: { locks: cloneLocks(state.locks), updatedAt: state.updatedAt, updatedBy: state.updatedBy } };
    }

    function applyMissing(now) {
      if (state.hasServer && state.serverUpdatedAt > 0) return { applied: false, reason: 'stale' };
      return applySnapshot({ locks: emptyLocks(), updatedAt: 0, updatedBy: '' }, now);
    }

    function applyError(error, now) {
      state.error = (error && (error.code || error.message)) || 'error';
      state.checkedAt = now || Date.now();
      if (state.locks) {
        state.mode = 'cached';
        return snapshot();
      }
      state.mode = state.configured ? 'unknown' : 'unconfigured';
      return snapshot();
    }

    function accessFor(level) {
      if (LEVEL_IDS.indexOf(level) === -1) return { open: false, reason: 'unknown-level' };
      if (state.mode === 'unconfigured') return { open: true, reason: 'unconfigured' };
      if (state.locks && state.locks[level]) return { open: false, reason: 'locked' };
      if (state.mode === 'booting' || state.mode === 'checking') return { open: false, reason: 'checking' };
      if (state.locks) return { open: true, reason: state.mode === 'live' ? 'open' : 'cached-open' };
      if (state.mode === 'unknown') return { open: true, reason: 'unknown' };
      return { open: false, reason: 'checking' };
    }

    function cachePayload() {
      if (!state.locks) return null;
      return { locks: cloneLocks(state.locks), updatedAt: state.updatedAt, updatedBy: state.updatedBy };
    }

    return {
      snapshot: snapshot,
      noteConfigured: noteConfigured,
      noteUnconfigured: noteUnconfigured,
      restoreCache: restoreCache,
      applySnapshot: applySnapshot,
      applyMissing: applyMissing,
      applyError: applyError,
      accessFor: accessFor,
      cachePayload: cachePayload
    };
  }

  function lessonLevel(lessonId) {
    var level = String(lessonId || '').charAt(0).toUpperCase();
    return LEVEL_IDS.indexOf(level) === -1 ? null : level;
  }

  function parseHash(hash) {
    var raw = String(hash || '').replace(/^#/, '').trim();
    try { raw = decodeURIComponent(raw); } catch (e) {}
    raw = raw.split('?')[0];
    if (!raw) return { view: 'learn' };
    var parts = raw.split('/').filter(Boolean);
    var head = String(parts[0] || '').toLowerCase();
    var views = { learn: 'learn', practice: 'practice', homework: 'homework', progress: 'progress', teacher: 'teacher' };
    if (head === 'level' && parts[1] && /^[ABC]$/i.test(parts[1])) {
      return { view: 'learn', level: parts[1].toUpperCase() };
    }
    if (views[head]) {
      var out = { view: views[head] };
      var second = parts[1] || '';
      if ((head === 'learn' || head === 'practice') && /^[ABC]$/i.test(second)) out.level = second.toUpperCase();
      if (head === 'learn' && /^[ABC]\d+$/i.test(second)) {
        out.lessonId = second.toUpperCase();
        out.level = out.lessonId.charAt(0);
      }
      return out;
    }
    if (/^[ABC]\d+$/i.test(parts[0])) {
      var lessonId = parts[0].toUpperCase();
      return { view: 'learn', lessonId: lessonId, level: lessonId.charAt(0) };
    }
    if (/^[ABC]$/i.test(parts[0])) return { view: 'learn', level: parts[0].toUpperCase() };
    return { view: 'learn' };
  }

  function filterWordsByAccess(words, accessFor) {
    return (words || []).filter(function (word) {
      var level = lessonLevel(word && (word.lesson || word.key));
      if (!level) return false;
      return !!accessFor(level).open;
    });
  }

  function canStartScope(scope, currentLevel, accessFor) {
    if (scope === 'review') return { open: true, reason: 'review' };
    var level = scope === 'level' ? currentLevel : lessonLevel(scope);
    if (!level) return { open: false, reason: 'unknown-level' };
    return accessFor(level);
  }

  function isTeacherEmail(email, allowList) {
    var value = String(email || '').trim().toLowerCase();
    if (!value) return false;
    return (allowList || []).some(function (item) {
      return String(item || '').trim().toLowerCase() === value;
    });
  }

  function teacherWriteAllowed(email, emailVerified, allowList) {
    return emailVerified === true && isTeacherEmail(email, allowList);
  }

  function emailForReset(value) {
    var email = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function passwordResetMessage(code) {
    if (!code || code === 'auth/user-not-found') {
      return { ok: true, message: 'If an account exists for that email, a reset message has been sent. Check your inbox.' };
    }
    if (code === 'auth/invalid-email') return { ok: false, message: 'Enter a valid email address.' };
    if (code === 'auth/too-many-requests') return { ok: false, message: 'Too many requests. Wait a moment and try again.' };
    if (code === 'auth/network-request-failed') return { ok: false, message: 'Could not reach the sign-in service. Check your connection and try again.' };
    if (code === 'auth/unauthorized-domain') return { ok: false, message: 'This website is not allowed to send a reset message yet. Ask Mr. Kenj to add it to the sign-in settings.' };
    return { ok: false, message: 'Could not send a reset message. Try again.' };
  }

  function signInMessage(code) {
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      return 'That email or password was not recognised.';
    }
    if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Wait a moment and try again.';
    if (code === 'auth/network-request-failed') return 'Could not reach the sign-in service. Check your connection and try again.';
    if (code === 'auth/unauthorized-domain') return 'This website is not allowed to sign in yet. Ask Mr. Kenj to add it to the sign-in settings.';
    if (code === 'auth/operation-not-allowed') return 'Email sign-in is turned off for this app.';
    return 'Could not sign in.';
  }

  function createAccountMessage(code) {
    if (code === 'auth/email-already-in-use') return 'An account already exists for that email. Sign in instead.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/weak-password') return 'Use a password of at least 6 characters.';
    if (code === 'auth/network-request-failed') return 'Could not reach the sign-in service. Check your connection and try again.';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') return 'Creating accounts is turned off for this app. Ask Mr. Kenj to allow email sign-up.';
    if (code === 'auth/unauthorized-domain') return 'This website is not allowed to create accounts yet. Ask Mr. Kenj to add it to the sign-in settings.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a moment and try again.';
    return 'Could not create the account. Try again.';
  }

  function accessDecision(input) {
    input = input || {};
    if (!input.signedIn) return 'signed-out';
    if (input.emailVerified !== true) return 'unverified';
    if (input.isTeacher) return 'teacher';
    if (input.readFailed) {
      if (input.remembered === 'approved') return 'approved-offline';
      if (input.remembered === 'revoked') return 'revoked';
      if (input.remembered === 'pending') return 'pending';
      return 'blocked';
    }
    if (input.grantStatus === 'approved') return 'approved';
    if (input.grantStatus === 'revoked') return 'revoked';
    return 'pending';
  }

  function canStudy(decision) {
    return decision === 'teacher' || decision === 'approved' || decision === 'approved-offline';
  }

  function validAccessRequest(data, authEmail) {
    if (!data || typeof data !== 'object') return false;
    var keys = Object.keys(data);
    if (keys.length !== 2) return false;
    if (keys.indexOf('email') === -1 || keys.indexOf('requestedAt') === -1) return false;
    return data.email === String(authEmail || '').trim().toLowerCase() && Number.isFinite(Number(data.requestedAt));
  }

  var GRANT_KEYS = ['status', 'updatedAt', 'updatedBy', 'locks', 'name'];

  function validLockMap(locks) {
    if (!locks || typeof locks !== 'object' || Array.isArray(locks)) return false;
    var keys = Object.keys(locks);
    if (keys.length !== LEVEL_IDS.length) return false;
    for (var i = 0; i < LEVEL_IDS.length; i++) {
      if (typeof locks[LEVEL_IDS[i]] !== 'boolean') return false;
    }
    return true;
  }

  function validGrant(data, teacherEmail) {
    if (!data || typeof data !== 'object') return false;
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) if (GRANT_KEYS.indexOf(keys[k]) === -1) return false;
    if (keys.indexOf('status') === -1 || keys.indexOf('updatedAt') === -1 || keys.indexOf('updatedBy') === -1) return false;
    if (data.status !== 'approved' && data.status !== 'revoked') return false;
    if (!Number.isFinite(Number(data.updatedAt))) return false;
    if ('locks' in data && !validLockMap(data.locks)) return false;
    if ('name' in data && (typeof data.name !== 'string' || data.name.length > 60)) return false;
    return data.updatedBy === String(teacherEmail || '').trim().toLowerCase();
  }

  /* Per-student level locks. A grant may carry its own `locks` map. When it does, that map
     decides the student's levels and the class-wide document is not used for that student.
     When it does not, the class-wide locks apply as before. */
  function studentLocksFromGrant(grant) {
    if (!grant || typeof grant !== 'object') return null;
    return validLockMap(grant.locks) ? cloneLocks(grant.locks) : null;
  }

  function studentAccessFor(ownLocks, level, classAccess) {
    if (LEVEL_IDS.indexOf(level) === -1) return { open: false, reason: 'unknown-level' };
    if (ownLocks && validLockMap(ownLocks)) {
      return ownLocks[level] ? { open: false, reason: 'locked', own: true } : { open: true, reason: 'open', own: true };
    }
    return typeof classAccess === 'function' ? classAccess(level) : { open: false, reason: 'checking' };
  }

  /* Build the next grant document. `changes` may set status, locks (a lock map, or null to go
     back to the class setting) and name. Unknown fields from older documents are dropped. */
  function buildGrant(previous, changes, email, allowList, now) {
    if (!isTeacherEmail(email, allowList)) {
      var err = new Error('Only a listed teacher can change student access.');
      err.code = 'not-teacher';
      throw err;
    }
    previous = previous || {};
    changes = changes || {};
    var status = changes.status || previous.status || 'approved';
    if (status !== 'approved' && status !== 'revoked') status = 'approved';
    var out = { status: status, updatedAt: now || Date.now(), updatedBy: String(email).trim().toLowerCase() };
    var locks = 'locks' in changes ? changes.locks : previous.locks;
    if (locks && validLockMap(cloneLocks(locks))) out.locks = cloneLocks(locks);
    var name = 'name' in changes ? changes.name : previous.name;
    name = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name) out.name = name;
    return out;
  }

  /* ---------- notes and homework uploaded by the teacher ---------- */
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var CHUNK_BYTES = 600 * 1024;
  var MAX_CHUNKS = Math.ceil(MAX_FILE_BYTES / CHUNK_BYTES);
  var MATERIAL_KINDS = ['note', 'homework'];

  function chunkCount(size) {
    var n = Math.ceil(Number(size) / CHUNK_BYTES);
    return n > 0 ? n : 1;
  }

  /* Split a byte array into chunks of at most CHUNK_BYTES, each returned as base64 text. */
  function splitBytes(bytes) {
    var out = [];
    for (var start = 0; start < bytes.length || (start === 0 && out.length === 0); start += CHUNK_BYTES) {
      var part = bytes.subarray ? bytes.subarray(start, start + CHUNK_BYTES) : bytes.slice(start, start + CHUNK_BYTES);
      out.push(bytesToBase64(part));
      if (!bytes.length) break;
    }
    return out;
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined' && !(typeof window !== 'undefined' && window.btoa)) return Buffer.from(bytes).toString('base64');
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x8000));
    return btoa(bin);
  }

  function base64ToBytes(text) {
    if (typeof Buffer !== 'undefined' && !(typeof window !== 'undefined' && window.atob)) return new Uint8Array(Buffer.from(text, 'base64'));
    var bin = atob(text);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function joinChunks(parts) {
    var arrays = (parts || []).map(base64ToBytes);
    var total = arrays.reduce(function (n, a) { return n + a.length; }, 0);
    var out = new Uint8Array(total);
    var at = 0;
    arrays.forEach(function (a) { out.set(a, at); at += a.length; });
    return out;
  }

  function safeLink(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    if (!/^https:\/\/[^\s<>"']+$/i.test(v) || v.length > 500) return null;
    return v;
  }

  /* Check and tidy what the teacher typed in the upload form. Returns { ok, error, doc }. */
  function buildMaterial(input, email, allowList, now) {
    if (!isTeacherEmail(email, allowList)) return { ok: false, error: 'Only the teacher can add notes and homework.' };
    input = input || {};
    var kind = MATERIAL_KINDS.indexOf(input.kind) === -1 ? 'note' : input.kind;
    var title = String(input.title || '').replace(/\s+/g, ' ').trim();
    if (!title) return { ok: false, error: 'Give it a title.' };
    if (title.length > 120) return { ok: false, error: 'Keep the title under 120 characters.' };
    var details = String(input.details || '').trim();
    if (details.length > 2000) return { ok: false, error: 'Keep the instructions under 2,000 characters.' };
    var audience = String(input.audience || 'all').trim() || 'all';
    if (audience.length > 128 || /[\/]/.test(audience)) return { ok: false, error: 'Choose who it is for.' };
    var level = LEVEL_IDS.indexOf(input.level) === -1 ? '' : input.level;
    var due = String(input.due || '').trim();
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: 'Use a real due date.' };
    if (kind !== 'homework') due = '';
    var link = safeLink(input.link);
    if (link === null) return { ok: false, error: 'A link must start with https:// .' };
    var file = null;
    if (input.file) {
      var size = Number(input.file.size);
      if (!(size > 0)) return { ok: false, error: 'That file is empty.' };
      if (size > MAX_FILE_BYTES) return { ok: false, error: 'Files can be up to 5 MB. Make it smaller or share a link instead.' };
      file = {
        name: String(input.file.name || 'file').slice(0, 200),
        type: String(input.file.type || 'application/octet-stream').slice(0, 100),
        size: Math.floor(size),
        chunks: chunkCount(size)
      };
    }
    if (!file && !link && !details) return { ok: false, error: 'Add a file, a link or some instructions.' };
    return {
      ok: true,
      doc: {
        title: title, kind: kind, details: details, audience: audience, level: level, due: due,
        link: link || '', file: file, createdAt: now || Date.now(), createdBy: String(email).trim().toLowerCase()
      }
    };
  }

  function materialVisibleTo(material, uid) {
    if (!material || !uid) return false;
    return material.audience === 'all' || material.audience === uid;
  }

  function sortMaterials(list) {
    return (list || []).slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function looksPlaceholder(value) {
    var v = String(value || '').trim();
    if (!v) return true;
    if (/YOUR_|REPLACE|changeme|placeholder/i.test(v)) return true;
    if (/^your-project/i.test(v)) return true;
    if (/example\.com$/i.test(v)) return true;
    return false;
  }

  function firebaseParts(config) {
    var fb = config && config.firebase;
    var projectId = '';
    var ready = false;
    if (fb && typeof fb === 'object') {
      ready = ['apiKey', 'authDomain', 'projectId', 'appId'].every(function (key) {
        return !looksPlaceholder(fb[key]);
      });
      if (typeof fb.projectId === 'string' && !looksPlaceholder(fb.projectId)) projectId = fb.projectId.trim();
    }
    return { projectId: projectId, firebaseReady: ready };
  }

  function listedTeachers(config) {
    var emails = config && Array.isArray(config.teacherEmails) ? config.teacherEmails : [];
    var real = [];
    for (var j = 0; j < emails.length; j++) {
      var email = String(emails[j] || '').trim().toLowerCase();
      if (!email || looksPlaceholder(email)) continue;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
      real.push(email);
    }
    return real;
  }

  function configStatus(config) {
    var parts = firebaseParts(config);
    var teachers = listedTeachers(config);
    var base = { configured: false, teacherEmails: teachers, projectId: parts.projectId, firebaseReady: parts.firebaseReady };
    if (!config || typeof config !== 'object') return { configured: false, reason: 'missing', teacherEmails: [], projectId: '', firebaseReady: false };
    if (config.enabled !== true) return Object.assign(base, { reason: 'disabled' });
    if (!parts.firebaseReady) return Object.assign(base, { reason: 'placeholder', teacherEmails: teachers });
    if (!teachers.length) return Object.assign(base, { reason: 'no-teacher-email' });
    return { configured: true, reason: 'ready', teacherEmails: teachers, projectId: parts.projectId, firebaseReady: true };
  }

  function resolveBoot(input) {
    input = input || {};
    if (input.configLoaded) {
      var status = configStatus(input.config);
      if (status.configured) return { configured: true, clearStored: false, status: status, useCache: true };
      return { configured: false, clearStored: true, status: status, useCache: false };
    }
    if (input.wasConfigured) {
      return {
        configured: true,
        clearStored: false,
        status: { configured: true, reason: 'unavailable', teacherEmails: [] },
        useCache: true
      };
    }
    return {
      configured: false,
      clearStored: false,
      status: { configured: false, reason: 'missing', teacherEmails: [] },
      useCache: false
    };
  }

  function toggleLock(locks, level, locked) {
    var next = cloneLocks(locks || emptyLocks());
    if (LEVEL_IDS.indexOf(level) === -1) return next;
    next[level] = !!locked;
    return next;
  }

  function buildLockDocument(locks, email, allowList, now) {
    if (!isTeacherEmail(email, allowList)) {
      var err = new Error('Only a listed teacher can change level locks.');
      err.code = 'not-teacher';
      throw err;
    }
    return {
      locks: cloneLocks(locks),
      updatedAt: now || Date.now(),
      updatedBy: String(email).trim().toLowerCase()
    };
  }

  return {
    LEVEL_IDS: LEVEL_IDS,
    CACHE_KEY: CACHE_KEY,
    FLAG_KEY: FLAG_KEY,
    emptyLocks: emptyLocks,
    cloneLocks: cloneLocks,
    normaliseDocument: normaliseDocument,
    createController: createController,
    lessonLevel: lessonLevel,
    parseHash: parseHash,
    filterWordsByAccess: filterWordsByAccess,
    canStartScope: canStartScope,
    isTeacherEmail: isTeacherEmail,
    teacherWriteAllowed: teacherWriteAllowed,
    emailForReset: emailForReset,
    passwordResetMessage: passwordResetMessage,
    signInMessage: signInMessage,
    createAccountMessage: createAccountMessage,
    accessDecision: accessDecision,
    canStudy: canStudy,
    validAccessRequest: validAccessRequest,
    validGrant: validGrant,
    validLockMap: validLockMap,
    studentLocksFromGrant: studentLocksFromGrant,
    studentAccessFor: studentAccessFor,
    buildGrant: buildGrant,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    CHUNK_BYTES: CHUNK_BYTES,
    MAX_CHUNKS: MAX_CHUNKS,
    chunkCount: chunkCount,
    splitBytes: splitBytes,
    joinChunks: joinChunks,
    safeLink: safeLink,
    buildMaterial: buildMaterial,
    materialVisibleTo: materialVisibleTo,
    sortMaterials: sortMaterials,
    configStatus: configStatus,
    resolveBoot: resolveBoot,
    toggleLock: toggleLock,
    buildLockDocument: buildLockDocument
  };
});
