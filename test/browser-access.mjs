import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = '/opt/cursor/artifacts';
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('missing'); return;
  }
  res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

function assert(cond, message) {
  if (!cond) throw new Error(message);
}
async function text(page) {
  return page.evaluate(() => document.querySelector('#main').innerText);
}
async function waitFor(page, predicate, message) {
  try { await page.waitForFunction(predicate, { timeout: 20000 }); }
  catch (err) {
    const sample = await page.evaluate(() => (document.querySelector('#main') || {}).innerText || '').catch(() => '');
    throw new Error(message + '\n' + sample.slice(0, 300) + '\n' + err.message);
  }
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(origin + '/#learn/A1', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!document.querySelector('#access-gate #level-teacher-form'), 'signed-out gate');
  let body = await text(page);
  assert(/Only students Mr\. Kenj has approved/.test(body), 'deep link did not stay on sign-in');
  assert(!/My name is Steve/.test(body), 'deep link showed lesson words while signed out');
  assert(await page.evaluate(() => document.querySelectorAll('a[href="#learn"]').length) === 0, 'signed-out page showed the study tabs');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_access_signed_out.png') });

  await page.evaluate(() => window.__KENJ_TEST__.setAccess('pending', 'student-a'));
  await waitFor(page, () => /Waiting for approval/.test(document.querySelector('#main').innerText), 'pending screen');
  body = await text(page);
  assert(!/My name is Steve/.test(body), 'unapproved student saw the lesson');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_access_waiting.png') });

  await page.evaluate(() => {
    window.__KENJ_TEST__.setAccess('approved', 'student-a');
    window.__KENJ_TEST__.seedProgress({ xp: 77, scores: { A1: 80 } });
  });
  await waitFor(page, () => /My name is Steve/.test(document.querySelector('#main').innerText), 'approved lesson');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_access_approved.png') });

  await page.evaluate(() => window.__KENJ_TEST__.setAccess('approved', 'student-b'));
  const other = await page.evaluate(() => window.__KENJ_TEST__.progress());
  assert(other.xp === 0, 'second student saw the first student progress');
  await page.evaluate(() => window.__KENJ_TEST__.setAccess('approved', 'student-a'));
  const restored = await page.evaluate(() => window.__KENJ_TEST__.progress());
  assert(restored.xp === 77, 'first student progress was lost after switching accounts');

  await page.evaluate(() => window.__KENJ_TEST__.setAccess('revoked', 'student-a'));
  await waitFor(page, () => /Access is closed/.test(document.querySelector('#main').innerText), 'revoked screen');
  body = await text(page);
  assert(!/My name is Steve/.test(body), 'removed student still saw the lesson');
  await page.goto(origin + '/#practice/A', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.__KENJ_TEST__.setAccess('revoked', 'student-a'));
  await waitFor(page, () => /Access is closed/.test(document.querySelector('#main').innerText), 'revoked deep link');
  assert(await page.evaluate(() => document.querySelectorAll('[data-act="play"]').length) === 0, 'removed student could start practice');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_access_removed.png') });

  await page.evaluate(() => {
    localStorage.setItem('kenj-access:student-a', JSON.stringify({ decision: 'revoked', at: 1 }));
    window.__KENJ_TEST__.setAccess('revoked', 'student-a');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.__KENJ_TEST__.setAccess('revoked', 'student-a'));
  body = await text(page);
  assert(/Access is closed/.test(body), 'reload cleared a known removal');

  await page.evaluate(() => window.__KENJ_TEST__.setAccess('teacher', 'teacher-test'));
  await page.evaluate(() => { location.hash = 'teacher'; });
  await waitFor(page, () => !!document.querySelector('#access-admin'), 'teacher access list');
  body = await text(page);
  assert(/Student access/.test(body), 'teacher could not see access management');
  assert(/Approve/.test(body) || /No one has asked/.test(body), 'teacher management was missing');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_access_teacher.png') });
  console.log('browser access checks passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
