const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, getProjectRole } = require('../utils/auth');

// ==========================================
// DYNAMIC COLUMNS & HIERARCHICAL SPLITTING API
// ==========================================

// Get dynamic columns for a cluster or project
router.get(['/dynamic-columns', '/columns'], (req, res) => {
  try {
    const { cluster_id, project_id } = req.query;
    const db = getDb();
    let cols = [];

    if (cluster_id && cluster_id !== 'all') {
      cols = db.prepare(`
        SELECT dc.id, dc.cluster_id, dc.column_name, dc.column_name as name, dc.parent_column_id, dc.col_type, p.column_name as parent_column_name
        FROM dynamic_columns dc
        LEFT JOIN dynamic_columns p ON p.id = dc.parent_column_id
        WHERE dc.cluster_id = ?
        ORDER BY dc.parent_column_id ASC, dc.id ASC
      `).all(cluster_id);
    } else if (project_id) {
      cols = db.prepare(`
        SELECT MIN(dc.id) as id, MIN(dc.cluster_id) as cluster_id, dc.column_name, dc.column_name as name, dc.parent_column_id, dc.col_type, p.column_name as parent_column_name
        FROM dynamic_columns dc
        LEFT JOIN clusters c ON c.id = dc.cluster_id
        LEFT JOIN dynamic_columns p ON p.id = dc.parent_column_id
        WHERE c.project_id = ?
           OR dc.id IN (SELECT pcv.column_id FROM paper_column_values pcv JOIN papers pa ON pa.id = pcv.paper_id WHERE pa.project_id = ?)
        GROUP BY dc.column_name
        ORDER BY dc.parent_column_id ASC, MIN(dc.id) ASC
      `).all(project_id, project_id);
    } else {
      cols = db.prepare(`
        SELECT MIN(dc.id) as id, MIN(dc.cluster_id) as cluster_id, dc.column_name, dc.column_name as name, dc.parent_column_id, dc.col_type, p.column_name as parent_column_name
        FROM dynamic_columns dc
        LEFT JOIN dynamic_columns p ON p.id = dc.parent_column_id
        GROUP BY dc.column_name
        ORDER BY dc.parent_column_id ASC, MIN(dc.id) ASC
      `).all();
    }

    res.json(cols);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add dynamic column or Split column
router.post(['/dynamic-columns', '/columns'], authenticateToken, (req, res) => {
  try {
    const { parent_column_id, sub_columns } = req.body;
    let cluster_id = req.body.cluster_id;
    const project_id = req.body.project_id;
    const column_name = req.body.column_name || req.body.name;
    const col_type = req.body.col_type || req.body.data_type || 'text';

    if (!column_name) {
      return res.status(400).json({ error: 'column_name is required' });
    }

    const db = getDb();

    let pid = project_id;
    if (!pid && cluster_id && cluster_id !== 'all') {
      const cl = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cl) pid = cl.project_id;
    }
    if (pid) {
      const role = getProjectRole(req.user.id, pid);
      if (['reviewer', 'viewer'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot create dynamic columns.` });
      }
    }

    // If split column requested with sub_columns array
    if (Array.isArray(sub_columns) && sub_columns.length > 0) {
      if (!cluster_id && project_id) {
        const firstCl = db.prepare('SELECT id FROM clusters WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(project_id);
        if (firstCl) cluster_id = firstCl.id;
      }
      if (!cluster_id) {
        const firstCl = db.prepare('SELECT id FROM clusters ORDER BY id ASC LIMIT 1').get();
        if (firstCl) cluster_id = firstCl.id;
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        let parentId = parent_column_id;
        if (!parentId) {
          const existingParent = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND column_name = ? AND parent_column_id IS NULL').get(cluster_id, column_name);
          if (existingParent) {
            parentId = existingParent.id;
          } else {
            const parentRes = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, NULL, ?)')
              .run(cluster_id, column_name, col_type || 'group');
            parentId = parentRes.lastInsertRowid;
          }
        }

        const createdSubs = [];
        const insertSub = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, ?, ?)');
        for (const sub of sub_columns) {
          const sName = typeof sub === 'string' ? sub : sub.name;
          const sType = typeof sub === 'object' && sub.type ? sub.type : 'text';
          const subRes = insertSub.run(cluster_id, sName, parentId, sType);
          createdSubs.push({ id: subRes.lastInsertRowid, column_name: sName, name: sName, parent_column_id: parentId, col_type: sType });
        }

        db.exec('COMMIT;');
        return res.status(201).json({ success: true, parent_id: parentId, sub_columns: createdSubs });
      } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
      }
    }

    // When creating a dynamic column for a specific cluster:
    if (cluster_id && cluster_id !== 'all') {
      const existing = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ? AND LOWER(column_name) = LOWER(?)').get(cluster_id, column_name);
      if (existing) {
        return res.status(200).json({ ...existing, name: existing.column_name });
      }
      const result = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, ?, ?)')
        .run(cluster_id, column_name, parent_column_id || null, col_type);
      const created = db.prepare('SELECT dc.*, dc.column_name as name FROM dynamic_columns dc WHERE dc.id = ?').get(result.lastInsertRowid);
      return res.status(201).json(created);
    }

    // When creating for project (all clusters in project)
    if (project_id) {
      const clusters = db.prepare('SELECT id FROM clusters WHERE project_id = ? ORDER BY id ASC').all(project_id);
      if (clusters.length > 0) {
        const insertStmt = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, ?, ?)');
        let firstCreated = null;
        for (const cl of clusters) {
          const existing = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND LOWER(column_name) = LOWER(?)').get(cl.id, column_name);
          if (!existing) {
            const result = insertStmt.run(cl.id, column_name, parent_column_id || null, col_type);
            if (!firstCreated) {
              firstCreated = db.prepare('SELECT dc.*, dc.column_name as name FROM dynamic_columns dc WHERE dc.id = ?').get(result.lastInsertRowid);
            }
          } else if (!firstCreated) {
            firstCreated = db.prepare('SELECT dc.*, dc.column_name as name FROM dynamic_columns dc WHERE dc.id = ?').get(existing.id);
          }
        }
        return res.status(201).json(firstCreated || { success: true, column_name });
      }
    }

    const firstCl = db.prepare('SELECT id FROM clusters ORDER BY id ASC LIMIT 1').get();
    if (!firstCl) return res.status(400).json({ error: 'No cluster found to assign column.' });

    const result = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, ?, ?)')
      .run(firstCl.id, column_name, parent_column_id || null, col_type);

    const created = db.prepare('SELECT dc.*, dc.column_name as name FROM dynamic_columns dc WHERE dc.id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Split Column endpoint (Owner, Editor)
router.post('/dynamic-columns/split', authenticateToken, (req, res) => {
  try {
    let { cluster_id, project_id, parent_column_name, parent_column_id, column_id, column_name, sub_columns } = req.body;
    parent_column_id = parent_column_id || column_id;
    parent_column_name = parent_column_name || column_name;

    if (!Array.isArray(sub_columns) || sub_columns.length === 0) {
      return res.status(400).json({ error: 'sub_columns array is required (at least 2 sub-columns)' });
    }

    const db = getDb();

    let pid = project_id;
    if (!pid && cluster_id && cluster_id !== 'all') {
      const cl = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cl) pid = cl.project_id;
    }
    if (pid) {
      const role = getProjectRole(req.user.id, pid);
      if (['reviewer', 'viewer'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot split columns.` });
      }
    }

    // Resolve parent column and cluster
    let targetClusters = [];
    if (parent_column_id) {
      const parentCol = db.prepare('SELECT * FROM dynamic_columns WHERE id = ?').get(parent_column_id);
      if (parentCol) {
        parent_column_name = parentCol.column_name;
        if (parentCol.cluster_id) targetClusters.push(parentCol.cluster_id);
      }
    }

    if (targetClusters.length === 0) {
      if (cluster_id && cluster_id !== 'all') {
        targetClusters.push(parseInt(cluster_id, 10));
      } else if (project_id) {
        targetClusters = db.prepare('SELECT id FROM clusters WHERE project_id = ?').all(project_id).map(c => c.id);
      } else {
        targetClusters = db.prepare('SELECT id FROM clusters').all().map(c => c.id);
      }
    }

    if (targetClusters.length === 0) {
      return res.status(400).json({ error: 'No cluster found for column splitting' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const createdSubs = [];

      for (const clId of targetClusters) {
        let parentId = null;
        const existingParent = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND (column_name = ? OR LOWER(column_name) = LOWER(?)) AND parent_column_id IS NULL')
          .get(clId, parent_column_name, parent_column_name);

        if (existingParent) {
          parentId = existingParent.id;
          db.prepare('UPDATE dynamic_columns SET col_type = ? WHERE id = ?').run('split', parentId);
        } else {
          const parentRes = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, NULL, ?)')
            .run(clId, parent_column_name, 'split');
          parentId = parentRes.lastInsertRowid;
        }

        // Clean up any removed sub-columns from database
        const currentSubs = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ? AND parent_column_id = ?').all(clId, parentId);
        const subNamesLower = sub_columns.map(s => (typeof s === 'string' ? s : (s.name || s.column_name || '')).trim().toLowerCase());
        for (const cs of currentSubs) {
          if (!subNamesLower.includes(cs.column_name.toLowerCase())) {
            db.prepare('DELETE FROM dynamic_columns WHERE id = ?').run(cs.id);
            db.prepare('DELETE FROM paper_column_values WHERE column_id = ?').run(cs.id);
          }
        }

        const insertSub = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, ?, ?)');
        for (const sub of sub_columns) {
          const sName = (typeof sub === 'string' ? sub : (sub.name || sub.column_name || '')).trim();
          if (!sName) continue;
          const sType = typeof sub === 'object' && sub.type ? sub.type : 'text';
          
          const existingSub = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND parent_column_id = ? AND LOWER(column_name) = LOWER(?)')
            .get(clId, parentId, sName);

          if (existingSub) {
            createdSubs.push({ id: existingSub.id, column_name: sName, name: sName, parent_column_id: parentId, col_type: sType });
          } else {
            const subRes = insertSub.run(clId, sName, parentId, sType);
            createdSubs.push({ id: subRes.lastInsertRowid, column_name: sName, name: sName, parent_column_id: parentId, col_type: sType });
          }
        }

        // Check existing paper values under parentId and ensure they are formatted nicely
        const existingVals = db.prepare('SELECT * FROM paper_column_values WHERE column_id = ?').all(parentId);
        for (const ev of existingVals) {
          const raw = (ev.value || '').trim();
          if (raw && !raw.startsWith('{')) {
            // Convert single scalar into structured initial JSON with the sub-columns
            const initialObj = {};
            const extractShortKey = (str) => {
              const m = String(str).match(/\(([^)]+)\)$/);
              return m ? m[1].trim() : String(str).trim();
            };

            const firstSub = sub_columns[0];
            const firstSubName = typeof firstSub === 'string' ? firstSub : (firstSub.name || firstSub.column_name || 'Sub 1');
            const secondSub = sub_columns[1];
            const secondSubName = secondSub ? (typeof secondSub === 'string' ? secondSub : (secondSub.name || secondSub.column_name || 'Sub 2')) : null;

            const k1 = extractShortKey(firstSubName);
            const k2 = secondSubName ? extractShortKey(secondSubName) : null;

            initialObj[k1] = raw;
            if (k2) initialObj[k2] = raw;
            db.prepare('UPDATE paper_column_values SET value = ? WHERE id = ?').run(JSON.stringify(initialObj), ev.id);
          }
        }
      }

      db.exec('COMMIT;');
      return res.status(201).json({ success: true, parent_column_name, sub_columns: createdSubs });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Unsplit Column endpoint (Owner, Editor)
router.post('/dynamic-columns/unsplit', authenticateToken, (req, res) => {
  try {
    let { cluster_id, project_id, parent_column_name, parent_column_id, column_id, column_name } = req.body;
    parent_column_id = parent_column_id || column_id;
    parent_column_name = parent_column_name || column_name;

    if (!parent_column_id && parent_column_name && !isNaN(parseInt(parent_column_name, 10))) {
      parent_column_id = parseInt(parent_column_name, 10);
    }

    const db = getDb();
    let pid = project_id;
    if (!pid && cluster_id && cluster_id !== 'all') {
      const cl = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cl) pid = cl.project_id;
    }
    if (pid) {
      const role = getProjectRole(req.user.id, pid);
      if (['reviewer', 'viewer'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot unsplit columns.` });
      }
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      if (parent_column_id) {
        db.prepare('UPDATE dynamic_columns SET col_type = ? WHERE id = ?').run('text', parent_column_id);
        db.prepare('DELETE FROM dynamic_columns WHERE parent_column_id = ?').run(parent_column_id);
      }
      if (parent_column_name) {
        const cleanName = String(parent_column_name).replace(/^dyn_/, '').trim();
        const numId = !isNaN(parseInt(cleanName, 10)) ? parseInt(cleanName, 10) : -1;
        const parents = db.prepare('SELECT id, column_name FROM dynamic_columns WHERE (column_name = ? OR LOWER(column_name) = LOWER(?) OR column_name = ? OR id = ?) AND parent_column_id IS NULL').all(parent_column_name, parent_column_name, cleanName, numId);
        for (const p of parents) {
          db.prepare('UPDATE dynamic_columns SET col_type = ? WHERE id = ?').run('text', p.id);
          db.prepare('DELETE FROM dynamic_columns WHERE parent_column_id = ?').run(p.id);
        }
      }
      db.exec('COMMIT;');
      res.json({ success: true, message: 'Column unsplit successfully' });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update dynamic column (Owner, Editor)
router.put('/dynamic-columns/:id', authenticateToken, (req, res) => {
  try {
    const { column_name, col_type } = req.body;
    const db = getDb();

    const col = db.prepare('SELECT c.project_id FROM dynamic_columns dc JOIN clusters c ON c.id = dc.cluster_id WHERE dc.id = ?').get(req.params.id);
    if (col && ['reviewer', 'viewer'].includes(getProjectRole(req.user.id, col.project_id)) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access Denied. Reviewers and Viewers cannot update columns.' });
    }

    const result = db.prepare('UPDATE dynamic_columns SET column_name = COALESCE(?, column_name), col_type = COALESCE(?, col_type) WHERE id = ?')
      .run(column_name, col_type, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Column not found' });
    const updated = db.prepare('SELECT * FROM dynamic_columns WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename dynamic column across project by name or ID (Owner, Editor)
router.post('/dynamic-columns/rename-by-name', authenticateToken, (req, res) => {
  try {
    let { old_column_name, new_column_name, column_id, project_id, cluster_id } = req.body;
    if ((!old_column_name && !column_id) || !new_column_name) {
      return res.status(400).json({ error: 'old_column_name (or column_id) and new_column_name are required' });
    }
    if (old_column_name) old_column_name = String(old_column_name).trim();
    new_column_name = String(new_column_name).trim();

    const db = getDb();

    let pid = project_id;
    if (!pid && cluster_id && cluster_id !== 'all') {
      const cl = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cl) pid = cl.project_id;
    }
    if (pid && ['reviewer', 'viewer'].includes(getProjectRole(req.user.id, pid)) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access Denied. Reviewers and Viewers cannot rename columns.' });
    }

    let updatedCount = 0;

    if (column_id) {
      const info = db.prepare('UPDATE dynamic_columns SET column_name = ? WHERE id = ?')
        .run(new_column_name, parseInt(column_id, 10));
      updatedCount = info.changes;
    }

    if (updatedCount === 0 && old_column_name) {
      if (cluster_id && cluster_id !== 'all') {
        const info = db.prepare('UPDATE dynamic_columns SET column_name = ? WHERE cluster_id = ? AND (column_name = ? OR LOWER(column_name) = LOWER(?))')
          .run(new_column_name, cluster_id, old_column_name, old_column_name);
        updatedCount = info.changes;
      } else if (project_id) {
        const clusterIds = db.prepare('SELECT id FROM clusters WHERE project_id = ?').all(project_id).map(c => c.id);
        if (clusterIds.length > 0) {
          const placeholders = clusterIds.map(() => '?').join(',');
          const info = db.prepare(`UPDATE dynamic_columns SET column_name = ? WHERE cluster_id IN (${placeholders}) AND (column_name = ? OR LOWER(column_name) = LOWER(?))`)
            .run(new_column_name, ...clusterIds, old_column_name, old_column_name);
          updatedCount = info.changes;
        }
      }

      if (updatedCount === 0) {
        const info = db.prepare('UPDATE dynamic_columns SET column_name = ? WHERE (column_name = ? OR LOWER(column_name) = LOWER(?))')
          .run(new_column_name, old_column_name, old_column_name);
        updatedCount = info.changes;
      }
    }

    res.json({ success: true, new_column_name, updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete dynamic column (Owner, Editor)
router.delete('/dynamic-columns/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);

    const col = db.prepare('SELECT c.project_id FROM dynamic_columns dc JOIN clusters c ON c.id = dc.cluster_id WHERE dc.id = ?').get(id);
    if (col && ['reviewer', 'viewer'].includes(getProjectRole(req.user.id, col.project_id)) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access Denied. Reviewers and Viewers cannot delete columns.' });
    }

    const childIds = db.prepare('SELECT id FROM dynamic_columns WHERE parent_column_id = ?').all(id).map(r => r.id);
    const allIds = [id, ...childIds];
    const placeholders = allIds.map(() => '?').join(',');

    db.prepare(`DELETE FROM paper_column_values WHERE column_id IN (${placeholders})`).run(...allIds);
    const result = db.prepare(`DELETE FROM dynamic_columns WHERE id IN (${placeholders})`).run(...allIds);
    if (result.changes === 0) return res.status(404).json({ error: 'Column not found' });
    res.json({ success: true, message: 'Column deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete dynamic column across project by name or ID (Owner, Editor)
router.post('/dynamic-columns/delete-by-name', authenticateToken, (req, res) => {
  try {
    let { column_name, column_id, project_id, cluster_id } = req.body;
    if (!column_name && !column_id) return res.status(400).json({ error: 'column_name or column_id is required' });
    if (column_name) column_name = String(column_name).trim();

    const db = getDb();

    let pid = project_id;
    if (!pid && cluster_id && cluster_id !== 'all') {
      const cl = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cl) pid = cl.project_id;
    }
    if (pid && ['reviewer', 'viewer'].includes(getProjectRole(req.user.id, pid)) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access Denied. Reviewers and Viewers cannot delete columns.' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      let colIds = [];
      if (column_id) {
        colIds.push(parseInt(column_id, 10));
      }
      if (cluster_id && cluster_id !== 'all' && column_name) {
        const found = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND (column_name = ? OR LOWER(column_name) = LOWER(?))').all(cluster_id, column_name, column_name).map(r => r.id);
        colIds = [...new Set([...colIds, ...found])];
      } else if (project_id && column_name) {
        const found = db.prepare('SELECT dc.id FROM dynamic_columns dc JOIN clusters c ON c.id = dc.cluster_id WHERE c.project_id = ? AND (dc.column_name = ? OR LOWER(dc.column_name) = LOWER(?))').all(project_id, column_name, column_name).map(r => r.id);
        colIds = [...new Set([...colIds, ...found])];
      }

      if (colIds.length === 0 && column_name) {
        const found = db.prepare('SELECT id FROM dynamic_columns WHERE (column_name = ? OR LOWER(column_name) = LOWER(?))').all(column_name, column_name).map(r => r.id);
        colIds = [...new Set([...colIds, ...found])];
      }

      if (colIds.length > 0) {
        const placeholders = colIds.map(() => '?').join(',');
        const childIds = db.prepare(`SELECT id FROM dynamic_columns WHERE parent_column_id IN (${placeholders})`).all(...colIds).map(r => r.id);
        const allIdsToDelete = [...new Set([...colIds, ...childIds])];
        const allPlaceholders = allIdsToDelete.map(() => '?').join(',');

        db.prepare(`DELETE FROM paper_column_values WHERE column_id IN (${allPlaceholders})`).run(...allIdsToDelete);
        db.prepare(`DELETE FROM dynamic_columns WHERE id IN (${allPlaceholders})`).run(...allIdsToDelete);
      }
      db.exec('COMMIT;');
      res.json({ success: true, deletedCount: colIds.length });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PAPER COLUMN VALUES (CELL EDITING)
// ==========================================

// Upsert a column value for a paper
router.post('/paper-column-values', (req, res) => {
  try {
    const { paper_id, column_name } = req.body;
    const value = req.body.value !== undefined ? req.body.value : req.body.value_text;
    let column_id = req.body.column_id;

    if (!paper_id || (!column_id && !column_name)) {
      return res.status(400).json({ error: 'paper_id and column_id or column_name are required' });
    }

    const db = getDb();
    const paper = db.prepare('SELECT project_id, cluster_id FROM papers WHERE id = ?').get(paper_id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    // Check project permissions: only owner or editor can modify cell values
    const role = req.user ? getProjectRole(req.user.id, paper.project_id) : 'owner';
    if (!['owner', 'editor'].includes(role)) {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot modify table cell values.` });
    }

    // Resolve exact column_id for this paper's cluster or project
    if (!column_id && column_name) {
      let colRec = null;
      if (paper.cluster_id) {
        colRec = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND (column_name = ? OR LOWER(column_name) = LOWER(?))').get(paper.cluster_id, column_name, column_name);
      }
      if (!colRec) {
        colRec = db.prepare('SELECT dc.id FROM dynamic_columns dc JOIN clusters c ON c.id = dc.cluster_id WHERE c.project_id = ? AND (dc.column_name = ? OR LOWER(dc.column_name) = LOWER(?))').get(paper.project_id, column_name, column_name);
      }
      if (colRec) {
        column_id = colRec.id;
      } else {
        const targetCluster = paper.cluster_id || (db.prepare('SELECT id FROM clusters WHERE project_id = ? LIMIT 1').get(paper.project_id)?.id);
        if (targetCluster) {
          const newCol = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, col_type) VALUES (?, ?, ?)')
            .run(targetCluster, column_name, 'text');
          column_id = newCol.lastInsertRowid;
        }
      }
    } else if (column_id && paper.cluster_id) {
      const curCol = db.prepare('SELECT column_name, cluster_id FROM dynamic_columns WHERE id = ?').get(column_id);
      if (curCol && curCol.cluster_id !== paper.cluster_id) {
        const matching = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND (column_name = ? OR LOWER(column_name) = LOWER(?))').get(paper.cluster_id, curCol.column_name, curCol.column_name);
        if (matching) {
          column_id = matching.id;
        } else {
          const created = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, col_type) VALUES (?, ?, ?)')
            .run(paper.cluster_id, curCol.column_name, 'text');
          column_id = created.lastInsertRowid;
        }
      }
    }

    if (!column_id) {
      return res.status(400).json({ error: 'Could not resolve column ID.' });
    }

    const upsert = db.prepare(`
      INSERT INTO paper_column_values (paper_id, column_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
    `);
    upsert.run(paper_id, column_id, value !== undefined ? String(value) : '');

    const record = db.prepare('SELECT * FROM paper_column_values WHERE paper_id = ? AND column_id = ?').get(paper_id, column_id);
    res.json({ success: true, ...record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch Upsert column values
router.post('/paper-column-values/batch', (req, res) => {
  try {
    const rawUpdates = req.body.updates || req.body.values || (Array.isArray(req.body) ? req.body : null);
    const globalPaperId = req.body.paper_id;

    if (!Array.isArray(rawUpdates)) {
      return res.status(400).json({ error: 'updates or values array is required' });
    }

    const db = getDb();
    const normalizedUpdates = [];

    for (const item of rawUpdates) {
      const pid = item.paper_id || globalPaperId;
      if (!pid) continue;

      let colId = item.column_id;
      if (!colId && item.column_name) {
        const paper = db.prepare('SELECT cluster_id FROM papers WHERE id = ?').get(pid);
        if (paper && paper.cluster_id) {
          const col = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND column_name = ?').get(paper.cluster_id, item.column_name);
          if (col) colId = col.id;
        }
      }

      if (colId) {
        normalizedUpdates.push({
          paper_id: pid,
          column_id: colId,
          value: item.value !== undefined ? String(item.value) : ''
        });
      }
    }

    if (normalizedUpdates.length > 0) {
      const samplePaper = db.prepare('SELECT project_id FROM papers WHERE id = ?').get(normalizedUpdates[0].paper_id);
      if (samplePaper) {
        const role = req.user ? getProjectRole(req.user.id, samplePaper.project_id) : 'owner';
        if (!['owner', 'editor'].includes(role)) {
          return res.status(403).json({ error: `Access Denied. Role '${role}' cannot modify table cell values. Required: Owner or Editor.` });
        }
      }
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const upsert = db.prepare(`
        INSERT INTO paper_column_values (paper_id, column_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
      `);
      for (const u of normalizedUpdates) {
        upsert.run(u.paper_id, u.column_id, u.value);
      }
      db.exec('COMMIT;');
      res.json({ success: true, count: normalizedUpdates.length });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
