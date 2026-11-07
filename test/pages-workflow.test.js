const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
const expected = [
  'index.html',
  'level-access.js',
  'level-access.config.js',
  'manifest.json',
  'sw.js',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

test('the Pages workflow publishes only the static study app', () => {
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /actions\/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b/);
  assert.match(workflow, /actions\/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa/);
  assert.match(workflow, /actions\/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346/);
  assert.match(workflow, /path: _site/);
  assert.doesNotMatch(workflow, /path: ['"]\.['"]/);
  const copied = [...workflow.matchAll(/^ {12}([A-Za-z0-9._-]+) \\$/gm)].map((match) => match[1]);
  assert.deepEqual(copied, expected);
  assert.match(workflow, /test ! -e _site\/node_modules/);
  assert.match(workflow, /test ! -e _site\/package-lock\.json/);
  assert.match(workflow, /test ! -e _site\/firestore\.rules/);
  for (const file of expected) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', file)), true, file);
  }
});

test('Pages publishing leaves the General English Firebase settings enabled', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'level-access.config.js'), 'utf8'), sandbox);
  const cfg = sandbox.window.KENJ_LEVEL_ACCESS;
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.firebase.projectId, 'general-english-c7371');
  assert.equal(cfg.firebase.measurementId, undefined);
});
