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
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
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
async function waitFor(page, predicate, message) {
  try { await page.waitForFunction(predicate, { timeout: 20000 }); }
  catch (err) {
    const sample = await page.evaluate(() => (document.querySelector('#main') || {}).innerText || '').catch(() => '');
    throw new Error(message + '\n' + sample.slice(0, 300) + '\n' + err.message);
  }
}

try {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (req) => { if (/identitytoolkit|sendOobCode|resetPassword/i.test(req.url())) requests.push(req.url()); });
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!document.querySelector('#access-gate #forgot-password'), 'forgot password on the sign-in gate');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_forgot_password_option.png') });
  await page.click('#forgot-password');
  await waitFor(page, () => /Enter the email address/.test((document.querySelector('#password-reset-status') || {}).textContent || ''), 'empty email validation');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_forgot_password_validation.png') });

  await page.evaluate(() => {
    window.__KENJ_TEST__.mockPasswordReset('missing');
    document.querySelector('#teacher-email').value = 'student@school.test';
  });
  await page.click('#forgot-password');
  await waitFor(page, () => /If an account exists for that email/.test((document.querySelector('#password-reset-status') || {}).textContent || ''), 'generic success');
  const afterSuccess = await page.evaluate(() => ({
    calls: window.__KENJ_TEST__.resetCalls(),
    gate: window.__KENJ_TEST__.gate(),
    lessons: document.querySelectorAll('[data-act="open-lesson"]').length
  }));
  assert(afterSuccess.calls === 1, 'reset was not requested once');
  assert(afterSuccess.gate === 'signed-out', 'reset changed who is signed in');
  assert(afterSuccess.lessons === 0, 'reset opened the lessons');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_forgot_password_success.png') });

  await page.evaluate(() => {
    window.__KENJ_TEST__.mockPasswordReset('rate');
    document.querySelector('#teacher-email').value = 'student@school.test';
  });
  await page.click('#forgot-password');
  await waitFor(page, () => /Too many requests/.test((document.querySelector('#password-reset-status') || {}).textContent || ''), 'rate limit');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_forgot_password_failure.png') });

  await page.evaluate(() => {
    window.__KENJ_TEST__.mockPasswordReset('slow');
    document.querySelector('#teacher-email').value = 'student@school.test';
  });
  await page.click('#forgot-password');
  await page.click('#forgot-password');
  await waitFor(page, () => !document.querySelector('#forgot-password').disabled && /If an account exists/.test(document.querySelector('#password-reset-status').textContent), 'slow reset finished');
  const calls = await page.evaluate(() => window.__KENJ_TEST__.resetCalls());
  assert(calls === 1, 'a second click sent another reset, calls ' + calls);

  await waitFor(page, () => {
    const st = window.__KENJ_TEST__.state();
    return st.configured === true && st.mode !== 'checking' && st.mode !== 'booting';
  }, 'level settings did not connect');
  await page.evaluate(() => {
    window.__KENJ_TEST__.clearResetNotice();
    window.__KENJ_TEST__.setAccess('approved', 'reset-student');
    location.hash = 'teacher';
  });
  await waitFor(page, () => !!document.querySelector('#level-access-panel #forgot-password'), 'forgot password on the teacher sign-in');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_forgot_password_teacher.png') });
  assert(requests.length === 0, 'a real reset request was sent');
  console.log('browser password reset checks passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
