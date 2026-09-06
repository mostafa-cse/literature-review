const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// ==========================================
// TAXONOMY CLUSTERS API
// ==========================================

// Get all clusters (optionally scoped by project_id)
router.get('/clusters', (req, res) => {
  try {
    const db = getDb();
    const { project_id } = req.query;
    let query = `
      SELECT c.*, 
             COUNT(DISTINCT p.id) as paper_count,
             COUNT(DISTINCT CASE WHEN p.status = 'read' THEN p.id END) as read_count,
             COUNT(DISTINCT CASE WHEN p.status = 'in_progress' THEN p.id END) as in_progress_count,
             COUNT(DISTINCT CASE WHEN p.status = 'unread' OR p.status IS NULL THEN p.id END) as unread_count,
             COUNT(DISTINCT dc.id) as column_count,
             COALESCE((SELECT COUNT(DISTINCT k.id) FROM keywords k JOIN papers p2 ON p2.id = k.paper_id WHERE p2.cluster_id = c.id), 0) as keyword_count
      FROM clusters c
      LEFT JOIN papers p ON p.cluster_id = c.id
      LEFT JOIN dynamic_columns dc ON dc.cluster_id = c.id
    `;
    const params = [];
    if (project_id) {
      query += ` WHERE c.project_id = ? `;
      params.push(project_id);
    }
    query += ` GROUP BY c.id ORDER BY COALESCE(c.position, c.id) ASC, c.id ASC`;

    const clusters = db.prepare(query).all(...params);
    res.json(clusters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single cluster with dynamic columns
router.get('/clusters/:id', (req, res) => {
  try {
    const db = getDb();
    const cluster = db.prepare('SELECT * FROM clusters WHERE id = ?').get(req.params.id);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

    const columns = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ? ORDER BY parent_column_id ASC, id ASC').all(req.params.id);
    const paperCount = db.prepare('SELECT COUNT(*) as c FROM papers WHERE cluster_id = ?').get(req.params.id).c;

    res.json({ ...cluster, columns, paper_count: paperCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { authenticateToken, getProjectRole } = require('../utils/auth');

// Create cluster (Owner, Editor)
router.post('/clusters', (req, res) => {
  try {
    const { project_id, name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Cluster name is required' });

    const db = getDb();
    const pid = project_id ? parseInt(project_id, 10) : 1; // default to project 1
    const clr = color || '#38bdf8';

    if (req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot create clusters.` });
      }
    }

    const maxPosRow = db.prepare('SELECT MAX(position) as maxPos FROM clusters WHERE project_id = ?').get(pid);
    const nextPos = (maxPosRow && maxPosRow.maxPos !== null && maxPosRow.maxPos !== undefined) ? Number(maxPosRow.maxPos) + 1 : 1;

    const result = db.prepare('INSERT INTO clusters (project_id, name, description, color, position) VALUES (?, ?, ?, ?, ?)')
      .run(pid, name, description || '', clr, nextPos);
    const clusterId = result.lastInsertRowid;

    // Inherit project's dynamic columns schema if existing
    const existingCols = db.prepare(`
      SELECT DISTINCT dc.column_name, dc.col_type
      FROM dynamic_columns dc
      JOIN clusters c ON c.id = dc.cluster_id
      WHERE c.project_id = ? AND dc.parent_column_id IS NULL
    `).all(pid);
    if (existingCols.length > 0) {
      const insertCol = db.prepare('INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type) VALUES (?, ?, NULL, ?)');
      for (const col of existingCols) {
        insertCol.run(clusterId, col.column_name, col.col_type || 'text');
      }
    }

    const newCluster = db.prepare('SELECT * FROM clusters WHERE id = ?').get(clusterId);
    res.status(201).json(newCluster);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder clusters sequence (Owner, Editor)
router.put('/clusters/reorder', authenticateToken, (req, res) => {
  try {
    const { project_id, cluster_ids } = req.body;
    if (!project_id || !Array.isArray(cluster_ids) || cluster_ids.length === 0) {
      return res.status(400).json({ error: 'project_id and a valid cluster_ids array are required' });
    }

    const db = getDb();
    const pid = parseInt(project_id, 10);
    const role = getProjectRole(req.user.id, pid);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot reorder clusters.` });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const updateStmt = db.prepare('UPDATE clusters SET position = ? WHERE id = ? AND project_id = ?');
      cluster_ids.forEach((cid, idx) => {
        updateStmt.run(idx + 1, cid, pid);
      });
      db.exec('COMMIT;');
      res.json({ success: true, message: 'Clusters reordered successfully', reordered: cluster_ids.length });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update cluster (Owner, Editor)
router.put('/clusters/:id', authenticateToken, (req, res) => {
  try {
    const { name, description, color } = req.body;
    const db = getDb();
    const cid = req.params.id;

    const existing = db.prepare('SELECT * FROM clusters WHERE id = ?').get(cid);
    if (!existing) return res.status(404).json({ error: 'Cluster not found' });

    const role = getProjectRole(req.user.id, existing.project_id);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot edit clusters.` });
    }

    const cleanName = name !== undefined ? name : existing.name;
    const cleanDesc = description !== undefined ? description : existing.description;
    const cleanColor = color !== undefined ? color : existing.color;

    const result = db.prepare('UPDATE clusters SET name = ?, description = ?, color = ? WHERE id = ?')
      .run(cleanName, cleanDesc, cleanColor, cid);
    if (result.changes === 0) return res.status(404).json({ error: 'Cluster not found' });
    const updated = db.prepare('SELECT * FROM clusters WHERE id = ?').get(cid);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete cluster (Owner only)
router.delete('/clusters/:id', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const cid = req.params.id;

    const existing = db.prepare('SELECT * FROM clusters WHERE id = ?').get(cid);
    if (!existing) return res.status(404).json({ error: 'Cluster not found' });

    const role = getProjectRole(req.user.id, existing.project_id);
    if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access Denied. Role '${role}' cannot delete clusters.` });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM paper_column_values WHERE column_id IN (SELECT id FROM dynamic_columns WHERE cluster_id = ?)').run(cid);
      db.prepare('DELETE FROM dynamic_columns WHERE cluster_id = ?').run(cid);
      db.prepare('UPDATE papers SET cluster_id = NULL WHERE cluster_id = ?').run(cid);
      const result = db.prepare('DELETE FROM clusters WHERE id = ?').run(cid);
      db.exec('COMMIT;');
      if (result.changes === 0) return res.status(404).json({ error: 'Cluster not found' });
      res.json({ success: true, message: 'Cluster deleted' });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cluster Insights / Unique Values Summary & Synthesis
router.get('/clusters/:id/insights', (req, res) => {
  try {
    const db = getDb();
    const clusterId = req.params.id;
    const cluster = db.prepare('SELECT * FROM clusters WHERE id = ?').get(clusterId);
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });

    // 1. Get papers in cluster
    const papers = db.prepare('SELECT * FROM papers WHERE cluster_id = ?').all(clusterId);

    // 2. Get unique domains, years, pubs
    const domains = db.prepare("SELECT domain, COUNT(*) as count FROM papers WHERE cluster_id = ? AND domain IS NOT NULL AND domain != '' GROUP BY domain ORDER BY count DESC").all(clusterId);
    const years = db.prepare('SELECT DISTINCT year FROM papers WHERE cluster_id = ? AND year IS NOT NULL ORDER BY year ASC').all(clusterId).map(r => r.year);
    const pubs = db.prepare("SELECT pub, COUNT(*) as count FROM papers WHERE cluster_id = ? AND pub IS NOT NULL AND pub != '' GROUP BY pub ORDER BY count DESC LIMIT 15").all(clusterId);

    // 3. Get unique dynamic column values
    const dynCols = db.prepare('SELECT id, column_name, parent_column_id, col_type FROM dynamic_columns WHERE cluster_id = ?').all(clusterId);
    const dynamicInsights = {};
    for (const col of dynCols) {
      const vals = db.prepare(`
        SELECT DISTINCT value FROM paper_column_values 
        WHERE column_id = ? AND value IS NOT NULL AND value != ''
      `).all(col.id).map(r => r.value);
      dynamicInsights[col.column_name] = vals;
    }

    // 4. Synthesize Datasets Used across papers
    const datasetCounts = {};
    const classifierCounts = {};
    const strengthsSet = new Set();
    const gapsSet = new Set();
    const thesisOppsSet = new Set();

    for (const p of papers) {
      // Strengths
      try {
        const sList = (p.strengths && p.strengths.startsWith('[')) ? JSON.parse(p.strengths) : (p.strengths ? [p.strengths] : []);
        sList.forEach(s => { if (s && s.trim()) strengthsSet.add(s.trim()); });
      } catch (e) {
        if (p.strengths) strengthsSet.add(p.strengths.trim());
      }

      // Gaps
      try {
        const gList = (p.gaps && p.gaps.startsWith('[')) ? JSON.parse(p.gaps) : (p.gaps ? [p.gaps] : []);
        gList.forEach(g => { if (g && g.trim()) gapsSet.add(g.trim()); });
      } catch (e) {
        if (p.gaps) gapsSet.add(p.gaps.trim());
      }
    }

    // Parse datasets and classifiers from dynamic values
    for (const [colName, valList] of Object.entries(dynamicInsights)) {
      if (/dataset/i.test(colName)) {
        valList.forEach(raw => {
          raw.split(/[,;\n]+/).map(d => d.trim()).filter(Boolean).forEach(d => {
            datasetCounts[d] = (datasetCounts[d] || 0) + 1;
          });
        });
      }
      if (/classifier|model|learner/i.test(colName)) {
        valList.forEach(raw => {
          raw.split(/[,;\n]+/).map(c => c.trim()).filter(Boolean).forEach(c => {
            classifierCounts[c] = (classifierCounts[c] || 0) + 1;
          });
        });
      }
      if (/thesis|opportunit|future/i.test(colName)) {
        valList.forEach(raw => {
          if (raw && raw.trim()) thesisOppsSet.add(raw.trim());
        });
      }
    }

    // 5. Get top keywords
    const keywords = db.prepare(`
      SELECT k.keyword, COUNT(*) as count 
      FROM keywords k
      JOIN papers p ON p.id = k.paper_id
      WHERE p.cluster_id = ?
      GROUP BY k.keyword
      ORDER BY count DESC
      LIMIT 30
    `).all(clusterId);

    const sortedDatasets = Object.entries(datasetCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const sortedClassifiers = Object.entries(classifierCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    res.json({
      cluster,
      total_papers: papers.length,
      domains,
      year_range: years.length > 0 ? { min: Math.min(...years), max: Math.max(...years) } : null,
      publications: pubs,
      datasets_summary: sortedDatasets,
      classifiers_summary: sortedClassifiers,
      strengths_summary: Array.from(strengthsSet).slice(0, 20),
      gaps_summary: Array.from(gapsSet).slice(0, 20),
      thesis_opps_summary: Array.from(thesisOppsSet).slice(0, 15),
      dynamic_column_insights: dynamicInsights,
      top_keywords: keywords
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
