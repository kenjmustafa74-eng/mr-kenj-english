const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const access = require('../level-access.js');

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const example = fs.readFileSync(path.join(__dirname, '..', 'level-access.config.example.js'), 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8'));

function readWebConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'level-access.config.js'), 'utf8'), sandbox);
  return sandbox.window.KENJ_LEVEL_ACCESS;
}

test('rules publish one readable document and let only the listed teacher write it', () => {
  assert.match(rules, /rules_version = '2'/);
  assert.match(rules, /match \/settings\/levelAccess/);
  assert.match(rules, /allow read: if true;/);
  assert.match(rules, /allow create, update: if isTeacher\(\) && validLevelAccess\(\);/);
  assert.match(rules, /allow delete: if false;/);
  assert.match(rules, /request\.auth != null/);
  assert.match(rules, /request\.auth\.token\.email\.lower\(\)/);
  assert.match(rules, /locks\.A is bool/);
  assert.match(rules, /locks\.B is bool/);
  assert.match(rules, /locks\.C is bool/);
  assert.match(rules, /allow read, write: if false;/);
  assert.doesNotMatch(rules, /allow write: if true/);
  assert.doesNotMatch(rules, /allow read, write: if true/);
  assert.match(rules, /replace-with-teacher@example\.com/);
  assert.equal(firebaseJson.firestore.rules, 'firestore.rules');
});

test('the example config is not a live connection and carries no password', () => {
  assert.match(example, /enabled: false/);
  assert.match(example, /YOUR_API_KEY/);
  assert.match(example, /replace-with-teacher@example\.com/);
  assert.doesNotMatch(example, /BEGIN PRIVATE KEY|private_key/);
  assert.match(example, /Do not put a private key/);
});

test('the saved web settings do not turn level locks on', () => {
  const cfg = readWebConfig();
  const status = access.configStatus(cfg);
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.firebase.projectId, 'general-english-c7371');
  assert.equal(cfg.firebase.authDomain, 'general-english-c7371.firebaseapp.com');
  assert.equal(cfg.firebase.measurementId, undefined);
  assert.equal(typeof cfg.firebase.apiKey, 'string');
  assert.equal(/YOUR_|REPLACE|placeholder/i.test(cfg.firebase.apiKey), false);
  assert.equal(status.configured, false);
  assert.equal(status.reason, 'disabled');
  assert.equal(status.firebaseReady, true);
  assert.equal(status.projectId, 'general-english-c7371');
  assert.deepEqual(status.teacherEmails, []);
  const text = fs.readFileSync(path.join(__dirname, '..', 'level-access.config.js'), 'utf8');
  assert.doesNotMatch(text, /measurementId|BEGIN PRIVATE KEY|private_key/);
});
