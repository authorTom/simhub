const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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

const VALID_ROLES = ['Admin', 'Read-Only'];

// Restrict identifiers used to build filesystem paths to a safe charset.
// Prevents path traversal (e.g. "../../server") via client-supplied ids.
const VALID_ID = /^[A-Za-z0-9_-]+$/;
function isValidId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && VALID_ID.test(id);
}

// Strip the password field before sending a user object to the client.
function publicUser(u) {
  return { email: u.email, name: u.name, role: u.role };
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

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, {
    user: { email: user.email, role: user.role, name: user.name },
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

// Drop every live session belonging to an email (account deleted).
function revokeSessionsFor(email) {
  for (const [token, session] of SESSIONS) {
    if (session.user.email.toLowerCase() === email) SESSIONS.delete(token);
  }
}

// Propagate name/role changes into live sessions so a demoted account
// loses admin rights immediately rather than at next login.
function updateSessionsFor(email, fields) {
  for (const session of SESSIONS.values()) {
    if (session.user.email.toLowerCase() === email) Object.assign(session.user, fields);
  }
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
  Object.values(defaults).forEach(u => { u.password = hashPasswordSync(u.password); });
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
  fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8');
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
  next();
}

// Admin-only check middleware
function requireAdmin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
  }
  next();
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

    LOGIN_ATTEMPTS.delete(throttleKey);
    const token = createSession(user);

    res.json({
      token,
      user: {
        email: user.email,
        role: user.role,
        name: user.name
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


// --- SCENARIO ENDPOINTS ---

// List scenarios (brief details for catalog)
app.get('/api/scenarios', authenticate, (req, res) => {
  try {
    const files = fs.readdirSync(SCENARIOS_DIR);
    const scenarios = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(SCENARIOS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

// Create scenario
app.post('/api/scenarios', authenticate, requireAdmin, (req, res) => {
  const scenario = req.body;
  if (!scenario.title || !scenario.code) {
    return res.status(400).json({ error: 'Scenario title and code are required.' });
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
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
    res.status(201).json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'Failed to write scenario file: ' + err.message });
  }
});

// Update scenario
app.put('/api/scenarios/:id', authenticate, requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  if (!isValidId(scenarioId)) {
    return res.status(400).json({ error: 'Invalid scenario id.' });
  }
  const scenario = req.body;
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  scenario.id = scenarioId; // Ensure ID matches

  try {
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
    res.json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update scenario file: ' + err.message });
  }
});

// Delete scenario (moves to recycle bin)
app.delete('/api/scenarios/:id', authenticate, requireAdmin, (req, res) => {
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

    fs.writeFileSync(binPath, JSON.stringify(data, null, 2), 'utf8');
    fs.unlinkSync(filePath);
    
    // Also remove scenario from any programmes
    const progFiles = fs.readdirSync(PROGRAMMES_DIR);
    progFiles.filter(file => file.endsWith('.json')).forEach(file => {
      const pPath = path.join(PROGRAMMES_DIR, file);
      const prog = JSON.parse(fs.readFileSync(pPath, 'utf8'));
      if (prog.scenarioIds && prog.scenarioIds.includes(scenarioId)) {
        prog.scenarioIds = prog.scenarioIds.filter(id => id !== scenarioId);
        fs.writeFileSync(pPath, JSON.stringify(prog, null, 2), 'utf8');
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
      .map(file => {
        const filePath = path.join(PROGRAMMES_DIR, file);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      });
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
    fs.writeFileSync(filePath, JSON.stringify(prog, null, 2), 'utf8');
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
    fs.writeFileSync(filePath, JSON.stringify(prog, null, 2), 'utf8');
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

// Count of Admin accounts currently on record.
function adminCount() {
  return Object.values(USERS).filter(u => u.role === 'Admin').length;
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
    name: String(name)
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

  // Never allow the last Admin account to be demoted.
  if (USERS[targetEmail].role === 'Admin' && role !== 'Admin' && adminCount() <= 1) {
    return res.status(400).json({ error: 'Demotion prevented. At least one Admin account must remain.' });
  }

  USERS[targetEmail].name = String(name);
  USERS[targetEmail].role = role;
  if (password) {
    USERS[targetEmail].password = await hashPassword(password);
  }

  try {
    saveUsers();
    // Live sessions must reflect the change immediately (e.g. demotion).
    updateSessionsFor(targetEmail, { name: USERS[targetEmail].name, role });
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

  // Never allow the last Admin account to be deleted.
  if (USERS[targetEmail].role === 'Admin' && adminCount() <= 1) {
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

// Bulk operations on existing users: set-role or delete.
// The whole batch is validated against the same guards as single-user
// operations (no self role-change/deletion, at least one Admin remains)
// before anything is written.
app.post('/api/users/bulk', authenticate, requireAdmin, (req, res) => {
  const { action, emails, role } = req.body;

  if (!['set-role', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be "set-role" or "delete".' });
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

  for (const raw of emails) {
    const email = String(raw).toLowerCase().trim();
    if (!USERS[email]) {
      skipped.push({ email, reason: 'User not found.' });
    } else if (email === selfEmail) {
      skipped.push({ email, reason: action === 'delete' ? 'You cannot delete your own account.' : 'You cannot change your own role.' });
    } else if (targets.includes(email)) {
      skipped.push({ email, reason: 'Duplicate entry.' });
    } else {
      targets.push(email);
    }
  }

  // Guard: simulate the batch and require at least one Admin afterwards.
  const adminsAfter = Object.values(USERS).filter(u => {
    const email = u.email.toLowerCase();
    if (targets.includes(email)) {
      if (action === 'delete') return false;
      return role === 'Admin';
    }
    return u.role === 'Admin';
  }).length;
  if (targets.length > 0 && adminsAfter < 1) {
    return res.status(400).json({ error: 'Operation prevented. At least one Admin account must remain.' });
  }

  try {
    targets.forEach(email => {
      if (action === 'delete') {
        delete USERS[email];
        revokeSessionsFor(email);
      } else {
        USERS[email].role = role;
        updateSessionsFor(email, { role });
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
        name
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
      .map(file => {
        const filePath = path.join(RECYCLE_BIN_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
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
      .map(file => {
        const filePath = path.join(SCENARIOS_DIR, file);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      });

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
        fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
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

app.listen(PORT, () => {
  console.log(`SimHub Server running on http://localhost:${PORT}`);
});
