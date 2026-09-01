const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// ==========================================
// MASTER TAXONOMY TEMPLATES & BLUEPRINTS API
// ==========================================

// GET /api/templates - Public template list for new project setup
router.get('/templates', (req, res) => {
  try {
    const db = getDb();
    const templates = db.prepare("SELECT id, name, category, description, clusters_json, created_at FROM master_templates ORDER BY id ASC").all();
    const parsed = templates.map(t => ({
      ...t,
      clusters: JSON.parse(t.clusters_json || '[]')
    }));
    res.json({ templates: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/clone-template - Create project cloned from master template
router.post('/projects/clone-template', (req, res) => {
  try {
    const { template_id, project_name, description } = req.body;
    const db = getDb();

    const template = db.prepare("SELECT * FROM master_templates WHERE id = ?").get(template_id);
    if (!template) return res.status(404).json({ error: 'Master template not found.' });

    const name = project_name ? project_name.trim() : template.name;
    const desc = description ? description.trim() : template.description;

    db.exec('BEGIN TRANSACTION;');
    try {
      const ownerId = req.user ? req.user.id : 1;
      const projRes = db.prepare("INSERT INTO projects (name, description, domain, owner_id) VALUES (?, ?, ?, ?)").run(name, desc, template.category || 'Computer Science', ownerId);
      const projectId = Number(projRes.lastInsertRowid);

      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (?, ?, 'owner')
        ON CONFLICT(project_id, user_id) DO NOTHING
      `).run(projectId, ownerId);

      const clusters = JSON.parse(template.clusters_json || '[]');
      clusters.forEach(c => {
        const cRes = db.prepare("INSERT INTO clusters (project_id, name, description, color) VALUES (?, ?, ?, ?)").run(
          projectId, c.name, c.description || '', c.color || '#38bdf8'
        );
        const clusterId = Number(cRes.lastInsertRowid);

        if (Array.isArray(c.columns)) {
          c.columns.forEach(colName => {
            db.prepare("INSERT INTO dynamic_columns (cluster_id, column_name, col_type) VALUES (?, ?, 'text')").run(
              clusterId, colName
            );
          });
        }
      });

      db.exec('COMMIT;');
      const newProj = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
      res.status(201).json({
        message: `Project cloned from '${template.name}' successfully.`,
        project: newProj
      });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
