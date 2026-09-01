const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db');
const { parsePdfMetadata } = require('../utils/pdfParser');
const { getProjectRole, recalculateUserStorage } = require('../utils/auth');

// Configure Multer for PDF uploads (Root /uploads directory)
const rootUploadsDir = path.resolve(__dirname, '../../../uploads');
const backendUploadsDir = path.resolve(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = rootUploadsDir;
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitized);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ==========================================
// FILE UPLOAD API (PDFs with Smart Extraction)
// ==========================================

async function handlePdfUpload(req, res) {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded' });
    }

    let { cluster_id, new_cluster_name, project_id, title: customTitle, authors: customAuthors, year: customYear, pub: customPub, domain: customDomain, new_domain_name, status: customStatus, doi: customDoi } = req.body;
    const db = getDb();
    const pid = project_id ? parseInt(project_id, 10) : 1;

    // RBAC Role Verification
    if (req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot upload papers to this survey. Ingestion requires Owner or Editor role.` });
      }
    }

    // Direct Cluster Creation during upload if requested
    if (new_cluster_name && new_cluster_name.trim()) {
      const createCluster = db.prepare('INSERT INTO clusters (project_id, name, description, color) VALUES (?, ?, ?, ?)');
      const cRes = createCluster.run(pid, new_cluster_name.trim(), 'Created during upload', '#38bdf8');
      cluster_id = cRes.lastInsertRowid;
    }

    // Direct Domain Creation
    let targetDomain = customDomain || 'General';
    if (new_domain_name && new_domain_name.trim()) {
      targetDomain = new_domain_name.trim();
    } else if (targetDomain === '__new__' && new_domain_name) {
      targetDomain = new_domain_name.trim();
    }

    let targetClusterId = (cluster_id && cluster_id !== 'unassigned' && cluster_id !== '__new__' && cluster_id !== 'null' && cluster_id !== '') ? parseInt(cluster_id, 10) : null;
    const uploaded = [];

    const insertPaper = db.prepare(`
      INSERT INTO papers (
        project_id, cluster_id, title, authors, year, pub, doi, pdf_url,
        status, domain, intuition, equation, strengths, gaps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
    `);

    for (const file of files) {
      const relPath = `/uploads/${file.filename}`;
      // Smart PDF extraction (reads first page, title, authors, year, doi, intuition)
      const parsed = await parsePdfMetadata(file.path, file.originalname);

      const paperTitle = (customTitle && customTitle.trim()) || parsed.title || (file.originalname ? file.originalname.replace(/\.pdf$/i, '') : '-');
      const paperAuthors = (customAuthors && customAuthors.trim()) || parsed.authors || '-';
      const paperYear = (customYear && String(customYear).trim()) || (parsed.year ? String(parsed.year) : '-');
      const paperPub = (customPub && customPub.trim()) || '-';
      const paperDoi = (customDoi && customDoi.trim()) || parsed.doi || '-';
      const paperDomain = (targetDomain && targetDomain.trim()) || '-';
      const paperStatus = customStatus || 'unread';

      const pRes = insertPaper.run(
        pid,
        targetClusterId,
        paperTitle,
        paperAuthors,
        paperYear,
        paperPub,
        paperDoi,
        relPath,
        paperStatus,
        paperDomain,
        parsed.intuition || '-'
      );
      const paperId = pRes.lastInsertRowid;
      const dbPdfUrl = `/api/papers/${paperId}/pdf`;
      db.prepare('UPDATE papers SET pdf_url = ? WHERE id = ?').run(dbPdfUrl, paperId);

      // Persist binary PDF into SQLite database
      try {
        const fileBuffer = fs.readFileSync(file.path);
        db.prepare(`
          INSERT OR REPLACE INTO paper_files (paper_id, filename, mimetype, file_size, data)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          paperId,
          file.filename,
          file.mimetype || 'application/pdf',
          file.size,
          fileBuffer
        );
      } catch (dbErr) {
        console.warn('Failed to insert PDF blob into database:', dbErr.message);
      }

      uploaded.push({
        id: paperId,
        paper_id: paperId,
        project_id: pid,
        cluster_id: targetClusterId,
        title: paperTitle,
        authors: paperAuthors,
        year: paperYear,
        pub: paperPub,
        doi: paperDoi,
        pdf_url: dbPdfUrl,
        domain: paperDomain,
        status: paperStatus,
        filename: file.filename,
        original_name: file.originalname,
        size: file.size,
        path: dbPdfUrl,
        extracted: parsed
      });
    }

    if (req.user && req.user.id) {
      recalculateUserStorage(req.user.id);
    }

    res.status(201).json({
      success: true,
      ingested_count: uploaded.length,
      count: uploaded.length,
      files: uploaded,
      paper: uploaded[0],
      target_cluster_id: targetClusterId
    });
  } catch (err) {
    console.error('PDF upload handler error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/upload', upload.any(), handlePdfUpload);
router.post('/papers/bulk-upload', upload.any(), handlePdfUpload);
router.post('/papers/bulk-assign', (req, res) => {
  res.redirect(307, '/api/papers/bulk-reassign');
});

module.exports = router;
