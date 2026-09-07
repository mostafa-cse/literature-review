const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db');
const { authenticateToken, getProjectRole, logAuditEvent } = require('../utils/auth');
const cacheService = require('../services/cacheService');

// ==========================================
// 1. PROJECTS CRUD & DASHBOARD METRICS
// ==========================================

// Get all projects with summary stats and user role
router.get('/projects', (req, res) => {
  try {
    const db = getDb();
    const currentUserId = req.user ? req.user.id : null;

    let query;
    let params;

    if (currentUserId) {
      if (req.user.role === 'admin' && req.query.all === 'true') {
        query = `
          SELECT p.*, 
                 u.name as owner_name,
                 u.email as owner_email,
                 COUNT(DISTINCT c.id) as cluster_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id) as paper_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'read') as read_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'in_progress') as in_progress_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND (status = 'unread' OR status IS NULL)) as unread_count,
                 (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
                 (SELECT COUNT(*) FROM dynamic_columns WHERE cluster_id IN (SELECT id FROM clusters WHERE project_id = p.id)) as dynamic_col_count,
                 COALESCE(
                   CASE WHEN p.owner_id = ? THEN 'owner' ELSE NULL END,
                   (SELECT CASE WHEN role = 'owner' THEN 'editor' ELSE role END FROM project_members WHERE project_id = p.id AND user_id = ?),
                   'viewer'
                 ) as user_role
          FROM projects p
          LEFT JOIN users u ON u.id = p.owner_id
          LEFT JOIN clusters c ON c.project_id = p.id
          GROUP BY p.id
          ORDER BY p.id DESC
        `;
        params = [currentUserId, currentUserId];
      } else {
        query = `
          SELECT p.*, 
                 u.name as owner_name,
                 u.email as owner_email,
                 COUNT(DISTINCT c.id) as cluster_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id) as paper_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'read') as read_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'in_progress') as in_progress_count,
                 (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND (status = 'unread' OR status IS NULL)) as unread_count,
                 (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
                 (SELECT COUNT(*) FROM dynamic_columns WHERE cluster_id IN (SELECT id FROM clusters WHERE project_id = p.id)) as dynamic_col_count,
                 COALESCE(
                   CASE WHEN p.owner_id = ? THEN 'owner' ELSE NULL END,
                   (SELECT CASE WHEN role = 'owner' THEN 'editor' ELSE role END FROM project_members WHERE project_id = p.id AND user_id = ?),
                   'viewer'
                 ) as user_role
          FROM projects p
          LEFT JOIN users u ON u.id = p.owner_id
          LEFT JOIN clusters c ON c.project_id = p.id
          WHERE p.owner_id = ? 
             OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
          GROUP BY p.id
          ORDER BY p.id DESC
        `;
        params = [currentUserId, currentUserId, currentUserId, currentUserId];
      }
    } else {
      // If unauthenticated, only return public projects
      query = `
        SELECT p.*, 
               u.name as owner_name,
               u.email as owner_email,
               COUNT(DISTINCT c.id) as cluster_count,
               (SELECT COUNT(*) FROM papers WHERE project_id = p.id) as paper_count,
               (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'read') as read_count,
               (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'in_progress') as in_progress_count,
               (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND (status = 'unread' OR status IS NULL)) as unread_count,
               (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
               (SELECT COUNT(*) FROM dynamic_columns WHERE cluster_id IN (SELECT id FROM clusters WHERE project_id = p.id)) as dynamic_col_count,
               'viewer' as user_role
        FROM projects p
        LEFT JOIN users u ON u.id = p.owner_id
        LEFT JOIN clusters c ON c.project_id = p.id
        WHERE p.is_public = 1
        GROUP BY p.id
        ORDER BY p.id DESC
      `;
      params = [];
    }

    const projects = db.prepare(query).all(...params);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get comprehensive researcher dashboard metrics
router.get('/user/dashboard-stats', (req, res) => {
  try {
    const db = getDb();
    if (!req.user) {
      return res.json({
        total_surveys: 0,
        total_papers: 0,
        read_papers: 0,
        in_progress_papers: 0,
        unread_papers: 0,
        completion_rate: 0,
        screenings_count: 0,
        comments_count: 0,
        clusters_count: 0,
        dynamic_cols_count: 0
      });
    }

    const currentUserId = req.user.id;

    // 1. Working Surveys: Total Projects / Surveys owned by or shared with the user
    const totalSurveys = db.prepare(`
      SELECT COUNT(DISTINCT p.id) as count
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE p.owner_id = ? OR pm.user_id = ?
    `).get(currentUserId, currentUserId).count;

    // 2. Ingested Papers: Total Papers & status breakdown across user surveys
    const papersSummary = db.prepare(`
      SELECT 
        COUNT(p.id) as total_papers,
        COALESCE(SUM(CASE WHEN p.status = 'read' THEN 1 ELSE 0 END), 0) as read_papers,
        COALESCE(SUM(CASE WHEN p.status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress_papers,
        COALESCE(SUM(CASE WHEN p.status = 'unread' OR p.status IS NULL THEN 1 ELSE 0 END), 0) as unread_papers
      FROM papers p
      WHERE p.project_id IN (
        SELECT DISTINCT pr.id FROM projects pr 
        LEFT JOIN project_members pm ON pm.project_id = pr.id 
        WHERE pr.owner_id = ? OR pm.user_id = ?
      )
    `).get(currentUserId, currentUserId);

    const totalPapers = papersSummary ? (papersSummary.total_papers || 0) : 0;
    const readPapers = papersSummary ? (papersSummary.read_papers || 0) : 0;
    const inProgressPapers = papersSummary ? (papersSummary.in_progress_papers || 0) : 0;
    const unreadPapers = papersSummary ? (papersSummary.unread_papers || 0) : 0;

    // 3. Reading Completion: Exact percentage of read papers
    const completionRate = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

    // 4. Screenings & Notes: Total PRISMA screening decisions made in user's projects or by user
    const screeningsCount = db.prepare(`
      SELECT COUNT(DISTINCT ps.id) as count 
      FROM paper_screening ps
      WHERE ps.user_id = ? OR ps.paper_id IN (
        SELECT id FROM papers WHERE project_id IN (
          SELECT DISTINCT pr.id FROM projects pr 
          LEFT JOIN project_members pm ON pm.project_id = pr.id 
          WHERE pr.owner_id = ? OR pm.user_id = ?
        )
      )
    `).get(currentUserId, currentUserId, currentUserId).count;

    // Total Comments / Annotations made in user's projects or by user
    const commentsCount = db.prepare(`
      SELECT COUNT(DISTINCT pc.id) as count 
      FROM paper_comments pc
      WHERE pc.user_id = ? OR pc.paper_id IN (
        SELECT id FROM papers WHERE project_id IN (
          SELECT DISTINCT pr.id FROM projects pr 
          LEFT JOIN project_members pm ON pm.project_id = pr.id 
          WHERE pr.owner_id = ? OR pm.user_id = ?
        )
      )
    `).get(currentUserId, currentUserId, currentUserId).count;

    // 5. Taxonomy Clusters: Total Clusters across user surveys
    const clustersCount = db.prepare(`
      SELECT COUNT(DISTINCT c.id) as count FROM clusters c
      WHERE c.project_id IN (
        SELECT DISTINCT pr.id FROM projects pr 
        LEFT JOIN project_members pm ON pm.project_id = pr.id 
        WHERE pr.owner_id = ? OR pm.user_id = ?
      )
    `).get(currentUserId, currentUserId).count;

    // Total Dynamic Extracted Columns
    const dynamicColsCount = db.prepare(`
      SELECT COUNT(DISTINCT dc.id) as count FROM dynamic_columns dc
      WHERE dc.cluster_id IN (
        SELECT c.id FROM clusters c
        WHERE c.project_id IN (
          SELECT DISTINCT pr.id FROM projects pr 
          LEFT JOIN project_members pm ON pm.project_id = pr.id 
          WHERE pr.owner_id = ? OR pm.user_id = ?
        )
      )
    `).get(currentUserId, currentUserId).count;

    res.json({
      total_surveys: totalSurveys || 0,
      total_papers: totalPapers,
      read_papers: readPapers,
      in_progress_papers: inProgressPapers,
      unread_papers: unreadPapers,
      completion_rate: completionRate,
      screenings_count: screeningsCount || 0,
      comments_count: commentsCount || 0,
      clusters_count: clustersCount || 0,
      dynamic_cols_count: dynamicColsCount || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check survey name availability for user
router.get('/projects/check-name', (req, res) => {
  try {
    const rawName = (req.query.name || '').trim();
    if (!rawName) {
      return res.json({ available: false, valid: false, error: 'Survey name cannot be empty.' });
    }

    if (rawName.length < 3) {
      return res.json({ available: false, valid: false, error: 'Survey name must be at least 3 characters long.' });
    }

    const db = getDb();
    const currentUserId = req.user ? req.user.id : null;
    const excludeId = req.query.exclude_id ? Number(req.query.exclude_id) : null;

    let existing;
    if (currentUserId) {
      if (excludeId) {
        existing = db.prepare('SELECT id, name FROM projects WHERE owner_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?').get(currentUserId, rawName, excludeId);
      } else {
        existing = db.prepare('SELECT id, name FROM projects WHERE owner_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))').get(currentUserId, rawName);
      }
    } else {
      existing = db.prepare('SELECT id, name FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(rawName);
    }

    if (existing) {
      return res.json({
        available: false,
        valid: true,
        error: 'You already have a literature survey with this title. All survey titles must be unique.'
      });
    }

    return res.json({
      available: true,
      valid: true,
      message: 'Survey title is available.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project — requires auth + membership
router.get('/projects/:id', (req, res) => {
  try {
    const pid = req.params.id;
    const db = getDb();
    const project = db.prepare(`
      SELECT p.*, 
             u.name as owner_name,
             u.email as owner_email,
             (SELECT COUNT(*) FROM papers WHERE project_id = p.id) as paper_count,
             (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'read') as read_count,
             (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND status = 'in_progress') as in_progress_count,
             (SELECT COUNT(*) FROM papers WHERE project_id = p.id AND (status = 'unread' OR status IS NULL)) as unread_count,
             (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
      FROM projects p
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.id = ?
    `).get(pid);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Allow public projects without authentication
    if (!project.is_public && req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!role && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access Denied. You are not a member of this project.' });
      }
    }

    const clusters = db.prepare(`
      SELECT c.*, COUNT(p.id) as paper_count
      FROM clusters c
      LEFT JOIN papers p ON p.cluster_id = c.id
      WHERE c.project_id = ?
      GROUP BY c.id
    `).all(pid);

    res.json({ ...project, clusters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Full Survey Benchmark Matrix endpoint (Sub-millisecond Redis Cache-Aside)
router.get('/projects/:id/matrix', async (req, res) => {
  try {
    const pid = req.params.id;
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.is_public && req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!role && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access Denied. You are not a member of this project.' });
      }
    }

    const { data, cached } = await cacheService.getSurveyMatrix(pid, async () => {
      const clusters = db.prepare('SELECT * FROM clusters WHERE project_id = ? ORDER BY COALESCE(position, id) ASC, id ASC').all(pid);
      const dynamicColumns = db.prepare(`
        SELECT dc.* 
        FROM dynamic_columns dc
        JOIN clusters c ON c.id = dc.cluster_id
        WHERE c.project_id = ?
        ORDER BY dc.parent_column_id ASC, dc.id ASC
      `).all(pid);

      const papers = db.prepare('SELECT * FROM papers WHERE project_id = ? ORDER BY year DESC, id ASC').all(pid);
      const paperIds = papers.map(p => p.id);

      let keywords = [];
      let columnValues = [];

      if (paperIds.length > 0) {
        const placeholders = paperIds.map(() => '?').join(',');
        keywords = db.prepare(`SELECT * FROM keywords WHERE paper_id IN (${placeholders})`).all(...paperIds);
        columnValues = db.prepare(`SELECT * FROM paper_column_values WHERE paper_id IN (${placeholders})`).all(...paperIds);
      }

      return {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          domain: project.domain
        },
        clusters,
        dynamic_columns: dynamicColumns,
        papers,
        keywords,
        column_values: columnValues
      };
    });

    res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create project — requires authentication with unique title check
router.post('/projects', (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required to create a survey.' });

    const { name, description, domain } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });

    const cleanName = name.trim();
    if (cleanName.length < 3) {
      return res.status(400).json({ error: 'Survey name must be at least 3 characters long.' });
    }

    const db = getDb();
    const ownerId = req.user.id;

    // Strict uniqueness check per user
    const existing = db.prepare('SELECT id FROM projects WHERE owner_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))').get(ownerId, cleanName);
    if (existing) {
      return res.status(409).json({ error: `You already have a literature survey titled "${cleanName}". All survey titles must be unique.` });
    }

    const result = db.prepare('INSERT INTO projects (name, description, domain, owner_id) VALUES (?, ?, ?, ?)').run(cleanName, description || '', domain || 'Computer Science', ownerId);
    const newProjectId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (?, ?, 'owner')
      ON CONFLICT(project_id, user_id) DO NOTHING
    `).run(newProjectId, ownerId);

    const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(newProjectId);
    res.status(201).json(newProject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project — requires owner or editor role
router.put('/projects/:id', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

    const pid = req.params.id;
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Only owner or editor (or platform admin) may update project metadata
    const role = getProjectRole(req.user.id, pid);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: `Access Denied. Only the project Owner or Editor can update this survey (Your role: ${role}).`
      });
    }

    const { name, description, domain } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Survey name cannot be empty.' });

    let cleanName = null;
    if (name) {
      cleanName = name.trim();
      const duplicate = db.prepare('SELECT id FROM projects WHERE owner_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?').get(project.owner_id, cleanName, pid);
      if (duplicate) {
        return res.status(409).json({ error: `Another survey titled "${cleanName}" already exists. Survey titles must be unique.` });
      }
    }

    const result = db.prepare('UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), domain = COALESCE(?, domain) WHERE id = ?')
      .run(cleanName, description !== undefined ? description : null, domain !== undefined ? domain : null, pid);
    if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    await cacheService.invalidateSurveyCache(pid);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
router.delete('/projects/:id', async (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;

    if (req.user && req.user.role !== 'admin') {
      const role = getProjectRole(req.user.id, pid);
      if (role !== 'owner') {
        return res.status(403).json({ error: `Access Denied. Only the project Owner can delete this project (Your role: ${role}).` });
      }
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM paper_column_values WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)').run(pid);
      db.prepare('DELETE FROM keywords WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)').run(pid);
      db.prepare('DELETE FROM papers WHERE project_id = ?').run(pid);
      db.prepare('DELETE FROM dynamic_columns WHERE cluster_id IN (SELECT id FROM clusters WHERE project_id = ?)').run(pid);
      db.prepare('DELETE FROM clusters WHERE project_id = ?').run(pid);
      const result = db.prepare('DELETE FROM projects WHERE id = ?').run(pid);
      db.exec('COMMIT;');
      if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
      await cacheService.invalidateSurveyCache(pid);
      res.json({ success: true, message: 'Project and all related data purged' });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transfer project ownership to another user (Owner only)
router.post('/projects/:id/transfer', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Only the project Owner can transfer ownership (Your role: ${role}).` });
    }

    const { target_email, new_owner_email, keep_as_editor = true } = req.body;
    const recipientEmail = (target_email || new_owner_email || '').trim();

    if (!recipientEmail) {
      return res.status(400).json({ error: 'Recipient user email is required for ownership transfer.' });
    }

    const cleanEmail = recipientEmail.toLowerCase();
    const targetUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(cleanEmail);
    if (!targetUser) {
      return res.status(404).json({ error: `User with email "${cleanEmail}" does not exist on LitSphere. They must register first.` });
    }

    if (targetUser.id === project.owner_id) {
      return res.status(400).json({ error: 'User is already the Owner of this survey project.' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Update project owner
      db.prepare('UPDATE projects SET owner_id = ? WHERE id = ?').run(targetUser.id, pid);

      // 2. Add/update new owner membership as 'owner'
      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role, invited_by)
        VALUES (?, ?, 'owner', ?)
        ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'
      `).run(pid, targetUser.id, req.user.id);

      // 3. Update previous owner membership
      if (keep_as_editor) {
        db.prepare(`
          INSERT INTO project_members (project_id, user_id, role, invited_by)
          VALUES (?, ?, 'editor', ?)
          ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'editor'
        `).run(pid, req.user.id, targetUser.id);
      } else {
        db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(pid, req.user.id);
      }

      db.exec('COMMIT;');

      logAuditEvent(req, 'PROJECT_OWNERSHIP_TRANSFER', `Transferred ownership of project ${pid} (${project.name}) to ${cleanEmail}`, 'SUCCESS');

      res.json({
        success: true,
        message: `Ownership of "${project.name}" successfully transferred to ${targetUser.name} (${cleanEmail}).`,
        new_owner_id: targetUser.id,
        new_owner_name: targetUser.name,
        new_owner_email: targetUser.email,
        your_new_role: keep_as_editor ? 'editor' : 'none'
      });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Duplicate/Clone survey project structure and optionally papers (Owner or Editor)
router.post('/projects/:id/duplicate', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;
    const { new_name, include_papers = true } = req.body;

    const sourceProj = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!sourceProj) return res.status(404).json({ error: 'Source project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot duplicate this survey.` });
    }

    const clonedName = (new_name && new_name.trim()) ? new_name.trim() : `${sourceProj.name} (Copy)`;

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Create new project
      const insertProj = db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)').run(clonedName, sourceProj.description || '', req.user.id);
      const newProjectId = Number(insertProj.lastInsertRowid);

      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (?, ?, 'owner')
      `).run(newProjectId, req.user.id);

      // 2. Clone clusters & build cluster ID map
      const oldClusters = db.prepare('SELECT * FROM clusters WHERE project_id = ? ORDER BY id ASC').all(pid);
      const clusterMap = {};

      for (const cl of oldClusters) {
        const insCl = db.prepare('INSERT INTO clusters (project_id, name, color, description) VALUES (?, ?, ?, ?)').run(newProjectId, cl.name, cl.color, cl.description);
        const newClId = Number(insCl.lastInsertRowid);
        clusterMap[cl.id] = newClId;

        // 3. Clone dynamic columns for this cluster
        const oldCols = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ? ORDER BY parent_column_id ASC, id ASC').all(cl.id);
        const colMap = {};
        for (const col of oldCols) {
          const newParentId = col.parent_column_id ? (colMap[col.parent_column_id] || null) : null;
          const insCol = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, col_type, parent_column_id) VALUES (?, ?, ?, ?)').run(newClId, col.column_name, col.col_type || 'text', newParentId);
          colMap[col.id] = Number(insCol.lastInsertRowid);
        }
      }

      // 4. Optionally clone papers & keywords
      if (include_papers) {
        const oldPapers = db.prepare('SELECT * FROM papers WHERE project_id = ? ORDER BY id ASC').all(pid);
        for (const p of oldPapers) {
          const newClId = p.cluster_id ? (clusterMap[p.cluster_id] || null) : null;
          const insPaper = db.prepare(`
            INSERT INTO papers (project_id, cluster_id, title, authors, year, pub, domain, doi, pdf_url, status, intuition, equation, strengths, gaps)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(newProjectId, newClId, p.title, p.authors, p.year, p.pub, p.domain, p.doi, p.pdf_url, p.status || 'unread', p.intuition, p.equation, p.strengths, p.gaps);
          const newPaperId = Number(insPaper.lastInsertRowid);

          // Clone keywords
          const kws = db.prepare('SELECT keyword FROM keywords WHERE paper_id = ?').all(p.id);
          for (const kw of kws) {
            db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)').run(newPaperId, kw.keyword);
          }
        }
      }

      db.exec('COMMIT;');

      logAuditEvent(req, 'PROJECT_DUPLICATE', `Duplicated project ${pid} into new project ${newProjectId} ("${clonedName}")`, 'SUCCESS');

      const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(newProjectId);
      res.status(201).json(created);
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset/Clear all extracted paper column values in master matrix (Owner only, with Distributed Lock protection)
router.post('/projects/:id/reset-matrix', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Only the project Owner can reset the master matrix (Your role: ${role}).` });
    }

    let delChanges = 0;
    await cacheService.withLock(`survey:${pid}:matrix`, 15, async () => {
      db.exec('BEGIN TRANSACTION;');
      try {
        // 1. Delete all cell extractions for papers in this project
        const delValues = db.prepare('DELETE FROM paper_column_values WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)').run(pid);
        delChanges = delValues.changes;
        
        // 2. Reset paper statuses to 'unread'
        db.prepare("UPDATE papers SET status = 'unread' WHERE project_id = ?").run(pid);

        db.exec('COMMIT;');
      } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
      }
    });

    // Invalidate cached survey matrix & stats
    await cacheService.invalidateSurveyCache(pid);

    logAuditEvent(req, 'PROJECT_MATRIX_RESET', `Reset matrix cell values and paper status on project ${pid} (${project.name})`, 'SUCCESS');

    res.json({
      success: true,
      message: `Master Matrix cells successfully reset (${delChanges} values cleared). Papers and columns preserved.`
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Download full JSON backup archive of survey (Owner or Editor)
router.get('/projects/:id/backup', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot export survey backup.` });
    }

    const clusters = db.prepare('SELECT * FROM clusters WHERE project_id = ? ORDER BY id ASC').all(pid);
    const dynamicColumns = db.prepare(`
      SELECT dc.* 
      FROM dynamic_columns dc
      JOIN clusters c ON c.id = dc.cluster_id
      WHERE c.project_id = ?
      ORDER BY dc.parent_column_id ASC, dc.id ASC
    `).all(pid);

    const papers = db.prepare('SELECT * FROM papers WHERE project_id = ? ORDER BY id ASC').all(pid);
    const paperIds = papers.map(p => p.id);

    let keywords = [];
    let columnValues = [];

    if (paperIds.length > 0) {
      const placeholders = paperIds.map(() => '?').join(',');
      keywords = db.prepare(`SELECT * FROM keywords WHERE paper_id IN (${placeholders})`).all(...paperIds);
      columnValues = db.prepare(`SELECT * FROM paper_column_values WHERE paper_id IN (${placeholders})`).all(...paperIds);
    }

    const members = db.prepare(`
      SELECT pm.id, pm.role, pm.created_at, u.name, u.email, u.institution
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
    `).all(pid);

    const backupPayload = {
      export_version: '2.0.0',
      exported_at: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        created_at: project.created_at
      },
      stats: {
        total_clusters: clusters.length,
        total_columns: dynamicColumns.length,
        total_papers: papers.length,
        total_values: columnValues.length
      },
      clusters,
      dynamic_columns: dynamicColumns,
      papers,
      keywords,
      column_values: columnValues,
      team_members: members
    };

    res.setHeader('Content-Disposition', `attachment; filename="survey-backup-${pid}-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backupPayload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. PROJECT SHARING & PUBLIC SUPERVISOR LINKS
// ==========================================
// SUPERVISOR & PUBLIC SHARE LINK ENDPOINTS
// ==========================================

// GET /api/projects/:id/share - Get current share link status (Owner, Editor, Reviewer)
router.get('/projects/:id/share', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;
    const project = db.prepare("SELECT id, name, share_token, is_public FROM projects WHERE id = ?").get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (['viewer'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Viewers have read-only access and cannot inspect share token management.' });
    }

    const isPublic = project.is_public === 1 && !!project.share_token;
    res.json({
      is_public: isPublic ? 1 : 0,
      share_token: isPublic ? project.share_token : null,
      share_url: isPublic ? `/shared/${project.share_token}` : null,
      message: isPublic ? 'Public share link is active.' : 'Public share link is currently disabled.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/share - Generate or activate public supervisor share token (Owner or Editor)
router.post('/projects/:id/share', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot manage share links.` });
    }

    let shareToken = project.share_token;
    if (!shareToken) {
      shareToken = crypto.randomBytes(16).toString('hex');
      db.prepare("UPDATE projects SET share_token = ?, is_public = 1 WHERE id = ?").run(shareToken, pid);
    } else {
      db.prepare("UPDATE projects SET is_public = 1 WHERE id = ?").run(pid);
    }

    res.json({
      share_token: shareToken,
      share_url: `/shared/${shareToken}`,
      is_public: 1,
      message: 'Public supervisor share link is active.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id/share - Revoke / Disable public supervisor share link (Owner only)
router.delete('/projects/:id/share', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const pid = req.params.id;
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const role = getProjectRole(req.user.id, pid);
    if (role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Only the project Owner can disable share links.` });
    }

    db.prepare("UPDATE projects SET is_public = 0, share_token = NULL WHERE id = ?").run(pid);

    res.json({
      is_public: 0,
      message: 'Public share link has been revoked and disabled.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/shared/:token - Public read-only project review
router.get('/public/shared/:token', (req, res) => {
  try {
    const db = getDb();
    const token = req.params.token;
    const project = db.prepare("SELECT id, name, description, created_at, is_public FROM projects WHERE share_token = ?").get(token);
    
    if (!project || project.is_public !== 1) {
      return res.status(404).json({ error: 'Shared research review not found or link has expired.' });
    }

    const clusters = db.prepare("SELECT * FROM clusters WHERE project_id = ? ORDER BY id ASC").all(project.id);
    const papers = db.prepare("SELECT * FROM papers WHERE project_id = ? ORDER BY id ASC").all(project.id);
    
    // Attach keywords for papers
    if (papers.length > 0) {
      const paperIds = papers.map(p => p.id);
      const placeholders = paperIds.map(() => '?').join(',');
      const keywords = db.prepare(`SELECT paper_id, keyword FROM keywords WHERE paper_id IN (${placeholders})`).all(...paperIds);
      const kwMap = {};
      for (const kw of keywords) {
        if (!kwMap[kw.paper_id]) kwMap[kw.paper_id] = [];
        kwMap[kw.paper_id].push(kw.keyword);
      }
      for (const p of papers) {
        p.keywords = kwMap[p.id] || [];
      }
    }

    const columns = db.prepare(`
      SELECT dc.*, dc.column_name as name 
      FROM dynamic_columns dc
      JOIN clusters c ON c.id = dc.cluster_id
      WHERE c.project_id = ?
      ORDER BY dc.parent_column_id ASC, dc.id ASC
    `).all(project.id);

    const values = db.prepare(`
      SELECT pcv.* 
      FROM paper_column_values pcv
      JOIN papers p ON p.id = pcv.paper_id
      WHERE p.project_id = ?
    `).all(project.id);

    res.json({
      project,
      clusters,
      papers,
      columns,
      values,
      read_only: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
