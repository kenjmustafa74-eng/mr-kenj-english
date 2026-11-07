const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

test('the page uses the shared lock helper and does not pretend local storage is the class setting', () => {
  assert.match(index, /src="level-access\.js"/);
  assert.match(index, /KenjLevelAccess/);
  assert.match(index, /data-act="toggle-lock"/);
  assert.match(index, /buildLockDocument/);
  assert.match(index, /gameAllowed\(S\.game\)/);
  assert.doesNotMatch(index, /localStorage\.setItem\(['"]kenj-locks/);
  assert.match(sw, /level-access\.js/);
  assert.match(sw, /mr-kenj-v2/);
  assert.match(readme, /docs\/level-access\.md/);
});

test('new classroom copy stays in British English and avoids the excluded words', () => {
  const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'level-access.md'), 'utf8');
  const extra = index.split('Level locks for every student')[1] || '';
  const blob = docs + '\n' + extra;
  assert.match(docs, /behaviour|Behaviour|does not|favour/);
  assert.match(docs, /behaviour/);
  assert.doesNotMatch(blob, /rainbow|pork|pig\b|bacon|swine/i);
  assert.doesNotMatch(docs, /\bbehavior\b/);
});
