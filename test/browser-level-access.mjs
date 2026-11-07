import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
fs.mkdirSync(artifacts, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain' };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.join(root, path.normalize(rel));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('missing'); return;
      }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function text(page) {
  return page.evaluate(() => document.querySelector('#main').innerText);
}

async function waitFor(page, predicate, message, ...args) {
  try {
    await page.waitForFunction(predicate, { timeout: 8000 }, ...args);
  } catch (err) {
    const sample = await page.evaluate(() => (document.querySelector('#main') || document.body).innerText.slice(0, 400)).catch(() => '');
    throw new Error(message + '\n' + sample + '\n' + err.message);
  }
}

async function click(page, selector) {
  await waitFor(page, (sel) => !!document.querySelector(sel), 'missing ' + selector, selector);
  await page.evaluate((sel) => document.querySelector(sel).click(), selector);
}

async function shot(page, name) {
  await page.evaluate(() => { const toast = document.querySelector('#toast'); if (toast) toast.hidden = true; });
  await page.screenshot({ path: path.join(artifacts, name) });
}

const server = await startServer();
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  protocolTimeout: 20000,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => {
    const cfg = window.KENJ_LEVEL_ACCESS;
    const st = window.__KENJ_TEST__ && window.__KENJ_TEST__.state();
    return !!(cfg && cfg.enabled === true && cfg.firebase && cfg.firebase.projectId === 'general-english-c7371' && !cfg.firebase.measurementId && st && (st.mode === 'live' || st.mode === 'unknown' || st.mode === 'cached'));
  }, 'live level access did not settle');
  assert(await page.title() === 'Your English Study Guide with Mr. Kenj', 'unexpected title');
  const settled = await page.evaluate(() => window.__KENJ_TEST__.state());
  assert(settled.mode === 'live', 'class lock document was not read, mode ' + settled.mode);
  assert(settled.locks && settled.locks.A === false && settled.locks.B === false && settled.locks.C === false, 'a settings document was already present; this test must not change it');
  await waitFor(page, () => !!document.querySelector('#access-gate'), 'sign-in gate');
  let main = await text(page);
  assert(/Sign in/.test(main), 'signed-out page did not ask for sign-in');
  assert(!/My name is Steve/.test(main), 'signed-out page showed lesson words');
  assert(await page.evaluate(() => document.querySelectorAll('[data-act="open-lesson"],[data-act="toggle-lock"]').length) === 0, 'signed-out page showed study controls');
  await shot(page, 'screenshot_signed_out_gate.png');
  await page.evaluate(() => window.__KENJ_TEST__.setAccess('approved', 'level-lock-student'));
  await waitFor(page, () => !!document.querySelector('[data-act="open-lesson"]'), 'approved student lessons');
  const swText = await page.evaluate(async () => (await fetch('sw.js')).text());
  assert(/mr-kenj-v7/.test(swText) && /level-access\.config\.js/.test(swText), 'service worker does not refresh the level-lock settings');

  const other = await browser.newPage();
  await other.setViewport({ width: 1100, height: 900 });
  await other.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await waitFor(other, () => {
    const st = window.__KENJ_TEST__ && window.__KENJ_TEST__.state();
    return !!(st && st.mode === 'live');
  }, 'second page did not read the class locks');
  await other.evaluate(() => window.__KENJ_TEST__.configure());

  await page.evaluate(() => {
    window.__KENJ_TEST__.configure();
    window.__KENJ_TEST__.applyMissing();
    window.__KENJ_TEST__.seedProgress({ xp: 42, scores: { B3: 90 }, cards: { 'B3-0': 1, 'A1-0': 1 } });
    location.hash = 'teacher';
  });
  await waitFor(page, () => !!document.querySelector('#level-teacher-form'), 'teacher sign-in form');
  assert(await page.evaluate(() => document.querySelectorAll('[data-act="toggle-lock"]').length) === 0, 'student view showed lock switches before sign-in');
  await page.evaluate(() => {
    document.querySelector('#teacher-email').value = 'student@school.test';
    document.querySelector('#teacher-password').value = 'not-the-teacher-secret';
    document.querySelector('#level-teacher-form button[type="submit"]').click();
  });
  await waitFor(page, () => {
    const box = document.querySelector('#level-teacher-error');
    return !!(box && !box.hidden && /not a teacher/.test(box.textContent));
  }, 'rejected student sign-in');
  assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('not-the-teacher-secret'), 'password was stored in the browser');

  await page.evaluate(() => {
    document.querySelector('#teacher-email').value = 'teacher@example.com';
    document.querySelector('#teacher-password').value = 'local-test-only';
    document.querySelector('#level-teacher-form button[type="submit"]').click();
  });
  await waitFor(page, () => {
    const button = document.querySelector('[data-act="toggle-lock"][data-l="A"]');
    return !!(button && !button.disabled);
  }, 'teacher switches');
  await click(page, '[data-act="toggle-lock"][data-l="B"]');
  await click(page, '[data-act="toggle-lock"][data-l="C"]');
  await waitFor(page, () => {
    const read = (level) => document.querySelector('[data-act="toggle-lock"][data-l="' + level + '"]')?.getAttribute('aria-pressed');
    return read('A') === 'false' && read('B') === 'true' && read('C') === 'true';
  }, 'independent locks');
  main = await text(page);
  assert(/Level A: open/.test(main) && /Level B: locked/.test(main) && /Level C: locked/.test(main), 'teacher status line');
  await shot(page, 'screenshot_teacher_switches_after_config.png');

  await waitFor(other, () => {
    const st = window.__KENJ_TEST__ && window.__KENJ_TEST__.state();
    return !!(st && st.locks && st.locks.B === true && st.locks.C === true && st.locks.A === false);
  }, 'lock did not reach the other page');
  await other.goto(origin + '/#level/B', { waitUntil: 'domcontentloaded' });
  await waitFor(other, () => !!document.querySelector('#level-locked'), 'other page lock panel');
  assert(!/Smoking is a bad habit/.test(await text(other)), 'the other device showed a locked lesson');
  await other.close();

  await page.goto(origin + '/#learn/B3', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!document.querySelector('#level-locked'), 'deep link lock');
  main = await text(page);
  assert(/Level B is locked/.test(main), 'deep link did not show the lock');
  assert(/still saved/.test(main), 'deep link did not mention saved progress');
  assert(!/Smoking is a bad habit/.test(main), 'locked deep link showed the lesson text');
  assert(!/Practise this lesson/.test(main), 'locked deep link showed practice actions');
  assert(await page.evaluate(() => document.querySelectorAll('.words').length) === 0, 'locked view rendered the word list');
  await shot(page, 'screenshot_locked_deep_link_after_config.png');

  await click(page, '[data-act="level"][data-l="A"]');
  await waitFor(page, () => !document.querySelector('#level-locked') && !!document.querySelector('[data-act="open-lesson"]'), 'open level A');
  assert(!/Smoking is a bad habit/.test(await text(page)), 'Level A list included a locked level sentence');

  await page.goto(origin + '/#learn/A1', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => /My name is Steve/.test(document.querySelector('#main').innerText), 'open lesson');
  assert(await page.evaluate(() => document.querySelectorAll('[data-act="play"]').length) >= 6, 'open lesson did not show its games');

  await page.goto(origin + '/#practice/B', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!document.querySelector('#level-locked'), 'locked practice');
  assert(await page.evaluate(() => document.querySelectorAll('[data-act="play"]').length) === 0, 'locked practice showed games');
  await page.goto(origin + '/#practice/A', { waitUntil: 'domcontentloaded' });
  await click(page, '[data-act="review"]');
  await waitFor(page, () => !!document.querySelector('.game'), 'review game');
  const review = await text(page);
  assert(/name/i.test(review), 'review missed an open-level word');
  assert(!/habit/i.test(review), 'review included a locked-level word');
  await click(page, '[data-act="exit"]');

  await page.evaluate(() => window.__KENJ_TEST__.showHomework('B3'));
  await waitFor(page, () => !!document.querySelector('[data-act="open-lesson"][data-id="B3"]'), 'homework button');
  assert(/Level B is locked/.test(await text(page)), 'homework button did not say the level is locked');
  await click(page, '[data-act="open-lesson"][data-id="B3"]');
  await waitFor(page, () => !!document.querySelector('#level-locked'), 'homework deep link');
  assert(!/Smoking is a bad habit/.test(await text(page)), 'homework link opened a locked lesson');

  await page.goto(origin + '/#learn/A1', { waitUntil: 'domcontentloaded' });
  await click(page, '[data-act="play"][data-g="flash"]');
  await waitFor(page, () => !!document.querySelector('[data-act="flash-ans"]'), 'flashcards');
  for (let i = 0; i < 8; i++) {
    const more = await page.evaluate(() => {
      const button = document.querySelector('[data-act="flash-ans"][data-k="1"]');
      if (!button) return false;
      button.click();
      return true;
    });
    if (!more) break;
  }
  await waitFor(page, () => !!document.querySelector('.result'), 'game result');
  const afterGame = await page.evaluate(() => ({ progress: window.__KENJ_TEST__.progress(), locks: window.__KENJ_TEST__.state().locks }));
  assert(afterGame.progress.scores.B3 === 90, 'a finished game changed the saved Level B score');
  assert(afterGame.progress.xp > 42, 'finished game did not keep adding points');
  assert(afterGame.locks.B === true && afterGame.locks.C === true && afterGame.locks.A === false, 'finishing a game changed the teacher locks');

  await click(page, '[data-act="play"]');
  await waitFor(page, () => !!document.querySelector('[data-act="flash-ans"]'), 'replay');
  const scoreBefore = await page.evaluate(() => window.__KENJ_TEST__.progress().scores.A1 || null);
  await page.evaluate(() => window.__KENJ_TEST__.applyRemote({
    locks: { A: true, B: true, C: false },
    updatedAt: Date.now(),
    updatedBy: 'teacher@example.com'
  }));
  await waitFor(page, () => !!document.querySelector('#level-locked'), 'lock during a game');
  const scoreAfter = await page.evaluate(() => window.__KENJ_TEST__.progress().scores.A1 || null);
  assert(scoreBefore === scoreAfter, 'a lock arriving mid-game wrote a new pass mark');
  assert(await page.evaluate(() => document.querySelectorAll('.opt, [data-act="flash-ans"]').length) === 0, 'a locked game stayed on screen');

  await page.evaluate(() => localStorage.setItem('kenj-level-access-on', '1'));
  await page.goto(origin + '/#level/B', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => {
    const st = window.__KENJ_TEST__ && window.__KENJ_TEST__.state();
    return !!(st && st.locks && st.locks.B && document.querySelector('#level-locked'));
  }, 'reload dropped a known lock');

  await page.goto(origin + '/#progress', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => /Locked/.test(document.querySelector('#main').innerText), 'progress lock label');
  const kept = await page.evaluate(() => window.__KENJ_TEST__.progress());
  assert(kept.scores.B3 === 90 && kept.cards['B3-0'] === 1, 'progress page lost saved Level B work');
  await shot(page, 'screenshot_progress_kept_after_config.png');
  assert(errors.length === 0, 'page errors: ' + errors.join('\n'));
  console.log('browser level-access checks passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
