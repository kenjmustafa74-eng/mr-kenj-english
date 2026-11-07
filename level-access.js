/* Global level locks for Your English Study Guide with Mr. Kenj.
   One document for every student. This file has no network calls so it can be tested on its own.
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

  function validGrant(data, teacherEmail) {
    if (!data || typeof data !== 'object') return false;
    var keys = Object.keys(data);
    if (keys.length !== 3) return false;
    if (keys.indexOf('status') === -1 || keys.indexOf('updatedAt') === -1 || keys.indexOf('updatedBy') === -1) return false;
    if (data.status !== 'approved' && data.status !== 'revoked') return false;
    if (!Number.isFinite(Number(data.updatedAt))) return false;
    return data.updatedBy === String(teacherEmail || '').trim().toLowerCase();
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
    accessDecision: accessDecision,
    canStudy: canStudy,
    validAccessRequest: validAccessRequest,
    validGrant: validGrant,
    configStatus: configStatus,
    resolveBoot: resolveBoot,
    toggleLock: toggleLock,
    buildLockDocument: buildLockDocument
  };
});
