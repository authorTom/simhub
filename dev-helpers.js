// Shared helpers for the dev/test scripts (test-qa.js, test-ui-save.js,
// capture-screenshots.js). Not part of the runtime server and never copied
// into the Docker image.

const fs = require('fs');
const path = require('path');

// Find a local Chrome/Chromium executable for puppeteer-core across
// platforms. Set CHROME_PATH to override discovery entirely.
function getChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const commonPaths = process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ] : process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return commonPaths.find(p => p && fs.existsSync(p)) || null;
}

async function postJson(url, body, token = null) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, body: parsed };
}

// Seeded and admin-provisioned accounts start on a provisional password, and
// the server blocks every endpoint except the rotation flow until it is
// changed. For dev/test runs, rotate to a throwaway password and straight
// back: the account keeps its documented password but becomes fully usable.
async function ensureRotatedLogin(baseUrl, email, password) {
  const login = () => postJson(`${baseUrl}/api/login`, { email, password });
  const first = await login();
  if (first.status !== 200 || !first.body?.user?.mustChangePassword) return first;

  const temp = `Rotate!${Date.now()}`;
  const token = first.body.token;
  await postJson(`${baseUrl}/api/me/password`, { currentPassword: password, newPassword: temp }, token);
  await postJson(`${baseUrl}/api/me/password`, { currentPassword: temp, newPassword: password }, token);
  return login();
}

module.exports = { getChromePath, postJson, ensureRotatedLogin };
