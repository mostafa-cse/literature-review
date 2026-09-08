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

    // Check if extraction was explicitly requested (default is fast upload without extraction)
    const shouldExtract = (req.body.extract_metadata === 'true' || req.body.extract_metadata === true) && req.body.skip_extraction !== 'true' && req.body.skip_extraction !== true;

    // Parse custom_columns passed from the frontend form
    let customColumns = {};
    if (req.body.custom_columns) {
      try {
        customColumns = typeof req.body.custom_columns === 'string'
          ? JSON.parse(req.body.custom_columns)
          : req.body.custom_columns;
      } catch (err) {
        console.warn('Failed to parse custom_columns JSON in upload:', err.message);
      }
    }

    const insertPaper = db.prepare(`
      INSERT INTO papers (
        project_id, cluster_id, title, authors, year, pub, doi, pdf_url,
        status, domain, intuition, equation, strengths, gaps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
    `);

    const insertColVal = db.prepare(`
      INSERT INTO paper_column_values (paper_id, column_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
    `);

    for (const file of files) {
      const relPath = `/uploads/${file.filename}`;
      let parsed = {};

      if (shouldExtract) {
        try {
          parsed = await parsePdfMetadata(file.path, file.originalname);
        } catch (parseErr) {
          console.warn('Background PDF parse notice (non-fatal):', parseErr.message);
        }
      }

      // Fast fallback resolution
      const rawOriginal = file.originalname ? file.originalname.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ') : '-';
      const paperTitle = (customTitle && customTitle.trim() && customTitle.trim() !== '-')
        ? customTitle.trim()
        : (parsed.title || rawOriginal);

      const paperAuthors = (customAuthors && customAuthors.trim() && customAuthors.trim() !== '-')
        ? customAuthors.trim()
        : (parsed.authors || '-');

      const paperYear = (customYear && String(customYear).trim() && String(customYear).trim() !== '-')
        ? String(customYear).trim()
        : (parsed.year ? String(parsed.year) : String(new Date().getFullYear()));

      const paperPub = (customPub && customPub.trim() && customPub.trim() !== '-')
        ? customPub.trim()
        : '-';

      const paperDoi = (customDoi && customDoi.trim() && customDoi.trim() !== '-')
        ? customDoi.trim()
        : (parsed.doi || '-');

      const paperDomain = (targetDomain && targetDomain.trim() && targetDomain.trim() !== '-')
        ? targetDomain.trim()
        : 'General';

      const paperStatus = customStatus || 'unread';
      const paperIntuition = (req.body.intuition && req.body.intuition.trim())
        || (req.body.abstract && req.body.abstract.trim())
        || parsed.intuition
        || '-';

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
        paperIntuition
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

      // 1. Insert explicit custom column values passed from the upload modal
      if (customColumns && typeof customColumns === 'object') {
        for (const [colKey, val] of Object.entries(customColumns)) {
          if (val === undefined || val === null || String(val).trim() === '') continue;
          let colId = null;
          if (!isNaN(colKey)) {
            colId = parseInt(colKey, 10);
          } else {
            const colRecord = db.prepare(`
              SELECT dc.id FROM dynamic_columns dc
              LEFT JOIN clusters c ON c.id = dc.cluster_id
              WHERE LOWER(dc.column_name) = LOWER(?) AND (dc.cluster_id = ? OR c.project_id = ?)
              LIMIT 1
            `).get(colKey, targetClusterId, pid);
            if (colRecord) colId = colRecord.id;
          }
          if (colId) {
            const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            insertColVal.run(paperId, colId, valStr);
          }
        }
      }

      // 2. Auto-populate matching dynamic columns from DOI metadata if present in project
      if (paperDoi && paperDoi !== '-') {
        try {
          const projCols = db.prepare(`
            SELECT dc.id, dc.column_name FROM dynamic_columns dc
            LEFT JOIN clusters c ON c.id = dc.cluster_id
            WHERE c.project_id = ? OR dc.cluster_id = ?
          `).all(pid, targetClusterId);

          for (const col of projCols) {
            const cLower = col.column_name.toLowerCase().trim();
            // Check if already populated
            const existing = db.prepare('SELECT 1 FROM paper_column_values WHERE paper_id = ? AND column_id = ?').get(paperId, col.id);
            if (existing) continue;

            let autoVal = null;
            if (cLower === 'doi') {
              autoVal = paperDoi;
            } else if (cLower === 'year' || cLower === 'publication year') {
              if (paperYear && paperYear !== '-') autoVal = paperYear;
            } else if (cLower === 'authors' || cLower === 'author') {
              if (paperAuthors && paperAuthors !== '-') autoVal = paperAuthors;
            } else if (['venue', 'pub', 'publisher', 'journal', 'conference'].includes(cLower)) {
              if (paperPub && paperPub !== '-') autoVal = paperPub;
            } else if (['abstract', 'intuition', 'summary', 'overview'].includes(cLower)) {
              if (paperIntuition && paperIntuition !== '-') autoVal = paperIntuition;
            }

            if (autoVal) {
              insertColVal.run(paperId, col.id, String(autoVal));
            }
          }
        } catch (mapErr) {
          console.warn('Auto column mapping notice:', mapErr.message);
        }
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
        intuition: paperIntuition,
        filename: file.filename,
        original_name: file.originalname,
        size: file.size,
        path: dbPdfUrl,
        extracted: parsed
      });
    }

    // Invalidate caches so the newly ingested paper and columns appear immediately
    try {
      const cacheService = require('../services/cacheService');
      await cacheService.invalidateSurveyCache(pid).catch(() => {});
    } catch (cErr) {}

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

// ==========================================
// ASYNC PDF INGESTION (BullMQ Queue Dispatch)
// ==========================================
async function handleAsyncPdfUpload(req, res) {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded' });
    }

    const queueService = require('../services/queueService');
    const {
      project_id, cluster_id, domain, new_cluster_name, new_domain_name,
      title: customTitle, authors: customAuthors, year: customYear, pub: customPub,
      doi: customDoi, status: customStatus, intuition: customIntuition
    } = req.body;
    const pid = project_id ? parseInt(project_id, 10) : 1;

    // RBAC Role Verification
    if (req.user) {
      const role = getProjectRole(req.user.id, pid);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot upload papers to this survey. Ingestion requires Owner or Editor role.` });
      }
    }

    const db = getDb();

    // Direct Cluster Creation during upload if requested
    let targetClusterId = (cluster_id && cluster_id !== 'unassigned' && cluster_id !== '__new__' && cluster_id !== 'null' && cluster_id !== '') ? parseInt(cluster_id, 10) : null;
    if (new_cluster_name && new_cluster_name.trim()) {
      const createCluster = db.prepare('INSERT INTO clusters (project_id, name, description, color) VALUES (?, ?, ?, ?)');
      const cRes = createCluster.run(pid, new_cluster_name.trim(), 'Created during upload', '#38bdf8');
      targetClusterId = cRes.lastInsertRowid;
    }

    // Direct Domain Creation
    let targetDomain = domain || 'General';
    if (new_domain_name && new_domain_name.trim()) {
      targetDomain = new_domain_name.trim();
    } else if (targetDomain === '__new__' && new_domain_name) {
      targetDomain = new_domain_name.trim();
    }

    // Parse custom_columns passed from the frontend form
    let customColumns = {};
    if (req.body.custom_columns) {
      try {
        customColumns = typeof req.body.custom_columns === 'string'
          ? JSON.parse(req.body.custom_columns)
          : req.body.custom_columns;
      } catch (err) {
        console.warn('Failed to parse custom_columns JSON in async upload:', err.message);
      }
    }

    const insertColVal = db.prepare(`
      INSERT INTO paper_column_values (paper_id, column_id, value)
      VALUES (?, ?, ?)
      ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
    `);

    const jobs = [];
    for (const file of files) {
      const rawOriginal = file.originalname ? file.originalname.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ') : '-';
      const paperTitle = (files.length === 1 && customTitle && customTitle.trim() && customTitle.trim() !== '-')
        ? customTitle.trim()
        : (file.originalname ? file.originalname.replace(/\.pdf$/i, '') : 'Processing Manuscript...');
      const paperAuthors = (files.length === 1 && customAuthors && customAuthors.trim() && customAuthors.trim() !== '-')
        ? customAuthors.trim()
        : 'Extracting Authors...';
      const paperYear = (files.length === 1 && customYear && customYear.trim() && customYear.trim() !== '-')
        ? customYear.trim()
        : String(new Date().getFullYear());
      const paperPub = (files.length === 1 && customPub && customPub.trim() && customPub.trim() !== '-')
        ? customPub.trim()
        : '';
      const paperDoi = (files.length === 1 && customDoi && customDoi.trim() && customDoi.trim() !== '-')
        ? customDoi.trim()
        : '';
      const paperStatus = customStatus || 'unread';
      const paperIntuition = (files.length === 1 && (customIntuition || req.body.intuition))
        ? (customIntuition || req.body.intuition)
        : '';

      const pRes = db.prepare(`
        INSERT INTO papers (
          project_id, cluster_id, title, authors, year, pub, doi, pdf_url,
          status, domain, intuition, equation, strengths, gaps
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '')
      `).run(
        pid,
        targetClusterId,
        paperTitle,
        paperAuthors,
        paperYear,
        paperPub,
        paperDoi,
        `/uploads/${file.filename}`,
        paperStatus,
        targetDomain,
        paperIntuition
      );

      const paperId = pRes.lastInsertRowid;

      // Save custom column values if provided for single upload
      if (files.length === 1 && Object.keys(customColumns).length > 0) {
        for (const [colId, val] of Object.entries(customColumns)) {
          if (val) {
            try {
              insertColVal.run(paperId, colId, String(val));
            } catch (colErr) {
              console.warn('Failed to insert custom column value:', colErr.message);
            }
          }
        }
      }

      try {
        const buffer = fs.readFileSync(file.path);
        db.prepare(`
          INSERT INTO paper_files (paper_id, filename, mimetype, file_size, data)
          VALUES (?, ?, ?, ?, ?)
        `).run(paperId, file.filename, file.mimetype || 'application/pdf', file.size, buffer);
      } catch (err) {}

      const job = await queueService.addJob(queueService.QUEUES.PDF_PROCESSING, {
        paperId,
        projectId: pid,
        localPath: file.path,
        originalFilename: file.originalname,
      });

      jobs.push({
        paperId,
        jobId: job.id,
        queueName: queueService.QUEUES.PDF_PROCESSING,
        statusUrl: `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${job.id}`,
        streamUrl: `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${job.id}/stream`,
        filename: file.originalname,
      });
    }

    if (req.user && req.user.id) {
      try {
        recalculateUserStorage(req.user.id);
      } catch (storageErr) {}
    }

    res.status(202).json({
      success: true,
      message: 'PDF processing job(s) enqueued successfully',
      count: jobs.length,
      jobs,
      job: jobs[0],
      streamUrl: `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${jobs[0].jobId}/stream`,
      batchStreamUrl: `/api/jobs/stream/batch?job_ids=${jobs.map(j => j.jobId).join(',')}&queue=${queueService.QUEUES.PDF_PROCESSING}`
    });
  } catch (err) {
    console.error('Async PDF upload error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ==========================================
// DIRECT PDF MANUSCRIPT ATTACH / UPLOAD API
// ==========================================
async function handlePaperDirectPdfUpload(req, res) {
  try {
    const paperId = parseInt(req.params.id || req.body.paper_id || req.body.id, 10);
    if (!paperId) {
      return res.status(400).json({ error: 'Invalid or missing paper ID' });
    }

    const db = getDb();
    const paper = db.prepare('SELECT id, project_id, title, doi FROM papers WHERE id = ?').get(paperId);
    if (!paper) {
      return res.status(404).json({ error: `Paper with ID ${paperId} not found` });
    }

    // RBAC Role Verification (if user is authenticated)
    if (req.user) {
      const role = getProjectRole(req.user.id, paper.project_id);
      if (!['owner', 'editor'].includes(role) && req.user.role !== 'admin') {
        return res.status(403).json({ error: `Access Denied. Role '${role}' cannot upload PDF to this paper.` });
      }
    }

    // Extract file from req.file or req.files
    let file = req.file;
    if (!file && req.files && req.files.length > 0) {
      file = req.files[0];
    }

    if (!file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Binary file buffer
    const fileBuffer = fs.readFileSync(file.path);
    const dbPdfUrl = `/api/papers/${paperId}/pdf`;

    // 1. Insert or replace binary PDF in SQLite paper_files
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

    // 2. Update paper pdf_url
    db.prepare('UPDATE papers SET pdf_url = ? WHERE id = ?').run(dbPdfUrl, paperId);

    // 3. Ensure disk file is also available in backend uploads if separate
    try {
      const backendFilePath = path.join(backendUploadsDir, file.filename);
      if (!fs.existsSync(backendFilePath)) {
        fs.copyFileSync(file.path, backendFilePath);
      }
    } catch (_) {}

    // 4. Invalidate survey cache
    try {
      const cacheService = require('../services/cacheService');
      await cacheService.invalidateSurveyCache(paper.project_id).catch(() => {});
    } catch (_) {}

    // 5. Update user storage stats
    if (req.user && req.user.id) {
      try {
        await recalculateUserStorage(req.user.id);
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      message: 'PDF manuscript attached to paper successfully',
      paper_id: paperId,
      pdf_url: dbPdfUrl,
      filename: file.filename,
      original_name: file.originalname,
      size: file.size
    });
  } catch (err) {
    console.error('handlePaperDirectPdfUpload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload PDF manuscript' });
  }
}

router.post('/upload', upload.any(), (req, res, next) => {
  if (req.body && (req.body.paper_id || req.body.id)) {
    return handlePaperDirectPdfUpload(req, res);
  }
  if (req.query.async === 'true' || req.body?.async === 'true') {
    return handleAsyncPdfUpload(req, res);
  }
  return handlePdfUpload(req, res);
});
router.post('/upload/async', upload.any(), handleAsyncPdfUpload);
router.post('/upload-async', upload.any(), handleAsyncPdfUpload);
router.post('/papers/bulk-upload', upload.any(), handlePdfUpload);
router.post('/papers/:id/pdf', upload.any(), handlePaperDirectPdfUpload);
router.post('/papers/:id/upload', upload.any(), handlePaperDirectPdfUpload);
router.post('/paper/:id/pdf', upload.any(), handlePaperDirectPdfUpload);
router.post('/paper/:id/upload', upload.any(), handlePaperDirectPdfUpload);
router.post('/papers/bulk-assign', (req, res) => {
  res.redirect(307, '/api/papers/bulk-reassign');
});

module.exports = router;
module.exports.upload = upload;
module.exports.handlePaperDirectPdfUpload = handlePaperDirectPdfUpload;
