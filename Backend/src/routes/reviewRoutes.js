const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, getProjectRole, logAuditEvent, verifyToken } = require('../utils/auth');

// ==========================================
// 1. PAPER COMMENTS & SOURCE-QUOTE ANNOTATIONS
// ==========================================

// GET /api/papers/:id/comments - Retrieve all comments & source quotes
router.get('/papers/:id/comments', (req, res) => {
  const paperId = req.params.id;
  const db = getDb();

  try {
    const comments = db.prepare(`
      SELECT id, paper_id, user_id, user_name, user_role, comment_text, quote_text, page_number, created_at
      FROM paper_comments
      WHERE paper_id = ?
      ORDER BY id ASC
    `).all(paperId);

    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve comments: ' + err.message });
  }
});

// POST /api/papers/:id/comments - Add comment / annotation (Owner, Editor, Reviewer)
router.post('/papers/:id/comments', authenticateToken, (req, res) => {
  const paperId = req.params.id;
  const { comment_text, quote_text, page_number } = req.body;
  const db = getDb();

  if (!comment_text || !comment_text.trim()) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  try {
    const paper = db.prepare("SELECT id, project_id, title FROM papers WHERE id = ?").get(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });

    const role = getProjectRole(req.user.id, paper.project_id);
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers have read-only access and cannot post annotations.' });
    }

    const result = db.prepare(`
      INSERT INTO paper_comments (paper_id, user_id, user_name, user_role, comment_text, quote_text, page_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(paperId, req.user.id, req.user.name, role, comment_text.trim(), quote_text ? quote_text.trim() : null, page_number || null);

    const newComment = db.prepare("SELECT * FROM paper_comments WHERE id = ?").get(result.lastInsertRowid);

    logAuditEvent(req, 'PAPER_COMMENT_ADD', `Added comment on paper ${paperId} (Role: ${role})`, 'SUCCESS');

    res.status(201).json({
      message: 'Comment added successfully.',
      comment: newComment
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save comment: ' + err.message });
  }
});

// DELETE /api/papers/comments/:commentId and /api/comments/:commentId - Delete comment
const handleDeleteComment = (req, res) => {
  const commentId = req.params.commentId;
  const db = getDb();

  try {
    const comment = db.prepare("SELECT * FROM paper_comments WHERE id = ?").get(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    const paper = db.prepare("SELECT project_id FROM papers WHERE id = ?").get(comment.paper_id);
    const role = getProjectRole(req.user.id, paper ? paper.project_id : null);

    if (comment.user_id !== req.user.id && role !== 'owner') {
      return res.status(403).json({ error: 'You can only delete your own comments.' });
    }

    db.prepare("DELETE FROM paper_comments WHERE id = ?").run(commentId);
    res.json({ message: 'Comment deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment: ' + err.message });
  }
};

router.delete('/papers/comments/:commentId', authenticateToken, handleDeleteComment);
router.delete('/comments/:commentId', authenticateToken, handleDeleteComment);

// ==========================================
// 2. BLIND PRISMA SCREENING DECISIONS
// ==========================================

// GET /api/papers/:id/screening - Get all screening votes for paper
router.get('/papers/:id/screening', (req, res) => {
  const paperId = req.params.id;
  const db = getDb();

  try {
    const screenings = db.prepare(`
      SELECT id, paper_id, user_id, user_name, decision, exclusion_reason, notes, updated_at
      FROM paper_screening
      WHERE paper_id = ?
      ORDER BY id ASC
    `).all(paperId);

    res.json({ screenings, decisions: screenings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve screening decisions: ' + err.message });
  }
});

// POST /api/papers/:id/screening - Submit blind PRISMA screening vote (Owner, Editor, Reviewer)
router.post('/papers/:id/screening', authenticateToken, (req, res) => {
  const paperId = req.params.id;
  const { decision, vote, exclusion_reason, reason, notes } = req.body;
  const db = getDb();

  const finalDecision = (decision || vote || '').toLowerCase();
  if (!['included', 'excluded', 'uncertain'].includes(finalDecision)) {
    return res.status(400).json({ error: 'Valid decision (included, excluded, uncertain) is required.' });
  }

  try {
    const paper = db.prepare("SELECT id, project_id, title FROM papers WHERE id = ?").get(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });

    const role = getProjectRole(req.user.id, paper.project_id);
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers have read-only access and cannot vote on PRISMA decisions.' });
    }

    const cleanReason = (exclusion_reason !== undefined ? exclusion_reason : reason) ? String(exclusion_reason || reason).trim() : null;
    const cleanNotes = notes ? String(notes).trim() : null;

    db.prepare(`
      INSERT INTO paper_screening (paper_id, user_id, user_name, decision, exclusion_reason, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(paper_id, user_id) DO UPDATE SET
        decision = excluded.decision,
        exclusion_reason = excluded.exclusion_reason,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).run(paperId, req.user.id, req.user.name, finalDecision, cleanReason, cleanNotes);

    // Sync primary paper table screening state (if columns present)
    try {
      db.prepare(`
        UPDATE papers
        SET screening_decision = ?, screening_reason = ?
        WHERE id = ?
      `).run(finalDecision, cleanReason, paperId);
    } catch (colErr) {
      // Gracefully handle if columns are pending migration
    }

    logAuditEvent(req, 'PRISMA_SCREENING_VOTE', `Voted ${finalDecision.toUpperCase()} on paper ${paperId} (Role: ${role})`, 'SUCCESS');

    res.json({
      message: 'Screening decision recorded successfully.',
      decision: finalDecision,
      exclusion_reason: cleanReason,
      reason: cleanReason,
      notes: cleanNotes
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record screening decision: ' + err.message });
  }
});

// ==========================================
// 3. TEXT HIGHLIGHTS & VISUAL RECTANGLES
// ==========================================

// GET /api/papers/:id/highlights - Get all text highlights for paper
router.get('/papers/:id/highlights', (req, res) => {
  const paperId = req.params.id;
  const db = getDb();

  try {
    const rows = db.prepare(`
      SELECT id, paper_id, user_id, page_number, text, quads_json, color, color_label, note, created_at
      FROM paper_highlights
      WHERE paper_id = ?
      ORDER BY id ASC
    `).all(paperId);

    const highlights = rows.map(r => {
      let parsedRects = [];
      try { parsedRects = JSON.parse(r.quads_json || '[]'); } catch (e) {}
      return {
        ...r,
        rects: parsedRects
      };
    });

    res.json({ highlights });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve highlights: ' + err.message });
  }
});

// POST /api/papers/:id/highlights - Create highlight
router.post('/papers/:id/highlights', (req, res) => {
  const paperId = req.params.id;
  const { page_number, text, rects, quads_json, color, color_label, note } = req.body;
  const db = getDb();

  if (!page_number || !text) {
    return res.status(400).json({ error: 'page_number and text are required.' });
  }

  try {
    const paper = db.prepare("SELECT id, project_id FROM papers WHERE id = ?").get(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });

    // Check optional token header if present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (decoded && decoded.id) {
          const userRole = getProjectRole(decoded.id, paper.project_id) || 'reviewer';
          if (userRole === 'viewer') {
            return res.status(403).json({ error: 'Viewers have read-only access and cannot create highlights.' });
          }
        }
      } catch (_) {}
    }

    const quadsString = quads_json || (rects ? JSON.stringify(rects) : '[]');
    const finalColor = color || 'rgba(56, 189, 248, 0.35)';
    const finalLabel = color_label || 'Default';
    const userId = req.user ? req.user.id : 1;

    const result = db.prepare(`
      INSERT INTO paper_highlights (paper_id, user_id, page_number, text, quads_json, color, color_label, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paperId, userId, page_number, text.trim(), quadsString, finalColor, finalLabel, note ? note.trim() : null);

    const newHighlight = db.prepare("SELECT * FROM paper_highlights WHERE id = ?").get(result.lastInsertRowid);
    let parsedRects = [];
    try { parsedRects = JSON.parse(newHighlight.quads_json || '[]'); } catch (e) {}

    res.status(201).json({
      message: 'Highlight created successfully.',
      highlight: {
        ...newHighlight,
        rects: parsedRects
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save highlight: ' + err.message });
  }
});

// PUT /api/papers/highlights/:highlightId - Update color or note of highlight
const handleUpdateHighlight = (req, res) => {
  const highlightId = req.params.highlightId;
  const { color, color_label, note } = req.body;
  const db = getDb();

  try {
    const existing = db.prepare("SELECT * FROM paper_highlights WHERE id = ?").get(highlightId);
    if (!existing) return res.status(404).json({ error: 'Highlight not found.' });

    // Check optional token header if present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (decoded && decoded.id) {
          const paper = db.prepare("SELECT project_id FROM papers WHERE id = ?").get(existing.paper_id);
          if (paper) {
            const userRole = getProjectRole(decoded.id, paper.project_id) || 'reviewer';
            if (userRole === 'viewer') {
              return res.status(403).json({ error: 'Viewers have read-only access.' });
            }
          }
        }
      } catch (_) {}
    }

    const newColor = color !== undefined ? color : existing.color;
    const newLabel = color_label !== undefined ? color_label : existing.color_label;
    const newNote = note !== undefined ? note : existing.note;

    db.prepare(`
      UPDATE paper_highlights
      SET color = ?, color_label = ?, note = ?
      WHERE id = ?
    `).run(newColor, newLabel, newNote, highlightId);

    const updated = db.prepare("SELECT * FROM paper_highlights WHERE id = ?").get(highlightId);
    let parsedRects = [];
    try { parsedRects = JSON.parse(updated.quads_json || '[]'); } catch (e) {}

    res.json({
      message: 'Highlight updated successfully.',
      highlight: {
        ...updated,
        rects: parsedRects
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update highlight: ' + err.message });
  }
};

router.put('/papers/highlights/:highlightId', handleUpdateHighlight);
router.put('/highlights/:highlightId', handleUpdateHighlight);

// DELETE /api/papers/highlights/:highlightId - Delete highlight
const handleDeleteHighlight = (req, res) => {
  const highlightId = req.params.highlightId;
  const db = getDb();

  try {
    const existing = db.prepare("SELECT * FROM paper_highlights WHERE id = ?").get(highlightId);
    if (!existing) return res.status(404).json({ error: 'Highlight not found.' });

    // Check optional token header if present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        if (decoded && decoded.id) {
          const paper = db.prepare("SELECT project_id FROM papers WHERE id = ?").get(existing.paper_id);
          if (paper) {
            const userRole = getProjectRole(decoded.id, paper.project_id) || 'reviewer';
            if (userRole === 'viewer') {
              return res.status(403).json({ error: 'Viewers have read-only access.' });
            }
          }
        }
      } catch (_) {}
    }

    db.prepare("DELETE FROM paper_highlights WHERE id = ?").run(highlightId);
    res.json({ message: 'Highlight deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete highlight: ' + err.message });
  }
};

router.delete('/papers/highlights/:highlightId', handleDeleteHighlight);
router.delete('/highlights/:highlightId', handleDeleteHighlight);

module.exports = router;
