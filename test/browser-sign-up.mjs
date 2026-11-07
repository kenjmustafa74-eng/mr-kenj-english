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
    throw new Error(message + '\n' + sample.slice(0, 400) + '\n' + err.message);
  }
}
async function fill(page, email, password) {
  await page.evaluate((emailValue, passwordValue) => {
    document.querySelector('#teacher-email').value = emailValue;
    document.querySelector('#teacher-password').value = passwordValue;
  }, email, password);
}

try {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (req) => {
    if (/identitytoolkit|accounts:signUp|sendOobCode|resetPassword/i.test(req.url())) requests.push(req.url());
  });
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => !!document.querySelector('#access-gate #sign-up') && !!document.querySelector('#forgot-password'), 'sign up on the sign-in gate');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_option.png') });
  await page.click('#sign-up');
  await waitFor(page, () => /Create an account/.test(document.querySelector('#access-gate h2').textContent) && !document.querySelector('#forgot-password'), 'create-account form');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_form.png') });

  await page.click('#auth-submit');
  await waitFor(page, () => /Enter a valid email address/.test((document.querySelector('#level-teacher-error') || {}).textContent || ''), 'empty email');
  await fill(page, 'student@school.test', 'short');
  await page.click('#auth-submit');
  await waitFor(page, () => /at least 6 characters/.test((document.querySelector('#level-teacher-error') || {}).textContent || ''), 'short password');
  const beforeMock = await page.evaluate(() => window.__KENJ_TEST__.createCalls());
  assert(beforeMock === 0, 'a short password was sent');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_validation.png') });

  await page.evaluate(() => window.__KENJ_TEST__.mockCreateAccount('exists'));
  await fill(page, 'student@school.test', 'test-pass-1');
  await page.click('#auth-submit');
  await waitFor(page, () => /Sign in instead/.test((document.querySelector('#level-teacher-error') || {}).textContent || ''), 'existing account');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_exists.png') });

  await page.evaluate(() => window.__KENJ_TEST__.mockCreateAccount('offline'));
  await fill(page, 'student@school.test', 'test-pass-1');
  await page.click('#auth-submit');
  await waitFor(page, () => /Check your connection/.test((document.querySelector('#level-teacher-error') || {}).textContent || ''), 'network');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_network.png') });

  await page.evaluate(() => window.__KENJ_TEST__.mockCreateAccount('disabled'));
  await fill(page, 'student@school.test', 'test-pass-1');
  await page.click('#auth-submit');
  await waitFor(page, () => /turned off/.test((document.querySelector('#level-teacher-error') || {}).textContent || ''), 'provider disabled');

  await page.evaluate(() => window.__KENJ_TEST__.mockCreateAccount('slow'));
  await fill(page, 'student@school.test', 'test-pass-1');
  await page.click('#auth-submit');
  await page.click('#auth-submit');
  await waitFor(page, () => {
    const button = document.querySelector('#auth-submit');
    return button && !button.disabled && button.textContent === 'Create account';
  }, 'slow create finished');
  const slowCalls = await page.evaluate(() => window.__KENJ_TEST__.createCalls());
  assert(slowCalls === 1, 'a second press created another account, calls ' + slowCalls);

  await page.evaluate(() => window.__KENJ_TEST__.mockCreateAccount('ok'));
  await fill(page, 'tchmk9@gmail.com', 'test-pass-1');
  await page.click('#auth-submit');
  await waitFor(page, () => /Confirm your email/.test((document.querySelector('#access-gate h2') || {}).textContent || ''), 'teacher stays unconfirmed');
  const created = await page.evaluate(() => {
    const debug = window.__KENJ_TEST__.createDebug();
    return {
      calls: window.__KENJ_TEST__.createCalls(),
      gate: window.__KENJ_TEST__.gate(),
      lessons: document.querySelectorAll('[data-act="open-lesson"]').length,
      locks: document.body.innerText.indexOf('These switches are one setting') !== -1,
      email: debug.email,
      length: debug.length,
      storedPassword: debug.stored
    };
  });
  assert(created.calls === 1, 'the teacher address was not submitted once');
  assert(created.email === 'tchmk9@gmail.com', 'the allowlisted address was not the one submitted');
  assert(created.length === 'test-pass-1'.length, 'the password length was not recorded without the password');
  assert(created.gate === 'unverified', 'a new teacher account skipped confirmation, gate ' + created.gate);
  assert(created.lessons === 0, 'a new account opened the lessons');
  assert(created.locks === false, 'a new account could change locks');
  assert(created.storedPassword === false, 'the test hook stored a password');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_confirm.png') });

  await waitFor(page, () => {
    const st = window.__KENJ_TEST__.state();
    return st.configured === true && st.mode !== 'checking' && st.mode !== 'booting';
  }, 'level settings did not connect');
  await page.evaluate(() => {
    window.__KENJ_TEST__.setAccess('approved', 'signup-student');
    location.hash = 'teacher';
  });
  await waitFor(page, () => !!document.querySelector('#level-access-panel #sign-up'), 'sign up on the teacher form');
  const signIn = await page.$('#level-access-panel button[data-mode="sign-in"]');
  if (signIn) await signIn.click();
  await waitFor(page, () => !!document.querySelector('#level-access-panel #forgot-password'), 'forgot password remains on teacher sign-in');
  await page.screenshot({ path: path.join(artifacts, 'screenshot_sign_up_teacher.png') });
  assert(requests.length === 0, 'a real account request was sent');
  console.log('browser sign-up checks passed');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
