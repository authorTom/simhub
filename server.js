const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Set TRUST_PROXY=1 (or the number of proxy hops) when running behind a
// reverse proxy (nginx, Caddy, ...) so req.ip reflects the real client for
// login throttling rather than the proxy's address. Off by default because
// trusting proxy headers without a proxy lets clients spoof their IP.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// --- Security helpers ---

// Promisified scrypt so password checks never block the event loop.
function scryptAsync(plain, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(plain), salt, 64, (err, derived) => {
      if (err) reject(err); else resolve(derived);
    });
  });
}

// Hash a plaintext password using scrypt with a per-user random salt.
// Format: scrypt$<saltHex>$<hashHex>
async function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(plain, salt)).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

// Synchronous variant used only at startup (defaults + legacy migration),
// where blocking is harmless and async plumbing would complicate boot.
function hashPasswordSync(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// Constant-time password verification. Transparently supports legacy
// plaintext records (pre-migration) so existing accounts keep working.
async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  if (!isHashed(stored)) {
    return stored === plain;
  }
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(plain, salt)).toString('hex');
  const hashBuf = Buffer.from(hash, 'hex');
  const derivedBuf = Buffer.from(derived, 'hex');
  if (hashBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, derivedBuf);
}

// Hash verified for unknown accounts so login latency does not reveal
// whether an email exists (timing-based account enumeration).
const DUMMY_HASH = hashPasswordSync(crypto.randomBytes(16).toString('hex'));

const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

// Admin: full access. Editor: a programme-scoped middle tier that can
// create/edit/delete scenarios within its allocated programmes only.
// Read-Only: view everything, change nothing.
const VALID_ROLES = ['Admin', 'Editor', 'Read-Only'];

// Restrict identifiers used to build filesystem paths to a safe charset.
// Prevents path traversal (e.g. "../../server") via client-supplied ids.
const VALID_ID = /^[A-Za-z0-9_-]+$/;
function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && VALID_ID.test(id);
}

// Strip the password field before sending a user object to the client.
// createdAt/lastLogin may be absent on accounts that predate this feature;
// they surface as null so the UI can show "Unknown"/"Never".
function publicUser(u) {
  return {
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: !!u.disabled,
    createdAt: u.createdAt || null,
    lastLogin: u.lastLogin || null,
    // Programmes an Editor may edit scenarios within; empty for other roles.
    programmeIds: Array.isArray(u.programmeIds) ? u.programmeIds : []
  };
}

// Directories for persistence
const DATA_DIR = path.join(__dirname, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');
const PROGRAMMES_DIR = path.join(DATA_DIR, 'programmes');
const RECYCLE_BIN_DIR = path.join(DATA_DIR, 'recycle_bin');

// Ensure directories exist
[DATA_DIR, SCENARIOS_DIR, PROGRAMMES_DIR, RECYCLE_BIN_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Read + parse a JSON file, returning null instead of throwing when the file
// is missing or corrupt. One damaged file must never take down a whole
// listing endpoint; callers skip null entries.
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Skipping unreadable JSON file ${filePath}: ${e.message}`);
    return null;
  }
}

// Crash-safe JSON write: write to a temp file in the same directory, then
// rename over the target. A crash mid-write can then never leave a
// half-written (corrupt) file behind.
function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// Middleware

// Baseline security headers on every response.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Bulk backup imports legitimately carry large payloads; everything else
// gets a much smaller body limit.
const jsonDefault = express.json({ limit: '2mb' });
const jsonLarge = express.json({ limit: '50mb' });
app.use((req, res, next) => {
  (req.path === '/api/backup/import' ? jsonLarge : jsonDefault)(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public')));

// Simple Token-based Auth System
const SESSIONS = new Map(); // token -> { user, expiresAt }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours, refreshed on activity
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Sessions are persisted so a restart/deploy does not sign everyone out.
// Tokens on disk carry the same sensitivity as users.json: the data
// directory must not be web-served or world-readable.
function loadSessions() {
  const stored = fs.existsSync(SESSIONS_FILE) ? readJsonSafe(SESSIONS_FILE) : null;
  if (!stored) return;
  const now = Date.now();
  for (const [token, session] of Object.entries(stored)) {
    if (session && session.user && session.expiresAt > now) {
      SESSIONS.set(token, session);
    }
  }
}

function saveSessions() {
  try {
    writeJsonAtomic(SESSIONS_FILE, Object.fromEntries(SESSIONS));
  } catch (e) {
    console.error('Failed to persist sessions:', e);
  }
}

loadSessions();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, {
    user: {
      email: user.email,
      role: user.role,
      name: user.name,
      programmeIds: Array.isArray(user.programmeIds) ? user.programmeIds : [],
      mustChangePassword: !!user.mustChangePassword
    },
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  saveSessions();
  return token;
}

// Drop every live session belonging to an email (account deleted).
// Pass exceptToken to keep one session alive — used by self-service
// password change so the caller is not logged out of their own session
// while every other (possibly stale) session is revoked.
function revokeSessionsFor(email, exceptToken = null) {
  for (const [token, session] of SESSIONS) {
    if (session.user.email.toLowerCase() === email && token !== exceptToken) SESSIONS.delete(token);
  }
  saveSessions();
}

// Propagate name/role changes into live sessions so a demoted account
// loses admin rights immediately rather than at next login.
function updateSessionsFor(email, fields) {
  for (const session of SESSIONS.values()) {
    if (session.user.email.toLowerCase() === email) Object.assign(session.user, fields);
  }
  saveSessions();
}

// In-memory login throttle: after too many failures for an IP+email pair
// within the window, reject further attempts until the window expires.
const LOGIN_ATTEMPTS = new Map(); // key -> { count, windowStart }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

function loginThrottleKey(req, email) {
  return `${req.ip}|${String(email).toLowerCase()}`;
}

function isLoginThrottled(key) {
  const entry = LOGIN_ATTEMPTS.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    LOGIN_ATTEMPTS.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = LOGIN_ATTEMPTS.get(key);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    LOGIN_ATTEMPTS.set(key, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
  // Lazy cleanup so the map cannot grow unbounded.
  if (LOGIN_ATTEMPTS.size > 10000) {
    for (const [k, e] of LOGIN_ATTEMPTS) {
      if (now - e.windowStart > LOGIN_WINDOW_MS) LOGIN_ATTEMPTS.delete(k);
    }
  }
}

// Periodic sweep of expired sessions and stale throttle entries. Both maps
// are otherwise only pruned when a given entry is next touched, so tokens of
// users who simply never return would accumulate for the life of the process.
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSIONS) {
    if (now > session.expiresAt) SESSIONS.delete(token);
  }
  for (const [key, entry] of LOGIN_ATTEMPTS) {
    if (now - entry.windowStart > LOGIN_WINDOW_MS) LOGIN_ATTEMPTS.delete(key);
  }
  // Also captures the sliding-expiry updates made on each request, so a
  // restart loses at most this interval's worth of session extension.
  saveSessions();
}, 15 * 60 * 1000).unref();

// Null-prototype store so emails can never collide with Object.prototype
// properties ("constructor", "__proto__", ...).
let USERS = Object.create(null);
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Default credentials are defined in plaintext for readability but are
// hashed before they ever touch disk or memory.
function buildDefaultUsers() {
  const defaults = Object.assign(Object.create(null), {
    'admin@simhub.local': {
      email: 'admin@simhub.local',
      password: 'admin123',
      role: 'Admin',
      name: 'Administrator'
    },
    'faculty@simhub.local': {
      email: 'faculty@simhub.local',
      password: 'faculty123',
      role: 'Read-Only',
      name: 'Clinical Faculty'
    }
  });
  const now = new Date().toISOString();
  Object.values(defaults).forEach(u => {
    u.password = hashPasswordSync(u.password);
    u.createdAt = now;
    u.lastLogin = null;
    // Seeded credentials are public knowledge (they ship in this repo), so
    // each account must set its own password before it can use the app.
    u.mustChangePassword = true;
  });
  return defaults;
}

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      USERS = Object.assign(Object.create(null), JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')));
    } catch (e) {
      console.error('Error reading users file, resetting to default:', e);
      USERS = buildDefaultUsers();
      saveUsers();
      return;
    }

    // Migrate any legacy plaintext passwords to hashed form on startup.
    let migrated = false;
    Object.values(USERS).forEach(u => {
      if (!isHashed(u.password)) {
        u.password = hashPasswordSync(u.password);
        migrated = true;
      }
    });
    if (migrated) {
      console.log('Migrated legacy plaintext passwords to hashed storage.');
      saveUsers();
    }
  } else {
    USERS = buildDefaultUsers();
    saveUsers();
  }
}

function saveUsers() {
  writeJsonAtomic(USERS_FILE, USERS);
}

loadUsers();


// Auth middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  const session = SESSIONS.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
  if (Date.now() > session.expiresAt) {
    SESSIONS.delete(token);
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS; // sliding expiry
  req.user = session.user;
  // Accounts on a provisional password (seeded defaults, admin resets,
  // generated temp passwords) may only complete the rotation: everything
  // except the rotation flow itself is blocked server-side, so a known
  // default credential is useless for reading or changing data.
  if (session.user.mustChangePassword &&
      !['/api/me', '/api/me/password', '/api/logout'].includes(req.path)) {
    return res.status(403).json({
      error: 'You must change your password before continuing.',
      mustChangePassword: true
    });
  }
  next();
}

// Admin-only check middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
  }
  next();
}

// --- PROGRAMME-SCOPED AUTHORISATION HELPERS ---

// The session carries a snapshot of role/name; for authorisation decisions we
// read the live record so allocation/role changes take effect immediately.
function getLiveUser(req) {
  return USERS[req.user.email.toLowerCase()];
}

function editorProgrammeIds(user) {
  return Array.isArray(user && user.programmeIds) ? user.programmeIds : [];
}

// Ids of every programme on disk (used to validate allocations).
function existingProgrammeIds() {
  const set = new Set();
  fs.readdirSync(PROGRAMMES_DIR)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(PROGRAMMES_DIR, f), 'utf8'));
        if (p && p.id) set.add(p.id);
      } catch { /* ignore unreadable programme files */ }
    });
  return set;
}

// Keep only well-formed ids that reference an existing programme; dedupe.
function sanitizeProgrammeIds(input) {
  if (!Array.isArray(input)) return [];
  const valid = existingProgrammeIds();
  const out = [];
  for (const raw of input) {
    const id = String(raw);
    if (isValidId(id) && valid.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

// Programme ids whose scenarioIds include the given scenario.
function programmeIdsContainingScenario(scenarioId) {
  const ids = new Set();
  fs.readdirSync(PROGRAMMES_DIR)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(PROGRAMMES_DIR, f), 'utf8'));
        if (Array.isArray(p.scenarioIds) && p.scenarioIds.includes(scenarioId)) ids.add(p.id);
      } catch { /* ignore */ }
    });
  return ids;
}

// An Editor may act on a scenario only if it lives in one of their programmes.
function editorCanEditScenario(user, scenarioId) {
  const mine = editorProgrammeIds(user);
  if (mine.length === 0) return false;
  const containing = programmeIdsContainingScenario(scenarioId);
  return mine.some(id => containing.has(id));
}

// Add a scenario to a programme's scenarioIds (idempotent).
function addScenarioToProgramme(programmeId, scenarioId) {
  if (!isValidId(programmeId)) return;
  const pPath = path.join(PROGRAMMES_DIR, `${programmeId}.json`);
  if (!fs.existsSync(pPath)) return;
  const prog = readJsonSafe(pPath);
  if (!prog) return; // unreadable programme file; don't fail the create
  if (!Array.isArray(prog.scenarioIds)) prog.scenarioIds = [];
  if (!prog.scenarioIds.includes(scenarioId)) {
    prog.scenarioIds.push(scenarioId);
    writeJsonAtomic(pPath, prog);
  }
}

// Middleware for PUT/DELETE on an existing scenario (uses :id). Admins always
// pass; Editors pass only for scenarios in their allocated programmes.
function requireScenarioAccess(req, res, next) {
  const liveUser = getLiveUser(req);
  if (!liveUser) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (liveUser.role === 'Admin') return next();
  if (liveUser.role === 'Editor') {
    if (editorCanEditScenario(liveUser, req.params.id)) return next();
    return res.status(403).json({ error: 'Forbidden. You can only modify scenarios in your allocated programmes.' });
  }
  return res.status(403).json({ error: 'Forbidden. You do not have permission to modify scenarios.' });
}

// --- AUTH ENDPOINTS ---

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const throttleKey = loginThrottleKey(req, email);
  if (isLoginThrottled(throttleKey)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
  }

  try {
    const user = USERS[String(email).toLowerCase()];
    // Always perform one hash verification so response timing does not
    // reveal whether the account exists.
    const ok = await verifyPassword(password, user ? user.password : DUMMY_HASH);
    if (!user || !ok) {
      recordLoginFailure(throttleKey);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Checked only after the password verifies so the disabled state is
    // never revealed to someone who does not hold valid credentials.
    if (user.disabled) {
      return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
    }

    LOGIN_ATTEMPTS.delete(throttleKey);

    // Stamp the successful sign-in. Persist best-effort so a disk hiccup
    // recording a timestamp can never block a valid login.
    user.lastLogin = new Date().toISOString();
    try { saveUsers(); } catch (e) { console.error('Failed to persist lastLogin:', e); }

    const token = createSession(user);

    res.json({
      token,
      user: {
        email: user.email,
        role: user.role,
        name: user.name,
        programmeIds: editorProgrammeIds(user),
        mustChangePassword: !!user.mustChangePassword
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed unexpectedly.' });
  }
});

app.post('/api/logout', authenticate, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader.split(' ')[1];
  SESSIONS.delete(token);
  res.json({ success: true });
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Minimum length for a self-chosen password. Admin-set passwords are not
// constrained, but self-service is a sensible place to enforce a floor.
const MIN_PASSWORD_LENGTH = 8;

// Self-service password change for the currently authenticated user.
// Requires the current password (re-authentication) so a hijacked session
// cannot silently lock out the real owner, and rejects unchanged or
// too-short new passwords. Every other live session for the account is
// revoked on success so an older/leaked session cannot outlive the
// rotation; the caller's own session is preserved.
app.post('/api/me/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
  }

  const email = req.user.email.toLowerCase();
  const user = USERS[email];
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  try {
    const ok = await verifyPassword(currentPassword, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (await verifyPassword(newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different from the current password.' });
    }

    user.password = await hashPassword(newPassword);
    // The account now runs on a password only its owner knows.
    delete user.mustChangePassword;
    saveUsers();

    // Preserve this session, drop all others for the account.
    const currentToken = req.headers['authorization'].split(' ')[1];
    revokeSessionsFor(email, currentToken);
    updateSessionsFor(email, { mustChangePassword: false });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});


// --- SCENARIO ENDPOINTS ---

// List scenarios (brief details for catalog)
app.get('/api/scenarios', authenticate, (req, res) => {
  try {
    const files = fs.readdirSync(SCENARIOS_DIR);
    const scenarios = files
      .filter(file => file.endsWith('.json'))
      .map(file => readJsonSafe(path.join(SCENARIOS_DIR, file)))
      .filter(Boolean)
      .map(data => {
        // Return summary info
        return {
          id: data.id,
          code: data.code,
          title: data.title,
          version: data.version,
          lastReviewed: data.lastReviewed,
          nextReviewDue: data.nextReviewDue || '',
          targetLearners: data.overview?.targetLearners || '',
          modality: data.overview?.modality || '',
          duration: data.overview?.duration || 0,
          summary: data.overview?.summary || '',
          authors: data.authors || ''
        };
      });
    res.json(scenarios);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve scenarios: ' + err.message });
  }
});

// Get detailed scenario
app.get('/api/scenarios/:id', authenticate, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read scenario file' });
  }
});

// Create scenario. Admins create freely; Editors must attach the new scenario
// to one of their allocated programmes (so they retain edit rights over it).
app.post('/api/scenarios', authenticate, (req, res) => {
  const liveUser = getLiveUser(req);
  if (!liveUser || (liveUser.role !== 'Admin' && liveUser.role !== 'Editor')) {
    return res.status(403).json({ error: 'Forbidden. You do not have permission to create scenarios.' });
  }

  const scenario = req.body;
  if (!scenario.title || !scenario.code) {
    return res.status(400).json({ error: 'Scenario title and code are required.' });
  }

  // programmeId is a transient field used only to attach the scenario; it is
  // never persisted on the scenario itself (programmes own the membership).
  const requestedProgrammeId = scenario.programmeId;
  delete scenario.programmeId;

  let targetProgrammeId = null;
  if (liveUser.role === 'Editor') {
    const mine = editorProgrammeIds(liveUser);
    if (!requestedProgrammeId || !mine.includes(requestedProgrammeId)) {
      return res.status(403).json({ error: 'Select one of your allocated programmes for the new scenario.' });
    }
    targetProgrammeId = requestedProgrammeId;
  } else if (requestedProgrammeId && existingProgrammeIds().has(requestedProgrammeId)) {
    // Admins may optionally attach on create too.
    targetProgrammeId = requestedProgrammeId;
  }

  // Generate ID if not provided; validate any client-supplied id.
  if (!scenario.id) {
    scenario.id = `scenario_${Date.now()}`;
  } else if (!isValidId(scenario.id)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }

  const filePath = path.join(SCENARIOS_DIR, `${scenario.id}.json`);

  // Creation must never clobber an existing scenario; updates go via PUT.
  if (fs.existsSync(filePath)) {
    return res.status(409).json({ error: 'A scenario with this id already exists.' });
  }

  try {
    writeJsonAtomic(filePath, scenario);
    if (targetProgrammeId) addScenarioToProgramme(targetProgrammeId, scenario.id);
    res.status(201).json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'Failed to write scenario file: ' + err.message });
  }
});

// Update scenario
app.put('/api/scenarios/:id', authenticate, requireScenarioAccess, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const scenario = req.body;
  delete scenario.programmeId; // transient attach hint; never persisted
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  scenario.id = scenarioId; // Ensure ID matches

  try {
    writeJsonAtomic(filePath, scenario);
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update scenario file: ' + err.message });
  }
});

// Delete scenario (moves to recycle bin)
app.delete('/api/scenarios/:id', authenticate, requireScenarioAccess, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
  const binPath = path.join(RECYCLE_BIN_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.deletedAt = new Date().toISOString();

    writeJsonAtomic(binPath, data);
    fs.unlinkSync(filePath);

    // Also remove scenario from any programmes. Per-file failures are logged
    // and skipped: the scenario has already moved to the recycle bin, so one
    // unreadable programme file must not turn a completed delete into a 500.
    const progFiles = fs.readdirSync(PROGRAMMES_DIR);
    progFiles.filter(file => file.endsWith('.json')).forEach(file => {
      const pPath = path.join(PROGRAMMES_DIR, file);
      const prog = readJsonSafe(pPath);
      if (prog && prog.scenarioIds && prog.scenarioIds.includes(scenarioId)) {
        prog.scenarioIds = prog.scenarioIds.filter(id => id !== scenarioId);
        writeJsonAtomic(pPath, prog);
      }
    });

    res.json({ success: true, movedToRecycleBin: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete scenario: ' + err.message });
  }
});


// --- PROGRAMMES ENDPOINTS ---

// List programmes
app.get('/api/programmes', authenticate, (req, res) => {
  try {
    const files = fs.readdirSync(PROGRAMMES_DIR);
    const programmes = files
      .filter(file => file.endsWith('.json'))
      .map(file => readJsonSafe(path.join(PROGRAMMES_DIR, file)))
      .filter(Boolean);
    res.json(programmes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve programmes: ' + err.message });
  }
});

// Create programme
app.post('/api/programmes', authenticate, requireAdmin, (req, res) => {
  const prog = req.body;
  if (!prog.name) {
    return res.status(400).json({ error: 'Programme name is required.' });
  }

  if (!prog.id) {
    prog.id = `prog_${Date.now()}`;
  } else if (!isValidId(prog.id)) {
    return res.status(400).json({ error: 'Invalid programme id.' });
  }
  if (!prog.scenarioIds) {
    prog.scenarioIds = [];
  }

  const filePath = path.join(PROGRAMMES_DIR, `${prog.id}.json`);

  try {
    writeJsonAtomic(filePath, prog);
    res.status(201).json(prog);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create programme: ' + err.message });
  }
});

// Update programme
app.put('/api/programmes/:id', authenticate, requireAdmin, (req, res) => {
  const progId = req.params.id;
  if (!isValidId(progId)) {
    return res.status(400).json({ error: 'Invalid programme id.' });
  }
  const prog = req.body;
  const filePath = path.join(PROGRAMMES_DIR, `${progId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Programme not found' });
  }

  prog.id = progId; // Ensure ID matches

  try {
    writeJsonAtomic(filePath, prog);
    res.json(prog);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update programme: ' + err.message });
  }
});

// Delete programme
app.delete('/api/programmes/:id', authenticate, requireAdmin, (req, res) => {
  const progId = req.params.id;
  if (!isValidId(progId)) {
    return res.status(400).json({ error: 'Invalid programme id.' });
  }
  const filePath = path.join(PROGRAMMES_DIR, `${progId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Programme not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete programme: ' + err.message });
  }
});


// --- USER ADMINISTRATION ENDPOINTS ---

// List all users
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  try {
    const usersList = Object.values(USERS).map(publicUser);
    res.json(usersList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve users: ' + err.message });
  }
});

// Count of Admin accounts that can actually sign in. Disabled admins do
// not count towards the "at least one Admin must remain" guards.
function activeAdminCount() {
  return Object.values(USERS).filter(u => u.role === 'Admin' && !u.disabled).length;
}

// Create new user
app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { email, password, role, name } = req.body;
  if (!email || !password || !role || !name) {
    return res.status(400).json({ error: 'All fields (email, password, role, name) are required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
  }
  if (USERS[normalizedEmail]) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  USERS[normalizedEmail] = {
    email: normalizedEmail,
    password: await hashPassword(password),
    role,
    name: String(name),
    createdAt: new Date().toISOString(),
    lastLogin: null,
    // Admin-provisioned passwords are provisional: the owner must set their
    // own at first sign-in before the account can do anything else.
    mustChangePassword: true,
    // Allocations only apply to Editors; ignored (empty) for other roles.
    programmeIds: role === 'Editor' ? sanitizeProgrammeIds(req.body.programmeIds) : []
  };

  try {
    saveUsers();
    res.status(201).json(publicUser(USERS[normalizedEmail]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save new user: ' + err.message });
  }
});

// Update user details
app.put('/api/users/:email', authenticate, requireAdmin, async (req, res) => {
  const targetEmail = req.params.email.toLowerCase().trim();
  const { password, role, name } = req.body;

  if (!USERS[targetEmail]) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Password is optional on update: a blank value keeps the existing one.
  if (!role || !name) {
    return res.status(400).json({ error: 'Role and name are required.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
  }

  if (targetEmail === req.user.email.toLowerCase() && role !== 'Admin') {
    return res.status(400).json({ error: 'Demotion prevented. You cannot change your own role from Admin.' });
  }

  // Never allow the last active Admin account to be demoted.
  if (USERS[targetEmail].role === 'Admin' && !USERS[targetEmail].disabled &&
      role !== 'Admin' && activeAdminCount() <= 1) {
    return res.status(400).json({ error: 'Demotion prevented. At least one Admin account must remain.' });
  }

  USERS[targetEmail].name = String(name);
  USERS[targetEmail].role = role;
  // Re-derive allocations from the request; clear them entirely if the user is
  // no longer an Editor so stale grants can't linger.
  USERS[targetEmail].programmeIds = role === 'Editor' ? sanitizeProgrammeIds(req.body.programmeIds) : [];
  const isSelfUpdate = targetEmail === req.user.email.toLowerCase();
  if (password) {
    USERS[targetEmail].password = await hashPassword(password);
    // An admin-reset password is provisional (the admin knows it), so the
    // owner must rotate it at next sign-in and any live sessions the old
    // password opened are revoked. Self-resets are a normal password change.
    if (!isSelfUpdate) {
      USERS[targetEmail].mustChangePassword = true;
      revokeSessionsFor(targetEmail);
    }
  }

  try {
    saveUsers();
    // Live sessions must reflect the change immediately (e.g. demotion or a
    // changed programme allocation gating scenario edits).
    updateSessionsFor(targetEmail, {
      name: USERS[targetEmail].name,
      role,
      programmeIds: USERS[targetEmail].programmeIds
    });
    res.json(publicUser(USERS[targetEmail]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
  }
});

// Delete user
app.delete('/api/users/:email', authenticate, requireAdmin, (req, res) => {
  const targetEmail = req.params.email.toLowerCase().trim();

  if (!USERS[targetEmail]) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (targetEmail === req.user.email.toLowerCase()) {
    return res.status(400).json({ error: 'Self-deletion prevented. You cannot delete your own active account.' });
  }

  // Never allow the last active Admin account to be deleted.
  if (USERS[targetEmail].role === 'Admin' && !USERS[targetEmail].disabled && activeAdminCount() <= 1) {
    return res.status(400).json({ error: 'Deletion prevented. At least one Admin account must remain.' });
  }

  delete USERS[targetEmail];

  try {
    saveUsers();
    revokeSessionsFor(targetEmail);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// Generate a readable temporary password from an unambiguous alphabet.
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const BULK_LIMIT = 200;

// Bulk operations on existing users: set-role, delete, disable or enable.
// The whole batch is validated against the same guards as single-user
// operations (no self role-change/deletion/disable, at least one active
// Admin remains) before anything is written.
const BULK_ACTIONS = ['set-role', 'delete', 'disable', 'enable'];
app.post('/api/users/bulk', authenticate, requireAdmin, (req, res) => {
  const { action, emails, role } = req.body;

  if (!BULK_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Must be one of: ${BULK_ACTIONS.join(', ')}.` });
  }
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > BULK_LIMIT) {
    return res.status(400).json({ error: `Provide between 1 and ${BULK_LIMIT} emails.` });
  }
  if (action === 'set-role' && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
  }

  const selfEmail = req.user.email.toLowerCase();
  const targets = [];
  const skipped = [];

  const SELF_SKIP_REASONS = {
    'delete': 'You cannot delete your own account.',
    'set-role': 'You cannot change your own role.',
    'disable': 'You cannot disable your own account.'
  };

  for (const raw of emails) {
    const email = String(raw).toLowerCase().trim();
    if (!USERS[email]) {
      skipped.push({ email, reason: 'User not found.' });
    } else if (email === selfEmail && SELF_SKIP_REASONS[action]) {
      skipped.push({ email, reason: SELF_SKIP_REASONS[action] });
    } else if (targets.includes(email)) {
      skipped.push({ email, reason: 'Duplicate entry.' });
    } else {
      targets.push(email);
    }
  }

  // Guard: simulate the batch and require at least one active Admin after.
  const adminsAfter = Object.values(USERS).filter(u => {
    const email = u.email.toLowerCase();
    if (targets.includes(email)) {
      if (action === 'delete' || action === 'disable') return false;
      if (action === 'enable') return u.role === 'Admin';
      return role === 'Admin' && !u.disabled;
    }
    return u.role === 'Admin' && !u.disabled;
  }).length;
  if (targets.length > 0 && adminsAfter < 1) {
    return res.status(400).json({ error: 'Operation prevented. At least one Admin account must remain.' });
  }

  try {
    targets.forEach(email => {
      if (action === 'delete') {
        delete USERS[email];
        revokeSessionsFor(email);
      } else if (action === 'disable') {
        USERS[email].disabled = true;
        revokeSessionsFor(email);
      } else if (action === 'enable') {
        delete USERS[email].disabled;
      } else {
        USERS[email].role = role;
        // Bulk role changes can't carry per-user allocations; clear them when
        // the target is no longer an Editor so stale grants don't linger.
        if (role !== 'Editor') USERS[email].programmeIds = [];
        updateSessionsFor(email, { role, programmeIds: USERS[email].programmeIds || [] });
      }
    });
    if (targets.length > 0) saveUsers();
    res.json({ success: true, processed: targets.length, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Bulk operation failed: ' + err.message });
  }
});

// Bulk-create users. Rows without a password get a generated temporary
// password, echoed back exactly once in the response so the admin can
// distribute credentials; supplied passwords are never echoed.
app.post('/api/users/bulk-create', authenticate, requireAdmin, async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0 || users.length > BULK_LIMIT) {
    return res.status(400).json({ error: `Provide between 1 and ${BULK_LIMIT} users.` });
  }

  const created = [];
  const skipped = [];
  const pendingEmails = new Set();

  try {
    for (const row of users) {
      const email = String(row.email || '').toLowerCase().trim();
      const name = String(row.name || '').trim();
      const role = row.role || 'Read-Only';

      if (!isValidEmail(email)) {
        skipped.push({ email: email || '(blank)', reason: 'Invalid email address format.' });
        continue;
      }
      if (USERS[email] || pendingEmails.has(email)) {
        skipped.push({ email, reason: 'A user with this email already exists.' });
        continue;
      }
      if (!name) {
        skipped.push({ email, reason: 'Name is required.' });
        continue;
      }
      if (!VALID_ROLES.includes(role)) {
        skipped.push({ email, reason: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}.` });
        continue;
      }

      const suppliedPassword = typeof row.password === 'string' && row.password.length > 0;
      const password = suppliedPassword ? row.password : generateTempPassword();

      USERS[email] = {
        email,
        password: await hashPassword(password),
        role,
        name,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        // Whether generated or supplied, the password came from an admin,
        // so the owner must set their own at first sign-in.
        mustChangePassword: true,
        // Programme allocations can't be expressed in the paste format; an
        // admin assigns them afterwards via the edit modal.
        programmeIds: []
      };
      pendingEmails.add(email);
      created.push({ email, name, role, tempPassword: suppliedPassword ? null : password });
    }

    if (created.length > 0) saveUsers();
    res.status(created.length > 0 ? 201 : 200).json({ success: true, created, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Bulk create failed: ' + err.message });
  }
});


// --- RECYCLE BIN ENDPOINTS ---

// List deleted scenarios
app.get('/api/recycle-bin', authenticate, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(RECYCLE_BIN_DIR);
    const scenarios = files
      .filter(file => file.endsWith('.json'))
      .map(file => readJsonSafe(path.join(RECYCLE_BIN_DIR, file)))
      .filter(Boolean)
      .map(data => {
        return {
          id: data.id,
          code: data.code,
          title: data.title,
          deletedAt: data.deletedAt || new Date().toISOString(),
          summary: data.overview?.summary || '',
          authors: data.authors || ''
        };
      });
    res.json(scenarios);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve recycle bin: ' + err.message });
  }
});

// Restore scenario from recycle bin
app.post('/api/recycle-bin/:id/restore', authenticate, requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const binPath = path.join(RECYCLE_BIN_DIR, `${scenarioId}.json`);
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(binPath)) {
    return res.status(404).json({ error: 'Scenario not found in recycle bin' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(binPath, 'utf8'));
    delete data.deletedAt;

    writeJsonAtomic(filePath, data);
    fs.unlinkSync(binPath);

    res.json({ success: true, restored: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore scenario: ' + err.message });
  }
});

// Permanently delete scenario from disk
app.delete('/api/recycle-bin/:id', authenticate, requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const binPath = path.join(RECYCLE_BIN_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(binPath)) {
    return res.status(404).json({ error: 'Scenario not found in recycle bin' });
  }

  try {
    fs.unlinkSync(binPath);
    res.json({ success: true, permanentlyDeleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete scenario: ' + err.message });
  }
});


// --- BACKUP ENDPOINTS ---

// Export backups
app.get('/api/backup/export', authenticate, requireAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(SCENARIOS_DIR);
    const scenarios = files
      .filter(file => file.endsWith('.json'))
      .map(file => readJsonSafe(path.join(SCENARIOS_DIR, file)))
      .filter(Boolean);

    const backup = {
      source: 'SimHub',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      scenarios
    };

    const formattedDate = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename=simhub_backup_${formattedDate}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate backup: ' + err.message });
  }
});

// Import backups
app.post('/api/backup/import', authenticate, requireAdmin, (req, res) => {
  const { source, scenarios } = req.body;

  if (source !== 'SimHub' || !Array.isArray(scenarios)) {
    return res.status(400).json({ error: 'Invalid backup file format. Must be a valid SimHub backup.' });
  }

  try {
    let importCount = 0;
    let skipped = 0;
    scenarios.forEach(scenario => {
      if (scenario.id && scenario.title && scenario.code) {
        // Reject any entry whose id could escape the scenarios directory.
        if (!isValidId(scenario.id)) {
          skipped++;
          return;
        }
        const filePath = path.join(SCENARIOS_DIR, `${scenario.id}.json`);
        writeJsonAtomic(filePath, scenario);
        importCount++;
      }
    });

    res.json({ success: true, count: importCount, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import backup: ' + err.message });
  }
});


// Serve Single Page Application for any unmatched route.
// Unknown API paths must return a JSON 404, not the SPA shell.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler of last resort. Without this, body-parser failures (invalid
// JSON, oversized payloads) fall through to Express's default handler, which
// responds with an HTML page — and includes a stack trace outside production.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('Unhandled request error:', err);
  const message = status >= 500 ? 'Internal server error.'
    : err.type === 'entity.too.large' ? 'Request body too large.'
    : 'Invalid request body.';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`SimHub Server running on http://localhost:${PORT}`);
});
