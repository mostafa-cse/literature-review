const crypto = require('crypto');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'litnexis_super_secure_academic_research_secret_key_2026';

function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    username: user.username || (user.email ? user.email.split('@')[0] : ''),
    name: user.name,
    email: user.email,
    role: user.role || 'user',
    institution: user.institution || '',
    v: user.token_version || 1,
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
  })).toString('base64url');

  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return data;
  } catch (e) {
    return null;
  }
}

function recalculateUserStorage(userId) {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT 
        COALESCE(SUM(pf.file_size), 0) AS total_bytes,
        COUNT(DISTINCT pf.id) AS total_files,
        COUNT(DISTINCT p.id) AS total_papers
      FROM papers p
      JOIN projects pr ON p.project_id = pr.id
      LEFT JOIN paper_files pf ON pf.paper_id = p.id
      WHERE pr.owner_id = ?
    `).get(userId);

    const totalBytes = stats ? stats.total_bytes : 0;
    const totalMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

    db.prepare("UPDATE users SET storage_used_mb = ? WHERE id = ?").run(totalMb, userId);
    return {
      total_bytes: totalBytes,
      total_mb: totalMb,
      total_files: stats ? stats.total_files : 0,
      total_papers: stats ? stats.total_papers : 0
    };
  } catch (e) {
    console.warn('Error recalculating user storage:', e.message);
    return { total_bytes: 0, total_mb: 0, total_files: 0, total_papers: 0 };
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired authentication session. Please sign in again.' });
  }

  // Check user status in database (ensure not banned/deactivated)
  try {
    const db = getDb();
    const user = db.prepare("SELECT id, username, name, email, role, institution, bio, orcid, google_scholar, phone, avatar_url, token_version, status, ai_token_quota, ai_tokens_used, storage_quota_mb, storage_used_mb, created_at, last_login FROM users WHERE id = ?").get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.status === 'deactivated' || user.status === 'banned') {
      return res.status(403).json({ error: `Account has been ${user.status}. Please contact the laboratory administrator.` });
    }
    if (payload.v !== undefined && user.token_version && payload.v < user.token_version) {
      return res.status(401).json({ error: 'Session has been revoked or expired. Please sign in again.' });
    }
    if (!user.username && user.email) {
      user.username = user.email.split('@')[0];
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(500).json({ error: 'Authentication verification failure.' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()) : null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      try {
        const db = getDb();
        const user = db.prepare("SELECT id, username, name, email, role, institution, status FROM users WHERE id = ?").get(payload.id);
        if (user && user.status === 'active') {
          if (!user.username && user.email) {
            user.username = user.email.split('@')[0];
          }
          req.user = user;
        }
      } catch (e) {}
    }
  }
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (Array.isArray(allowedRoles) && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access Denied. Role '${req.user.role}' is not authorized to access this resource. Required: ${allowedRoles.join(', ')}`
      });
    }
    next();
  };
}

function checkMaintenanceMode(req, res, next) {
  // Allow auth endpoints and public endpoints through
  const fullPath = (req.baseUrl || '') + req.path;
  if (fullPath.startsWith('/api/auth') || fullPath.startsWith('/api/public') || fullPath.startsWith('/public')) {
    return next();
  }

  try {
    const db = getDb();
    const modeSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'").get();
    const isMaintenance = modeSetting && modeSetting.value === 'true';

    if (isMaintenance) {
      // Check if user is logged in as admin
      const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
      const token = authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()) : null;
      if (token) {
        const payload = verifyToken(token);
        if (payload && payload.role === 'admin') {
          return next(); // Admins bypass maintenance mode
        }
      }

      const msgSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_message'").get();
      const message = (msgSetting && msgSetting.value) || 'LitNexis is undergoing scheduled maintenance.';
      return res.status(503).json({
        error: 'System Under Maintenance',
        message: message,
        maintenance_active: true
      });
    }
  } catch (err) {
    console.error('Maintenance check error:', err);
  }
  next();
}

function logAuditEvent(req, action, details = '', status = 'SUCCESS', userId = null, userEmail = null) {
  try {
    const db = getDb();
    const uId = userId || (req && req.user ? req.user.id : null);
    const uEmail = userEmail || (req && req.user ? req.user.email : 'system@litnexis.local');
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_email, action, ip_address, details, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uId, uEmail, action, ip, details, status);
  } catch (err) {
    console.warn('Audit log write error:', err.message);
  }
}

function getProjectRole(userId, projectId) {
  if (!userId || !projectId) return 'viewer';
  try {
    const db = getDb();
    // 1. Platform admin gets owner permissions everywhere
    const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
    if (user && user.role === 'admin') return 'owner';

    // 2. Check if direct project owner
    const project = db.prepare("SELECT owner_id FROM projects WHERE id = ?").get(projectId);
    if (project && project.owner_id === userId) return 'owner';

    // 3. Check project_members table
    const member = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
    if (member && member.role) return member.role;

    return 'viewer';
  } catch (err) {
    console.error('getProjectRole error:', err);
    return 'viewer';
  }
}

function requireProjectRole(allowedRoles) {
  return (req, res, next) => {
    const projectId = req.params.projectId || req.params.project_id || req.params.id || req.query.project_id || req.body.project_id;

    if (!req.user) {
      if (allowedRoles.includes('viewer')) {
        req.projectRole = 'viewer';
        return next();
      }
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!projectId) {
      return next();
    }

    const role = getProjectRole(req.user.id, projectId);
    req.projectRole = role;

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Access Denied. Your project role '${role}' is not authorized to perform this operation. Required: ${allowedRoles.join(', ')}`,
        current_role: role,
        required_roles: allowedRoles
      });
    }

    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  optionalAuth,
  requireRole,
  getProjectRole,
  requireProjectRole,
  checkMaintenanceMode,
  logAuditEvent,
  recalculateUserStorage
};
