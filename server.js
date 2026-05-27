const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories for persistence
const DATA_DIR = path.join(__dirname, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');
const PROGRAMMES_DIR = path.join(DATA_DIR, 'programmes');

// Ensure directories exist
[DATA_DIR, SCENARIOS_DIR, PROGRAMMES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Token-based Auth System
const SESSIONS = new Map(); // token -> user details

const USERS = {
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
  if (!user || user.password !== password) {
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

  // Generate ID if not provided
  if (!scenario.id) {
    scenario.id = `scenario_${Date.now()}`;
  }

  const filePath = path.join(SCENARIOS_DIR, `${scenario.id}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf8');
    res.status(210).json(scenario);
  } catch (err) {
    res.status(500).json({ error: 'Failed to write scenario file: ' + err.message });
  }
});

// Update scenario
app.put('/api/scenarios/:id', authenticate, requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
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

// Delete scenario
app.delete('/api/scenarios/:id', authenticate, requireAdmin, (req, res) => {
  const scenarioId = req.params.id;
  const filePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  try {
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

    res.json({ success: true });
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


// Serve Single Page Application for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SimHub Server running on http://localhost:${PORT}`);
});
