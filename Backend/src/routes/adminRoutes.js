const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const { getDb, hashPassword, DB_PATH } = require('../db');
const { authenticateToken, requireRole, logAuditEvent } = require('../utils/auth');

// Protect admin routes with admin role enforcement, while permitting localhost introspection for development
const adminAuthMiddleware = (req, res, next) => {
  const isDbRoute = req.path.startsWith('/db-schema') || req.path.startsWith('/db-table') || req.path.startsWith('/db-query');
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

  if (isDbRoute && isLocal) {
    return next();
  }

  return authenticateToken(req, res, () => {
    requireRole(['admin'])(req, res, next);
  });
};

router.use(adminAuthMiddleware);

// ==========================================
// 1. USER & SEAT MANAGEMENT
// ==========================================

// GET /api/admin/users - List all users with statistics
router.get('/users', (req, res) => {
  const { search, role, status } = req.query;
  const db = getDb();

  try {
    let query = `
      SELECT id, username, name, email, role, institution, status, 
             ai_token_quota, ai_tokens_used, storage_quota_mb, storage_used_mb, 
             created_at, last_login,
             (SELECT count(*) FROM projects WHERE projects.owner_id = users.id) as project_count
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += " AND (name LIKE ? OR email LIKE ? OR username LIKE ? OR institution LIKE ?)";
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s);
    }
    if (role && role !== 'all') {
      query += " AND role = ?";
      params.push(role);
    }
    if (status && status !== 'all') {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY id DESC";

    const rawUsers = db.prepare(query).all(...params);
    const users = rawUsers.map(u => ({
      ...u,
      username: u.username || (u.email ? u.email.split('@')[0] : 'user')
    }));

    // Summary counts
    const totalUsers = db.prepare("SELECT count(*) as count FROM users").get().count;
    const activeUsers = db.prepare("SELECT count(*) as count FROM users WHERE status = 'active'").get().count;
    const totalTokensUsed = db.prepare("SELECT sum(ai_tokens_used) as total FROM users").get().total || 0;

    res.json({
      users,
      summary: {
        total_users: totalUsers,
        active_users: activeUsers,
        total_tokens_used: totalTokensUsed
      }
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Failed to retrieve users: ' + err.message });
  }
});

// POST /api/admin/users - Admin creates new user
router.post('/users', (req, res) => {
  const { name, email, password, role, institution, ai_token_quota, storage_quota_mb } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const db = getDb();

  try {
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const passwordHash = hashPassword(password);
    const validRole = ['admin', 'user', 'reviewer', 'supervisor'].includes(role) ? role : 'user';
    const tokenQuota = parseInt(ai_token_quota, 10) || 100000;
    const storageQuota = parseInt(storage_quota_mb, 10) || 500;

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(name.trim(), cleanEmail, passwordHash, validRole, institution ? institution.trim() : 'Academic Research Institute', tokenQuota, storageQuota);

    logAuditEvent(req, 'ADMIN_USER_CREATE', `Created user: ${cleanEmail} (Role: ${validRole})`, 'SUCCESS');

    res.status(201).json({
      message: 'User created successfully.',
      user_id: Number(result.lastInsertRowid)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user: ' + err.message });
  }
});

// PUT /api/admin/users/:id or /api/admin/users/:id/quota - Update user details, role, status, quotas
router.put(['/users/:id', '/users/:id/quota'], (req, res) => {
  const { id } = req.params;
  const { name, role, institution, status, ai_token_quota, storage_quota_mb, new_password } = req.body;
  const db = getDb();

  try {
    const user = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let query = "UPDATE users SET ";
    const updates = [];
    const params = [];

    if (name) { updates.push("name = ?"); params.push(name.trim()); }
    if (role && ['admin', 'user', 'reviewer', 'supervisor'].includes(role)) {
      updates.push("role = ?"); params.push(role);
    }
    if (institution) { updates.push("institution = ?"); params.push(institution.trim()); }
    if (status && ['active', 'deactivated', 'banned'].includes(status)) {
      updates.push("status = ?"); params.push(status);
    }
    if (ai_token_quota !== undefined) {
      updates.push("ai_token_quota = ?"); params.push(parseInt(ai_token_quota, 10));
    }
    if (storage_quota_mb !== undefined) {
      updates.push("storage_quota_mb = ?"); params.push(parseInt(storage_quota_mb, 10));
    }
    if (new_password && new_password.trim()) {
      updates.push("password_hash = ?"); params.push(hashPassword(new_password.trim()));
    }

    if (updates.length > 0) {
      query += updates.join(', ') + " WHERE id = ?";
      params.push(id);
      db.prepare(query).run(...params);
      logAuditEvent(req, 'ADMIN_USER_UPDATE', `Updated user ID ${id} (${user.email})`, 'SUCCESS');
    }

    const updatedUser = db.prepare("SELECT id, username, name, email, role, institution, status, ai_token_quota, ai_tokens_used, storage_quota_mb, storage_used_mb FROM users WHERE id = ?").get(id);

    res.json({
      message: 'User updated successfully.',
      user: updatedUser
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
  }
});

// DELETE /api/admin/users/:id - Cascading delete user
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  try {
    const user = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own active administrator account.' });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(id);

    logAuditEvent(req, 'ADMIN_USER_DELETE', `Deleted user ID ${id} (${user.email})`, 'SUCCESS');

    res.json({ message: `User ${user.email} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// ==========================================
// 2. SYSTEM HEALTH & TELEMETRY
// ==========================================

// GET /api/admin/system/health - Live server telemetry metrics
router.get('/system/health', (req, res) => {
  const db = getDb();

  try {
    const memUsage = process.memoryUsage();
    let dbSizeBytes = 0;
    let walSizeBytes = 0;

    try {
      if (fs.existsSync(DB_PATH)) {
        dbSizeBytes = fs.statSync(DB_PATH).size;
      }
      const walPath = DB_PATH + '-wal';
      if (fs.existsSync(walPath)) {
        walSizeBytes = fs.statSync(walPath).size;
      }
    } catch (e) {}

    const totalProjects = db.prepare("SELECT count(*) as count FROM projects").get().count;
    const totalPapers = db.prepare("SELECT count(*) as count FROM papers").get().count;
    const totalClusters = db.prepare("SELECT count(*) as count FROM clusters").get().count;
    const totalValues = db.prepare("SELECT count(*) as count FROM paper_column_values").get().count;
    const totalUsers = db.prepare("SELECT count(*) as count FROM users").get().count;
    const totalLogs = db.prepare("SELECT count(*) as count FROM audit_logs").get().count;

    const maintSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'").get();
    const isMaintenance = maintSetting && maintSetting.value === 'true';

    res.json({
      status: 'OPERATIONAL',
      uptime_seconds: Math.floor(process.uptime()),
      maintenance_mode: isMaintenance,
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss
      },
      db_counts: {
        users: totalUsers,
        projects: totalProjects,
        clusters: totalClusters,
        papers: totalPapers,
        column_values: totalValues,
        audit_logs: totalLogs
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpu_cores: os.cpus().length,
        total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
        free_memory_mb: Math.round(os.freemem() / 1024 / 1024)
      },
      process_memory: {
        rss_mb: (memUsage.rss / 1024 / 1024).toFixed(2),
        heap_used_mb: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heap_total_mb: (memUsage.heapTotal / 1024 / 1024).toFixed(2)
      },
      database: {
        engine: 'SQLite WAL (DatabaseSync Node.js v22+)',
        db_size_mb: (dbSizeBytes / 1024 / 1024).toFixed(2),
        wal_size_mb: (walSizeBytes / 1024 / 1024).toFixed(2),
        counts: {
          users: totalUsers,
          projects: totalProjects,
          clusters: totalClusters,
          papers: totalPapers,
          column_values: totalValues,
          audit_logs: totalLogs
        }
      },
      node_version: process.version
    });
  } catch (err) {
    res.status(500).json({ error: 'Telemetry retrieval failed: ' + err.message });
  }
});

// POST /api/admin/system/maintenance - Toggle maintenance mode directly
router.post('/system/maintenance', (req, res) => {
  const { enabled, message } = req.body;
  const db = getDb();
  try {
    const isMaint = enabled === true || enabled === 'true' || enabled === '1' || enabled === 1;
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('maintenance_mode', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(isMaint ? 'true' : 'false');

    if (message) {
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('maintenance_message', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(String(message));
    }

    logAuditEvent(req, 'MAINTENANCE_TOGGLE', `Maintenance mode set to ${isMaint ? 'ENABLED' : 'DISABLED'}`, isMaint ? 'WARNING' : 'SUCCESS');
    res.json({
      success: true,
      maintenance_mode: isMaint,
      message: `Maintenance mode ${isMaint ? 'ENABLED' : 'DISABLED'}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle maintenance mode: ' + err.message });
  }
});

// ==========================================
// 3. SYSTEM SETTINGS & MAINTENANCE MODE
// ==========================================

// GET /api/admin/system/settings - Retrieve settings
router.get('/system/settings', (req, res) => {
  const db = getDb();

  try {
    const rows = db.prepare("SELECT key, value, updated_at FROM system_settings").all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });

    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve system settings: ' + err.message });
  }
});

// PUT /api/admin/system/settings - Update settings & maintenance mode toggle
router.put('/system/settings', (req, res) => {
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Settings key-value payload required.' });
  }

  const db = getDb();

  try {
    const updateStmt = db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    Object.entries(settings).forEach(([k, v]) => {
      updateStmt.run(k, String(v));
    });

    if (settings.maintenance_mode !== undefined) {
      logAuditEvent(req, 'MAINTENANCE_TOGGLE', `Maintenance mode changed to: ${settings.maintenance_mode}`, 'WARNING');
    } else {
      logAuditEvent(req, 'ADMIN_SETTINGS_UPDATE', `Updated ${Object.keys(settings).length} settings`, 'SUCCESS');
    }

    res.json({ message: 'System settings updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update system settings: ' + err.message });
  }
});

// ==========================================
// 4. GLOBAL TAXONOMY & MASTER TEMPLATES
// ==========================================

// GET /api/admin/templates - List master templates
router.get('/templates', (req, res) => {
  const db = getDb();
  try {
    const templates = db.prepare("SELECT id, name, category, description, clusters_json, created_at FROM master_templates ORDER BY id ASC").all();
    const parsed = templates.map(t => ({
      ...t,
      clusters: JSON.parse(t.clusters_json || '[]')
    }));
    res.json({ templates: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve templates: ' + err.message });
  }
});

// POST /api/admin/templates - Create new master template
router.post('/templates', (req, res) => {
  const { name, category, description, clusters } = req.body;

  if (!name || !category || !clusters) {
    return res.status(400).json({ error: 'Template name, category, and clusters definition are required.' });
  }

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO master_templates (name, category, description, clusters_json)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), category.trim(), description || '', JSON.stringify(clusters));

    logAuditEvent(req, 'ADMIN_TEMPLATE_CREATE', `Created master template: ${name}`, 'SUCCESS');

    res.status(201).json({
      message: 'Master template created successfully.',
      id: Number(result.lastInsertRowid)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template: ' + err.message });
  }
});

// DELETE /api/admin/templates/:id - Delete a master template
router.delete('/templates/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  try {
    const t = db.prepare("SELECT id, name FROM master_templates WHERE id = ?").get(id);
    if (!t) return res.status(404).json({ error: 'Template not found.' });

    db.prepare("DELETE FROM master_templates WHERE id = ?").run(id);
    logAuditEvent(req, 'ADMIN_TEMPLATE_DELETE', `Deleted template ID ${id} (${t.name})`, 'SUCCESS');
    res.json({ message: `Template "${t.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template: ' + err.message });
  }
});

// ==========================================
// 5. GLOBAL SURVEY PROJECTS OVERSIGHT
// ==========================================

// GET /api/admin/projects - List all systematic review projects across platform
router.get('/projects', (req, res) => {
  const { search } = req.query;
  const db = getDb();

  try {
    let query = `
      SELECT p.id, p.name, p.description, p.domain, p.is_public, p.share_token, p.owner_id, p.created_at,
             u.name as owner_name, u.email as owner_email,
             (SELECT count(*) FROM papers WHERE papers.project_id = p.id) as paper_count,
             (SELECT count(*) FROM clusters WHERE clusters.project_id = p.id) as cluster_count
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
    `;
    const params = [];

    if (search && search.trim()) {
      query += ` WHERE (p.name LIKE ? OR p.description LIKE ? OR p.domain LIKE ? OR u.name LIKE ? OR u.email LIKE ?) `;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ` ORDER BY p.id DESC LIMIT 100`;

    const projects = db.prepare(query).all(...params);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve projects: ' + err.message });
  }
});

// DELETE /api/admin/projects/:id - Admin cascading delete project
router.delete('/projects/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  try {
    const project = db.prepare("SELECT id, name FROM projects WHERE id = ?").get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Cascading deletion
    db.prepare("DELETE FROM paper_column_values WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM prisma_screenings WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM comments WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM papers WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM clusters WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM dynamic_columns WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM project_members WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);

    logAuditEvent(req, 'ADMIN_PROJECT_DELETE', `Admin purged project ID ${id} (${project.name})`, 'WARNING');

    res.json({ message: `Project "${project.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project: ' + err.message });
  }
});

// ==========================================
// 6. AUDIT LOGS & SECURITY GOVERNANCE
// ==========================================

// GET /api/admin/audit-logs - Stream recent audit logs
router.get('/audit-logs', (req, res) => {
  const { action, status, limit = 50 } = req.query;
  const db = getDb();

  try {
    let query = "SELECT id, user_id, user_email, action, ip_address, details, status, created_at FROM audit_logs WHERE 1=1";
    const params = [];

    if (action && action !== 'all') {
      query += " AND action = ?";
      params.push(action);
    }
    if (status && status !== 'all') {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY id DESC LIMIT ?";
    params.push(parseInt(limit, 10) || 50);

    const logs = db.prepare(query).all(...params);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve audit logs: ' + err.message });
  }
});

// ==========================================
// 7. DATABASE SCHEMA & STRUCTURE INTROSPECTION
// ==========================================

// GET /api/admin/db-schema - Inspect full SQLite schema, tables, columns, indexes & row counts
router.get('/db-schema', (req, res) => {
  const db = getDb();
  try {
    const rawTables = db.prepare(`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' 
      ORDER BY name
    `).all();

    const tables = rawTables.map(t => {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
      const columns = db.prepare(`PRAGMA table_info(${t.name})`).all();
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${t.name})`).all();
      const indexes = db.prepare(`PRAGMA index_list(${t.name})`).all();

      return {
        table_name: t.name,
        row_count: countResult ? countResult.count : 0,
        column_count: columns.length,
        columns: columns.map(c => ({
          cid: c.cid,
          name: c.name,
          type: c.type,
          notnull: c.notnull === 1,
          default_value: c.dflt_value,
          pk: c.pk === 1
        })),
        foreign_keys: foreignKeys.map(fk => ({
          id: fk.id,
          seq: fk.seq,
          table: fk.table,
          from: fk.from,
          to: fk.to,
          on_update: fk.on_update,
          on_delete: fk.on_delete
        })),
        indexes: indexes.map(idx => ({
          name: idx.name,
          unique: idx.unique === 1,
          origin: idx.origin,
          partial: idx.partial === 1
        })),
        ddl_sql: t.sql
      };
    });

    const dbStats = {
      database_file: 'literature.db',
      journal_mode: 'WAL',
      total_tables: tables.length,
      total_rows: tables.reduce((acc, curr) => acc + curr.row_count, 0),
      tables
    };

    res.json(dbStats);
  } catch (err) {
    console.error('Failed to introspect db schema:', err);
    res.status(500).json({ error: 'Failed to inspect database schema: ' + err.message });
  }
});

// GET /api/admin/db-table/:tableName - Fetch columns and paginated rows of a table
router.get('/db-table/:tableName', (req, res) => {
  const { tableName } = req.params;
  const { page = 1, limit = 50, search = '' } = req.query;
  const db = getDb();

  try {
    // Validate table name against sqlite_master to prevent SQL injection
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%'").get(tableName);
    if (!tableExists) {
      return res.status(404).json({ error: `Table "${tableName}" not found.` });
    }

    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const totalRows = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const pLimit = Math.min(200, Math.max(1, parseInt(limit, 10)));

    let rowsQuery = `SELECT * FROM ${tableName}`;
    const params = [];

    if (search && search.trim()) {
      const textCols = columns.filter(c => c.type.toUpperCase().includes('TEXT') || c.type.toUpperCase().includes('CHAR')).map(c => c.name);
      if (textCols.length > 0) {
        const whereClause = textCols.map(col => `${col} LIKE ?`).join(' OR ');
        rowsQuery += ` WHERE ${whereClause}`;
        textCols.forEach(() => params.push(`%${search.trim()}%`));
      }
    }

    rowsQuery += ` LIMIT ? OFFSET ?`;
    params.push(pLimit, offset);

    const rows = db.prepare(rowsQuery).all(...params);

    res.json({
      table_name: tableName,
      columns,
      total_rows: totalRows,
      page: parseInt(page, 10),
      limit: pLimit,
      total_pages: Math.ceil(totalRows / pLimit),
      rows
    });
  } catch (err) {
    console.error(`Failed to fetch table ${tableName}:`, err);
    res.status(500).json({ error: `Failed to fetch table ${tableName}: ` + err.message });
  }
});

// POST /api/admin/db-query - Execute read-only SQL query
router.post('/db-query', (req, res) => {
  const { query } = req.body;
  const db = getDb();

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'SQL query string is required.' });
  }

  const trimmed = query.trim();
  const normalized = trimmed.toUpperCase();

  // Safety: Only permit read-only queries (SELECT, PRAGMA, EXPLAIN)
  const isReadOnly = normalized.startsWith('SELECT') || normalized.startsWith('PRAGMA') || normalized.startsWith('EXPLAIN') || normalized.startsWith('WITH');
  if (!isReadOnly) {
    return res.status(403).json({ error: 'Only read-only SQL statements (SELECT, PRAGMA, EXPLAIN, WITH) are permitted in the web database explorer.' });
  }

  try {
    const startTime = Date.now();
    const rows = db.prepare(trimmed).all();
    const durationMs = Date.now() - startTime;

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({
      query: trimmed,
      execution_time_ms: durationMs,
      row_count: rows.length,
      columns,
      rows
    });
  } catch (err) {
    res.status(400).json({ error: 'SQL Execution Error: ' + err.message });
  }
});

module.exports = router;
