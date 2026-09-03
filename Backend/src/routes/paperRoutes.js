const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { getProjectRole, recalculateUserStorage, logAuditEvent } = require('../utils/auth');

// ==========================================
// PAPERS CRUD & FILTERING API
// ==========================================

// Get papers with filtering & search
router.get('/papers', (req, res) => {
  try {
    const db = getDb();
    const { cluster_id, project_id, search, domain, status, year, sort } = req.query;

    let sql = `
      WITH numbered_papers AS (
        SELECT p.*,
               ROW_NUMBER() OVER (PARTITION BY p.project_id ORDER BY p.id ASC) as serial_no
        FROM papers p
      )
      SELECT p.*, c.name as cluster_name, c.color as cluster_color
      FROM numbered_papers p
      LEFT JOIN clusters c ON c.id = p.cluster_id
      WHERE 1=1
    `;
    const params = [];

    if (cluster_id === 'unassigned') {
      sql += ` AND p.cluster_id IS NULL `;
    } else if (cluster_id && cluster_id !== 'all') {
      sql += ` AND p.cluster_id = ? `;
      params.push(cluster_id);
    }

    if (project_id) {
      sql += ` AND p.project_id = ? `;
      params.push(project_id);
    }

    if (domain && domain !== 'all') {
      sql += ` AND (p.domain LIKE ? OR p.domain = ?) `;
      params.push(`%${domain}%`, domain);
    }

    if (status && status !== 'all') {
      sql += ` AND p.status = ? `;
      params.push(status);
    }

    if (year) {
      sql += ` AND p.year = ? `;
      params.push(year);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      sql += ` AND (
        p.title LIKE ? OR 
        p.authors LIKE ? OR 
        p.intuition LIKE ? OR 
        p.pub LIKE ? OR 
        p.domain LIKE ? OR 
        p.equation LIKE ? OR 
        p.strengths LIKE ? OR 
        p.gaps LIKE ? OR
        EXISTS (SELECT 1 FROM keywords k WHERE k.paper_id = p.id AND k.keyword LIKE ?) OR
        EXISTS (SELECT 1 FROM paper_column_values pcv WHERE pcv.paper_id = p.id AND pcv.value LIKE ?)
      ) `;
      params.push(term, term, term, term, term, term, term, term, term, term);
    }

    // Sorting
    if (sort === 'year_asc') {
      sql += ` ORDER BY p.year ASC, p.id ASC`;
    } else if (sort === 'title') {
      sql += ` ORDER BY p.title ASC`;
    } else {
      sql += ` ORDER BY p.year DESC, p.id ASC`;
    }

    const papers = db.prepare(sql).all(...params);

    // Fetch dynamic column values and keywords in bulk for efficiency
    if (papers.length > 0) {
      const paperIds = papers.map(p => p.id);
      const placeholders = paperIds.map(() => '?').join(',');

      const values = db.prepare(`
        SELECT pcv.paper_id, pcv.column_id, pcv.value, dc.column_name, dc.parent_column_id, dc.col_type
        FROM paper_column_values pcv
        JOIN dynamic_columns dc ON dc.id = pcv.column_id
        WHERE pcv.paper_id IN (${placeholders})
      `).all(...paperIds);

      const keywords = db.prepare(`
        SELECT paper_id, keyword
        FROM keywords
        WHERE paper_id IN (${placeholders})
      `).all(...paperIds);

      const valMap = {};
      for (const v of values) {
        if (!valMap[v.paper_id]) valMap[v.paper_id] = {};
        valMap[v.paper_id][v.column_name] = v.value;
        valMap[v.paper_id][`col_${v.column_id}`] = v.value;
        valMap[v.paper_id][v.column_id] = v.value;
      }

      // If child columns exist, ensure parent split column has structured JSON representation
      for (const pId of paperIds) {
        if (!valMap[pId]) continue;
        for (const v of values) {
          if (v.parent_column_id) {
            const parentId = v.parent_column_id;
            const parentCol = values.find(col => col.column_id === parentId);
            const parentName = parentCol ? parentCol.column_name : null;
            const curParentVal = valMap[pId][parentId] || (parentName ? valMap[pId][parentName] : null);

            if (!curParentVal || (typeof curParentVal === 'string' && !curParentVal.startsWith('{'))) {
              const childVals = {};
              for (const cv of values) {
                if (cv.paper_id === pId && cv.parent_column_id === parentId && cv.value) {
                  const shortKey = cv.column_name.match(/\(([^)]+)\)$/)?.[1] || cv.column_name;
                  childVals[shortKey] = cv.value;
                }
              }
              if (Object.keys(childVals).length > 0) {
                const jsonStr = JSON.stringify(childVals);
                valMap[pId][parentId] = jsonStr;
                if (parentName) valMap[pId][parentName] = jsonStr;
                valMap[pId][`col_${parentId}`] = jsonStr;
              }
            }
          }
        }
      }

      const kwMap = {};
      for (const k of keywords) {
        if (!kwMap[k.paper_id]) kwMap[k.paper_id] = [];
        kwMap[k.paper_id].push(k.keyword);
      }

      for (const p of papers) {
        p.custom_columns = valMap[p.id] || {};
        p.keywords = kwMap[p.id] || [];

        // Parse strengths and gaps if JSON
        try {
          if (p.strengths && p.strengths.startsWith('[')) p.strengths_list = JSON.parse(p.strengths);
          else p.strengths_list = p.strengths ? [p.strengths] : [];
        } catch (e) {
          p.strengths_list = p.strengths ? [p.strengths] : [];
        }

        try {
          if (p.gaps && p.gaps.startsWith('[')) p.gaps_list = JSON.parse(p.gaps);
          else p.gaps_list = p.gaps ? [p.gaps] : [];
        } catch (e) {
          p.gaps_list = p.gaps ? [p.gaps] : [];
        }

        p.advantages = (p.advantages && p.advantages !== '-') ? p.advantages : (p.strengths || '-');
        p.criticism = (p.criticism && p.criticism !== '-') ? p.criticism : (p.gaps || '-');
        p.future_directions = p.future_directions || '-';
      }
    }

    res.json(papers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single paper with all dynamic columns and keywords
router.get('/papers/:id', (req, res) => {
  try {
    const db = getDb();
    const paper = db.prepare(`
      WITH numbered_papers AS (
        SELECT p.*,
               ROW_NUMBER() OVER (PARTITION BY p.project_id ORDER BY p.id ASC) as serial_no
        FROM papers p
      )
      SELECT p.*, c.name as cluster_name, c.color as cluster_color
      FROM numbered_papers p
      LEFT JOIN clusters c ON c.id = p.cluster_id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    // Dynamic Columns and values for this paper's project and cluster
    const clusterCols = db.prepare(`
      SELECT MIN(dc.id) as id, MIN(dc.cluster_id) as cluster_id, dc.column_name, dc.column_name as name, dc.parent_column_id, dc.col_type, p.column_name as parent_column_name
      FROM dynamic_columns dc
      LEFT JOIN clusters c ON c.id = dc.cluster_id
      LEFT JOIN dynamic_columns p ON p.id = dc.parent_column_id
      WHERE (c.project_id IS NOT NULL AND c.project_id = ?)
         OR (dc.cluster_id IS NOT NULL AND dc.cluster_id = ?)
         OR dc.id IN (SELECT pcv.column_id FROM paper_column_values pcv JOIN papers pa ON pa.id = pcv.paper_id WHERE pa.project_id = ?)
      GROUP BY dc.column_name
      ORDER BY dc.parent_column_id ASC, MIN(dc.id) ASC
    `).all(paper.project_id || 0, paper.cluster_id || 0, paper.project_id || 0);

    const colValues = db.prepare(`
      SELECT pcv.*, dc.column_name, dc.parent_column_id, dc.col_type
      FROM paper_column_values pcv
      JOIN dynamic_columns dc ON dc.id = pcv.column_id
      WHERE pcv.paper_id = ?
    `).all(req.params.id);

    const keywords = db.prepare('SELECT id, keyword FROM keywords WHERE paper_id = ?').all(req.params.id);

    // Formatted column dictionary
    const columnsDict = {};
    for (const cv of colValues) {
      columnsDict[cv.column_name] = cv.value;
      columnsDict[cv.column_id] = cv.value;
    }

    try {
      paper.strengths_list = (paper.strengths && paper.strengths.startsWith('[')) ? JSON.parse(paper.strengths) : (paper.strengths ? [paper.strengths] : []);
    } catch (e) {
      paper.strengths_list = [paper.strengths];
    }

    try {
      paper.gaps_list = (paper.gaps && paper.gaps.startsWith('[')) ? JSON.parse(paper.gaps) : (paper.gaps ? [paper.gaps] : []);
    } catch (e) {
      paper.gaps_list = [paper.gaps];
    }

    res.json({
      ...paper,
      cluster_columns: clusterCols,
      column_values: colValues,
      custom_columns: columnsDict,
      keywords: keywords.map(k => k.keyword),
      keywords_raw: keywords
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream PDF file directly from SQLite Database
router.get('/papers/:id/pdf', (req, res) => {
  try {
    const db = getDb();
    const paperId = parseInt(req.params.id, 10);
    if (!paperId) return res.status(400).send('Invalid paper ID');

    const row = db.prepare('SELECT filename, mimetype, file_size, data FROM paper_files WHERE paper_id = ?').get(paperId);

    if (row && row.data) {
      const buffer = Buffer.from(row.data);
      res.setHeader('Content-Type', row.mimetype || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(buffer);
    }

    // Fallback check if paper has a legacy pdf_url or file on disk
    const paper = db.prepare('SELECT pdf_url, title FROM papers WHERE id = ?').get(paperId);
    if (paper && paper.pdf_url) {
      const pathModule = require('path');
      const fsModule = require('fs');
      const filename = pathModule.basename(paper.pdf_url);
      const backendUploads = pathModule.join(__dirname, '..', '..', 'uploads', filename);
      const backendAlt = pathModule.join(__dirname, '..', 'uploads', filename);
      const rootUploads = pathModule.join(__dirname, '..', '..', '..', 'uploads', filename);
      const filePath = fsModule.existsSync(backendUploads) ? backendUploads : (fsModule.existsSync(backendAlt) ? backendAlt : (fsModule.existsSync(rootUploads) ? rootUploads : null));

      if (filePath) {
        try {
          const fileBuf = fsModule.readFileSync(filePath);
          db.prepare(`
            INSERT OR REPLACE INTO paper_files (paper_id, filename, mimetype, file_size, data)
            VALUES (?, ?, ?, ?, ?)
          `).run(paperId, filename, 'application/pdf', fileBuf.length, fileBuf);
        } catch (e) {}

        return res.sendFile(filePath);
      }
    }

    return res.status(404).send('PDF file not found in database for this paper.');
  } catch (err) {
    res.status(500).send('Error retrieving PDF from database: ' + err.message);
  }
});

// Create paper
router.post('/papers', (req, res) => {
  try {
    const {
      cluster_id, project_id, title, authors, year, pub, domain, doi, pdf_url,
      status, intuition, equation, strengths, gaps,
      advantages, criticism, future_directions, future_research_direction,
      custom_columns, keywords
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Paper title is required' });

    const db = getDb();
    let pid = project_id ? parseInt(project_id, 10) : null;
    if (!pid && cluster_id) {
      const cluster = db.prepare('SELECT project_id FROM clusters WHERE id = ?').get(cluster_id);
      if (cluster) pid = cluster.project_id;
    }
    if (!pid) pid = 1;

    if (req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot add papers to this survey. Required: Owner or Editor.` });
      }
    }

    const rawAdv = advantages !== undefined ? advantages : strengths;
    const rawCrit = criticism !== undefined ? criticism : gaps;
    const rawFut = future_directions !== undefined ? future_directions : future_research_direction;

    const strengthsStr = Array.isArray(rawAdv) ? JSON.stringify(rawAdv) : (rawAdv || '-');
    const gapsStr = Array.isArray(rawCrit) ? JSON.stringify(rawCrit) : (rawCrit || '-');
    const advStr = Array.isArray(rawAdv) ? JSON.stringify(rawAdv) : (rawAdv || '-');
    const critStr = Array.isArray(rawCrit) ? JSON.stringify(rawCrit) : (rawCrit || '-');
    const futStr = Array.isArray(rawFut) ? JSON.stringify(rawFut) : (rawFut || '-');

    const finalTitle = (title && String(title).trim()) ? String(title).trim() : '-';
    const finalAuthors = (authors && String(authors).trim()) ? String(authors).trim() : '-';
    const finalYear = (year && String(year).trim()) ? String(year).trim() : '-';
    const finalPub = (pub && String(pub).trim()) ? String(pub).trim() : '-';
    const finalDomain = (domain && String(domain).trim()) ? String(domain).trim() : '-';
    const finalDoi = (doi && String(doi).trim()) ? String(doi).trim() : '-';

    const result = db.prepare(`
      INSERT INTO papers (
        project_id, cluster_id, title, authors, year, pub, domain, doi, pdf_url,
        status, intuition, equation, strengths, gaps, advantages, criticism, future_directions
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pid,
      cluster_id || null,
      finalTitle,
      finalAuthors,
      finalYear,
      finalPub,
      finalDomain,
      finalDoi,
      pdf_url || '',
      status || 'unread',
      intuition || '-',
      equation || '-',
      strengthsStr,
      gapsStr,
      advStr,
      critStr,
      futStr
    );

    const paperId = result.lastInsertRowid;

    // Handle initial custom columns
    if (custom_columns && typeof custom_columns === 'object') {
      const insertVal = db.prepare(`
        INSERT INTO paper_column_values (paper_id, column_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
      `);
      for (const [colKey, val] of Object.entries(custom_columns)) {
        let colId = null;
        if (!isNaN(colKey)) {
          colId = parseInt(colKey, 10);
        } else {
          const colRecord = db.prepare('SELECT id FROM dynamic_columns WHERE column_name = ? AND cluster_id = ?').get(colKey, cluster_id);
          if (colRecord) colId = colRecord.id;
        }
        if (colId) {
          const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
          insertVal.run(paperId, colId, valStr);
        }
      }
    }

    // Handle initial keywords
    if (Array.isArray(keywords) && keywords.length > 0) {
      const insertKw = db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)');
      for (const kw of keywords) {
        if (kw && String(kw).trim()) {
          insertKw.run(paperId, String(kw).trim());
        }
      }
    }

    res.status(201).json({ id: paperId, message: 'Paper added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update paper
router.put('/papers/:id', (req, res) => {
  try {
    const {
      cluster_id, title, authors, year, pub, domain, doi, pdf_url,
      status, intuition, equation, strengths, gaps,
      advantages, criticism, future_directions, future_research_direction,
      custom_columns, keywords,
      screening_decision, screening_reason
    } = req.body;

    const db = getDb();
    const paperId = req.params.id;

    const existing = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
    if (!existing) return res.status(404).json({ error: 'Paper not found' });

    if (req.user) {
      const role = getProjectRole(req.user.id, existing.project_id);
      if (role === 'viewer' && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot edit paper details.` });
      }
      if (role === 'reviewer' && req.user.role !== 'admin') {
        // Reviewers are permitted to update PRISMA screening, status, intuition, and gaps
        const modifyingCoreMetadata = (title !== undefined && title !== existing.title) ||
                                      (authors !== undefined && authors !== existing.authors) ||
                                      (year !== undefined && year !== existing.year) ||
                                      (pub !== undefined && pub !== existing.pub) ||
                                      (cluster_id !== undefined && cluster_id !== existing.cluster_id);
        if (modifyingCoreMetadata) {
          return res.status(403).json({ error: `Access Denied. Role '${role}' cannot edit paper core metadata (title, year, cluster).` });
        }
      }
    }

    const rawAdv = advantages !== undefined ? advantages : (strengths !== undefined ? strengths : existing.advantages);
    const rawCrit = criticism !== undefined ? criticism : (gaps !== undefined ? gaps : existing.criticism);
    const rawFut = future_directions !== undefined ? future_directions : (future_research_direction !== undefined ? future_research_direction : existing.future_directions);

    const strengthsStr = strengths !== undefined ? (Array.isArray(strengths) ? JSON.stringify(strengths) : String(strengths)) : (rawAdv ? (Array.isArray(rawAdv) ? JSON.stringify(rawAdv) : String(rawAdv)) : existing.strengths);
    const gapsStr = gaps !== undefined ? (Array.isArray(gaps) ? JSON.stringify(gaps) : String(gaps)) : (rawCrit ? (Array.isArray(rawCrit) ? JSON.stringify(rawCrit) : String(rawCrit)) : existing.gaps);
    const advStr = rawAdv !== undefined ? (Array.isArray(rawAdv) ? JSON.stringify(rawAdv) : String(rawAdv)) : existing.advantages;
    const critStr = rawCrit !== undefined ? (Array.isArray(rawCrit) ? JSON.stringify(rawCrit) : String(rawCrit)) : existing.criticism;
    const futStr = rawFut !== undefined ? (Array.isArray(rawFut) ? JSON.stringify(rawFut) : String(rawFut)) : existing.future_directions;

    db.prepare(`
      UPDATE papers SET
        cluster_id = COALESCE(?, cluster_id),
        title = COALESCE(?, title),
        authors = COALESCE(?, authors),
        year = COALESCE(?, year),
        pub = COALESCE(?, pub),
        domain = COALESCE(?, domain),
        doi = COALESCE(?, doi),
        pdf_url = COALESCE(?, pdf_url),
        status = COALESCE(?, status),
        intuition = COALESCE(?, intuition),
        equation = COALESCE(?, equation),
        strengths = ?,
        gaps = ?,
        advantages = ?,
        criticism = ?,
        future_directions = ?
      WHERE id = ?
    `).run(
      cluster_id !== undefined ? cluster_id : existing.cluster_id,
      title !== undefined ? title : existing.title,
      authors !== undefined ? authors : existing.authors,
      year !== undefined ? (year ? parseInt(year, 10) : null) : existing.year,
      pub !== undefined ? pub : existing.pub,
      domain !== undefined ? domain : existing.domain,
      doi !== undefined ? doi : existing.doi,
      pdf_url !== undefined ? pdf_url : existing.pdf_url,
      status !== undefined ? status : existing.status,
      intuition !== undefined ? intuition : existing.intuition,
      equation !== undefined ? equation : existing.equation,
      strengthsStr,
      gapsStr,
      advStr,
      critStr,
      futStr,
      paperId
    );

    // If PRISMA screening decision provided, upsert into paper_screening table
    if (screening_decision && ['included', 'excluded', 'uncertain'].includes(screening_decision)) {
      try {
        const uId = req.user ? req.user.id : 1;
        const uName = req.user ? (req.user.name || req.user.username || 'Reviewer') : 'Reviewer';
        db.prepare(`
          INSERT INTO paper_screening (paper_id, user_id, user_name, decision, exclusion_reason)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(paper_id, user_id) DO UPDATE SET
            decision = excluded.decision,
            exclusion_reason = excluded.exclusion_reason,
            updated_at = CURRENT_TIMESTAMP
        `).run(paperId, uId, uName, screening_decision, screening_reason || '');
      } catch (screenErr) {
        console.warn('Notice: Screening record upsert', screenErr.message);
      }
    }

    // Update custom column values if provided
    if (custom_columns && typeof custom_columns === 'object') {
      const upsertColVal = db.prepare(`
        INSERT INTO paper_column_values (paper_id, column_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
      `);
      for (const [colKey, val] of Object.entries(custom_columns)) {
        let colId = parseInt(colKey, 10);
        if (isNaN(colId)) {
          // Look up column by name in paper's cluster
          const targetCluster = cluster_id || existing.cluster_id;
          const found = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND column_name = ?').get(targetCluster, colKey);
          if (found) colId = found.id;
        }
        if (!isNaN(colId)) {
          upsertColVal.run(paperId, colId, typeof val === 'object' ? JSON.stringify(val) : String(val));
        }
      }
    }

    // Update keywords if provided
    if (Array.isArray(keywords)) {
      db.prepare('DELETE FROM keywords WHERE paper_id = ?').run(paperId);
      const insertKw = db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)');
      for (const kw of keywords) {
        if (kw && String(kw).trim()) insertKw.run(paperId, String(kw).trim());
      }
    }

    const updated = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fast Status Toggle (unread / in_progress / read)
router.patch('/papers/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['unread', 'in_progress', 'read'].includes(status)) {
      return res.status(400).json({ error: 'Status must be unread, in_progress, or read' });
    }
    const db = getDb();
    const result = db.prepare('UPDATE papers SET status = ? WHERE id = ?').run(status, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Paper not found' });
    res.json({ success: true, id: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Reassign Papers to a Cluster (or unassign)
router.post('/papers/bulk-reassign', (req, res) => {
  try {
    const { paper_ids, cluster_id } = req.body;
    if (!Array.isArray(paper_ids) || paper_ids.length === 0) {
      return res.status(400).json({ error: 'paper_ids array is required' });
    }
    const db = getDb();

    if (req.user && paper_ids.length > 0) {
      const firstPaper = db.prepare('SELECT project_id FROM papers WHERE id = ?').get(paper_ids[0]);
      if (firstPaper) {
        const role = getProjectRole(req.user.id, firstPaper.project_id);
        if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
          return res.status(403).json({ error: `Access Denied. Role '${role}' cannot reassign papers. Required: Owner or Editor.` });
        }
      }
    }

    const targetClusterId = (cluster_id && cluster_id !== 'unassigned' && cluster_id !== 'null') ? parseInt(cluster_id, 10) : null;

    db.exec('BEGIN TRANSACTION;');
    try {
      const updateStmt = db.prepare('UPDATE papers SET cluster_id = ? WHERE id = ?');
      for (const pid of paper_ids) {
        updateStmt.run(targetClusterId, pid);
      }
      db.exec('COMMIT;');
      res.json({ success: true, count: paper_ids.length, cluster_id: targetClusterId });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete paper
router.delete('/papers/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id, project_id, title, pdf_url FROM papers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Paper not found' });

    if (req.user) {
      const role = getProjectRole(req.user.id, existing.project_id);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot delete papers. Required: Owner or Editor.` });
      }
    }

    // Clean up associated physical disk PDF file if exists
    if (existing.pdf_url && existing.pdf_url.startsWith('/uploads/')) {
      const filename = path.basename(existing.pdf_url);
      const rootUploads = path.resolve(__dirname, '../../../uploads', filename);
      const backendUploads = path.resolve(__dirname, '../../uploads', filename);
      try {
        if (fs.existsSync(rootUploads)) fs.unlinkSync(rootUploads);
      } catch (_) {}
      try {
        if (fs.existsSync(backendUploads)) fs.unlinkSync(backendUploads);
      } catch (_) {}
    }

    const result = db.prepare('DELETE FROM papers WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Paper not found' });

    if (req.user && req.user.id) {
      recalculateUserStorage(req.user.id);
      if (typeof logAuditEvent === 'function') {
        logAuditEvent(req, 'DELETE_PAPER', `Deleted paper #${existing.id} ("${existing.title}") from project #${existing.project_id}`);
      }
    }

    res.json({ success: true, message: 'Paper deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
