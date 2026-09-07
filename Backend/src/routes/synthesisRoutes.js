const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getProjectRole } = require('../utils/auth');
const cacheService = require('../services/cacheService');

// ==========================================
// KEYWORDS & DASHBOARD TELEMETRY STATS API
// ==========================================

// Get all unique keywords across the system or scoped by project
router.get('/keywords/all', (req, res) => {
  try {
    const { project_id } = req.query;
    const db = getDb();
    let sql = `
      SELECT k.keyword, COUNT(*) as count
      FROM keywords k
      JOIN papers p ON p.id = k.paper_id
    `;
    const params = [];
    if (project_id) {
      sql += ` WHERE p.project_id = ? `;
      params.push(project_id);
    }
    sql += ` GROUP BY k.keyword ORDER BY count DESC, k.keyword ASC `;
    const keywords = db.prepare(sql).all(...params);
    res.json(keywords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get keywords for a paper
router.get('/keywords', (req, res) => {
  try {
    const { paper_id } = req.query;
    if (!paper_id) return res.status(400).json({ error: 'paper_id query param is required' });

    const db = getDb();
    const keywords = db.prepare('SELECT * FROM keywords WHERE paper_id = ?').all(paper_id);
    res.json(keywords);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add keyword to a paper
router.post('/keywords', async (req, res) => {
  try {
    const { paper_id, keyword } = req.body;
    if (!paper_id || !keyword) return res.status(400).json({ error: 'paper_id and keyword are required' });

    const cleanKw = keyword.trim();
    if (!cleanKw) return res.status(400).json({ error: 'keyword cannot be empty' });

    const db = getDb();
    const paper = db.prepare('SELECT project_id FROM papers WHERE id = ?').get(paper_id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    if (req.user) {
      const role = getProjectRole(req.user.id, paper.project_id);
      if (role === 'viewer') {
        return res.status(403).json({ error: 'Access Denied: Viewers cannot add keywords to papers.' });
      }
    }

    // Check if duplicate
    const exists = db.prepare('SELECT id FROM keywords WHERE paper_id = ? AND keyword = ?').get(paper_id, cleanKw);
    if (exists) return res.json(exists);

    const result = db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)').run(paper_id, cleanKw);
    await cacheService.invalidateSurveyCache(paper.project_id);
    res.status(201).json({ id: result.lastInsertRowid, paper_id, keyword: cleanKw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete keyword
router.delete('/keywords/:id', async (req, res) => {
  try {
    const db = getDb();
    const kw = db.prepare(`
      SELECT k.id, k.paper_id, p.project_id 
      FROM keywords k 
      JOIN papers p ON p.id = k.paper_id 
      WHERE k.id = ?
    `).get(req.params.id);

    if (!kw) return res.status(404).json({ error: 'Keyword not found' });

    if (req.user) {
      const role = getProjectRole(req.user.id, kw.project_id);
      if (role === 'viewer') {
        return res.status(403).json({ error: 'Access Denied: Viewers cannot delete keywords.' });
      }
    }

    const result = db.prepare('DELETE FROM keywords WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Keyword not found' });
    await cacheService.invalidateSurveyCache(kw.project_id);
    res.json({ success: true, message: 'Keyword deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard & Overview Live Telemetry Stats (Sub-millisecond cache-aside)
router.get('/stats', async (req, res) => {
  try {
    const { project_id } = req.query;

    const { data, cached } = await cacheService.getStats(project_id, async () => {
      const db = getDb();
      let totalPapers, readPapers, inProgressPapers, unreadPapers, totalClusters, totalKeywords, totalDynamicCols, yearSpan, domainDist, clusterBreakdown;

      if (project_id) {
        totalPapers = db.prepare('SELECT COUNT(*) as c FROM papers WHERE project_id = ?').get(project_id).c;
        readPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE project_id = ? AND status = 'read'").get(project_id).c;
        inProgressPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE project_id = ? AND status = 'in_progress'").get(project_id).c;
        unreadPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE project_id = ? AND (status = 'unread' OR status IS NULL)").get(project_id).c;
        totalClusters = db.prepare('SELECT COUNT(*) as c FROM clusters WHERE project_id = ?').get(project_id).c;
        totalKeywords = db.prepare('SELECT COUNT(DISTINCT k.keyword) as c FROM keywords k JOIN papers p ON p.id = k.paper_id WHERE p.project_id = ?').get(project_id).c;
        totalDynamicCols = db.prepare('SELECT COUNT(*) as c FROM dynamic_columns dc JOIN clusters c ON c.id = dc.cluster_id WHERE c.project_id = ?').get(project_id).c;

        yearSpan = db.prepare('SELECT MIN(year) as min_year, MAX(year) as max_year FROM papers WHERE project_id = ? AND year IS NOT NULL').get(project_id);

        domainDist = db.prepare(`
          SELECT domain, COUNT(*) as count 
          FROM papers 
          WHERE project_id = ? AND domain IS NOT NULL AND domain != '' 
          GROUP BY domain 
          ORDER BY count DESC
        `).all(project_id);

        clusterBreakdown = db.prepare(`
          SELECT c.id, c.name, c.color, c.description, COUNT(p.id) as paper_count,
                 SUM(CASE WHEN p.status = 'read' THEN 1 ELSE 0 END) as read_count,
                 SUM(CASE WHEN p.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
                 SUM(CASE WHEN p.status = 'unread' OR p.status IS NULL THEN 1 ELSE 0 END) as unread_count
          FROM clusters c
          LEFT JOIN papers p ON p.cluster_id = c.id
          WHERE c.project_id = ?
          GROUP BY c.id
          ORDER BY c.id ASC
        `).all(project_id);
      } else {
        totalPapers = db.prepare('SELECT COUNT(*) as c FROM papers').get().c;
        readPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE status = 'read'").get().c;
        inProgressPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE status = 'in_progress'").get().c;
        unreadPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE status = 'unread' OR status IS NULL").get().c;
        totalClusters = db.prepare('SELECT COUNT(*) as c FROM clusters').get().c;
        totalKeywords = db.prepare('SELECT COUNT(DISTINCT keyword) as c FROM keywords').get().c;
        totalDynamicCols = db.prepare('SELECT COUNT(*) as c FROM dynamic_columns').get().c;

        yearSpan = db.prepare('SELECT MIN(year) as min_year, MAX(year) as max_year FROM papers WHERE year IS NOT NULL').get();

        domainDist = db.prepare(`
          SELECT domain, COUNT(*) as count 
          FROM papers 
          WHERE domain IS NOT NULL AND domain != '' 
          GROUP BY domain 
          ORDER BY count DESC
        `).all();

        clusterBreakdown = db.prepare(`
          SELECT c.id, c.name, c.color, c.description, COUNT(p.id) as paper_count,
                 SUM(CASE WHEN p.status = 'read' THEN 1 ELSE 0 END) as read_count,
                 SUM(CASE WHEN p.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
                 SUM(CASE WHEN p.status = 'unread' OR p.status IS NULL THEN 1 ELSE 0 END) as unread_count
          FROM clusters c
          LEFT JOIN papers p ON p.cluster_id = c.id
          GROUP BY c.id
          ORDER BY c.id ASC
        `).all();
      }

      return {
        total_papers: totalPapers,
        read_papers: readPapers,
        in_progress_papers: inProgressPapers,
        unread_papers: unreadPapers,
        pending_papers: unreadPapers + inProgressPapers,
        total_clusters: totalClusters,
        total_keywords: totalKeywords,
        total_unique_keywords: totalKeywords,
        total_dynamic_columns: totalDynamicCols,
        year_span: yearSpan,
        domain_distribution: domainDist,
        cluster_breakdown: clusterBreakdown
      };
    });

    res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/synthesis/summary - Generate or retrieve full project structured literature review synthesis
router.get('/synthesis/summary', (req, res) => {
  try {
    const { project_id } = req.query;
    const db = getDb();
    const pid = project_id ? parseInt(project_id, 10) : 1;

    const project = db.prepare('SELECT id, name, description FROM projects WHERE id = ?').get(pid);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const clusters = db.prepare('SELECT * FROM clusters WHERE project_id = ? ORDER BY id ASC').all(pid);
    const papers = db.prepare('SELECT * FROM papers WHERE project_id = ? ORDER BY year DESC, id ASC').all(pid);

    let md = `# Systematic Literature Review & Benchmark Synthesis\n\n`;
    md += `**Project:** ${project.name}\n\n`;
    md += `*${project.description || 'Systematic comparative benchmarking across research taxonomies.'}*\n\n`;
    md += `## 1. Executive Taxonomy Overview\n\n`;
    md += `Total Clusters Identified: ${clusters.length} | Total Ingested Manuscripts: ${papers.length}\n\n`;

    clusters.forEach((c, idx) => {
      const cPapers = papers.filter(p => p.cluster_id === c.id);
      md += `### 1.${idx + 1} Cluster: ${c.name}\n`;
      md += `- **Description:** ${c.description || 'N/A'}\n`;
      md += `- **Analyzed Papers (${cPapers.length}):**\n`;
      cPapers.forEach(p => {
        md += `  - **${p.title}** (${p.authors || 'Unknown'}, ${p.year || 'N/A'})\n`;
        if (p.intuition) md += `    - *Core Intuition:* ${p.intuition}\n`;
        if (p.doi) md += `    - *DOI:* [${p.doi}](https://doi.org/${p.doi})\n`;
      });
      md += `\n`;
    });

    res.json({
      project_id: pid,
      project_name: project.name,
      clusters_count: clusters.length,
      papers_count: papers.length,
      synthesis_markdown: md
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
