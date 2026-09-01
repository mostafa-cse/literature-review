require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./src/db');
const { checkMaintenanceMode } = require('./src/utils/auth');
const apiRoutes = require('./src/routes/api');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const collaborationRoutes = require('./src/routes/collaborationRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

// Ensure database is initialized
initDb();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Auth & Admin Routes (Independent of general maintenance mode)
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', collaborationRoutes);
app.use('/api', reviewRoutes);

// Maintenance Mode Middleware on general API routes
app.use('/api', checkMaintenanceMode, apiRoutes);

// Static uploads directory & dedicated PDF file serving endpoint
const backendUploads = path.join(__dirname, 'uploads');
if (!fs.existsSync(backendUploads)) {
  fs.mkdirSync(backendUploads, { recursive: true });
}
const rootUploads = path.join(__dirname, '..', 'uploads');

app.get('/uploads/:filename', (req, res) => {
  try {
    const rawFilename = decodeURIComponent(req.params.filename);
    const filename = path.basename(rawFilename);

    // 1. Fetch binary PDF directly from SQLite database paper_files table
    try {
      const { getDb } = require('./src/db');
      const db = getDb();
      const row = db.prepare('SELECT filename, mimetype, file_size, data FROM paper_files WHERE filename = ?').get(filename);
      if (row && row.data) {
        const buffer = Buffer.from(row.data);
        res.setHeader('Content-Type', row.mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(buffer);
      }
    } catch (dbErr) {
      console.warn('DB PDF fetch notice:', dbErr.message);
    }

    // 2. Disk fallback if present
    const fileInBackend = path.join(backendUploads, filename);
    const fileInRoot = path.join(rootUploads, filename);

    if (fs.existsSync(fileInBackend)) {
      return res.sendFile(fileInBackend);
    }
    if (fs.existsSync(fileInRoot)) {
      return res.sendFile(fileInRoot);
    }
    res.status(404).send('Cannot GET uploaded PDF file.');
  } catch (err) {
    res.status(500).send('Error retrieving uploaded PDF file.');
  }
});

app.use('/uploads', express.static(backendUploads));
if (fs.existsSync(rootUploads)) {
  app.use('/uploads', express.static(rootUploads));
}

// Serve Frontend/ directory (fallback to Project/ if needed)
let frontendDir = path.join(__dirname, '..', 'Frontend');
if (!fs.existsSync(frontendDir)) {
  frontendDir = path.join(__dirname, '..', 'Project');
}
app.use(express.static(frontendDir));

// Route mappings for Home Overview, Interactive Workspace, and Admin Control Center
app.get('/', (req, res) => {
  const homeFile = path.join(frontendDir, 'home.html');
  if (fs.existsSync(homeFile)) {
    return res.sendFile(homeFile);
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get(['/home', '/overview'], (req, res) => {
  res.sendFile(path.join(frontendDir, 'home.html'));
});

app.get(['/workspace', '/app', '/matrix'], (req, res) => {
  const wsFile = path.join(frontendDir, 'workspace.html');
  if (fs.existsSync(wsFile)) {
    return res.sendFile(wsFile);
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Dedicated Split-Screen Paper Review & Preview Page
app.get(['/review', '/reader', '/paper-preview'], (req, res) => {
  const reviewFile = path.join(frontendDir, 'review.html');
  if (fs.existsSync(reviewFile)) {
    return res.sendFile(reviewFile);
  }
  res.sendFile(path.join(frontendDir, 'workspace.html'));
});

// React-Powered Dynamic Component-Based Review Page
app.get(['/review-react', '/react-review'], (req, res) => {
  const reactReviewFile = path.join(frontendDir, 'review_react.html');
  if (fs.existsSync(reactReviewFile)) {
    return res.sendFile(reactReviewFile);
  }
  res.sendFile(path.join(frontendDir, 'review.html'));
});

// User Researcher Dashboard Route
app.get(['/dashboard', '/surveys', '/my-surveys', '/projects'], (req, res) => {
  const dashboardFile = path.join(frontendDir, 'dashboard.html');
  if (fs.existsSync(dashboardFile)) {
    return res.sendFile(dashboardFile);
  }
  res.redirect('/workspace');
});

// Admin Control Center Route
app.get(['/admin', '/admin-dashboard', '/control-center'], (req, res) => {
  const adminFile = path.join(frontendDir, 'admin.html');
  if (fs.existsSync(adminFile)) {
    return res.sendFile(adminFile);
  }
  res.redirect('/workspace');
});

// Standalone Authentication (Login / Register) Page Route
app.get(['/login', '/signin', '/register', '/signup', '/auth'], (req, res) => {
  const authFile = path.join(frontendDir, 'auth.html');
  if (fs.existsSync(authFile)) {
    return res.sendFile(authFile);
  }
  res.redirect('/home');
});

// About Page Route
app.get(['/about', '/about-us', '/features'], (req, res) => {
  const aboutFile = path.join(frontendDir, 'about.html');
  if (fs.existsSync(aboutFile)) {
    return res.sendFile(aboutFile);
  }
  res.redirect('/home');
});

// Profile & Account Settings Page Route
app.get(['/profile', '/settings', '/account'], (req, res) => {
  const profileFile = path.join(frontendDir, 'profile.html');
  if (fs.existsSync(profileFile)) {
    return res.sendFile(profileFile);
  }
  res.redirect('/dashboard');
});

// Public / Supervisor Read-Only Share Link Route
app.get('/shared/:token', (req, res) => {
  const wsFile = path.join(frontendDir, 'workspace.html');
  if (fs.existsSync(wsFile)) {
    return res.sendFile(wsFile);
  }
  res.sendFile(path.join(frontendDir, 'index.html'));
});

function startServer(port, maxAttempts = 10) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 LitSphere System running on port ${port}`);
    console.log(`🌐 Home Landing:     http://localhost:${port}`);
    console.log(`📊 Master Workspace: http://localhost:${port}/workspace`);
    console.log(`🛡️ Admin Center:     http://localhost:${port}/admin`);
    console.log(`📚 API Base URL:     http://localhost:${port}/api`);
    console.log(`📁 Frontend Root:    ${frontendDir}`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
      console.warn(`⚠️ Port ${port} is currently in use. Trying port ${port + 1}...`);
      startServer(port + 1, maxAttempts - 1);
    } else {
      console.error('Server error:', err);
    }
  });

  return server;
}

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = app;
