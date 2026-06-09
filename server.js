const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security helpers ---

// Hash a plaintext password using scrypt with a per-user random salt.
// Format: scrypt$<saltHex>$<hashHex>
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

// Constant-time password verification. Transparently supports legacy
// plaintext records (pre-migration) so existing accounts keep working.
function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  if (!isHashed(stored)) {
    return stored === plain;
  }
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const hashBuf = Buffer.from(hash, 'hex');
  const derivedBuf = Buffer.from(derived, 'hex');
  if (hashBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, derivedBuf);
}

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
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple Token-based Auth System
const SESSIONS = new Map(); // token -> user details

let USERS = {};
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Default credentials are defined in plaintext for readability but are
// hashed before they ever touch disk or memory.
function buildDefaultUsers() {
  const defaults = {
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
  };
  Object.values(defaults).forEach(u => { u.password = hashPassword(u.password); });
  return defaults;
}

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      USERS = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
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
        u.password = hashPassword(u.password);
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
  const user = SESSIONS.get(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Invalid or expired token.' });
  }
  req.user = user;
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

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = USERS[email.toLowerCase()];
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Generate a simple token
  const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  SESSIONS.set(token, {
    email: user.email,
    role: user.role,
    name: user.name
  });

  res.json({
    token,
    user: {
      email: user.email,
      role: user.role,
      name: user.name
    }
  });
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

// Create new user
app.post('/api/users', authenticate, requireAdmin, (req, res) => {
  const { email, password, role, name } = req.body;
  if (!email || !password || !role || !name) {
    return res.status(400).json({ error: 'All fields (email, password, role, name) are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (USERS[normalizedEmail]) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  USERS[normalizedEmail] = {
    email: normalizedEmail,
    password: hashPassword(password),
    role,
    name
  };

  try {
    saveUsers();
    res.status(201).json(publicUser(USERS[normalizedEmail]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save new user: ' + err.message });
  }
});

// Update user details
app.put('/api/users/:email', authenticate, requireAdmin, (req, res) => {
  const targetEmail = req.params.email.toLowerCase().trim();
  const { password, role, name } = req.body;

  if (!USERS[targetEmail]) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Password is optional on update: a blank value keeps the existing one.
  if (!role || !name) {
    return res.status(400).json({ error: 'Role and name are required.' });
  }

  if (targetEmail === req.user.email.toLowerCase() && role !== 'Admin') {
    return res.status(400).json({ error: 'Demotion prevented. You cannot change your own role from Admin.' });
  }

  USERS[targetEmail].name = name;
  USERS[targetEmail].role = role;
  if (password) {
    USERS[targetEmail].password = hashPassword(password);
  }

  try {
    saveUsers();
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

  delete USERS[targetEmail];

  try {
    saveUsers();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
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


// Serve Single Page Application for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SimHub Server running on http://localhost:${PORT}`);
});
