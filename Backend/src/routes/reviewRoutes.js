const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, getProjectRole, logAuditEvent } = require('../utils/auth');

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
    const decisions = db.prepare(`
      SELECT id, paper_id, user_id, user_name, decision, exclusion_reason, notes, updated_at
      FROM paper_screening
      WHERE paper_id = ?
      ORDER BY updated_at DESC
    `).all(paperId);

    res.json({ decisions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve screening data: ' + err.message });
  }
});

// POST /api/papers/:id/screening - Submit blind screening decision (Owner, Editor, Reviewer)
router.post('/papers/:id/screening', authenticateToken, (req, res) => {
  const paperId = req.params.id;
  const { decision, vote, exclusion_reason, reason, notes } = req.body;
  const db = getDb();

  const finalDecision = decision || vote;
  const finalReason = exclusion_reason || reason || '';

  if (!['included', 'excluded', 'uncertain'].includes(finalDecision)) {
    return res.status(400).json({ error: "Invalid screening decision. Must be 'included', 'excluded', or 'uncertain'." });
  }

  try {
    const paper = db.prepare("SELECT id, project_id, title FROM papers WHERE id = ?").get(paperId);
    if (!paper) return res.status(404).json({ error: 'Paper not found.' });

    const role = getProjectRole(req.user.id, paper.project_id);
    if (role === 'viewer') {
      return res.status(403).json({ error: 'Viewers have read-only access and cannot submit screening votes.' });
    }

    db.prepare(`
      INSERT INTO paper_screening (paper_id, user_id, user_name, decision, exclusion_reason, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(paper_id, user_id) DO UPDATE SET 
        decision = excluded.decision,
        exclusion_reason = excluded.exclusion_reason,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `).run(paperId, req.user.id, req.user.name, finalDecision, finalReason, notes || '');

    logAuditEvent(req, 'SCREENING_DECISION', `Screened paper ${paperId} as ${finalDecision.toUpperCase()}`, 'SUCCESS');

    res.json({
      message: `Screening decision recorded: ${finalDecision.toUpperCase()}`,
      paper_id: Number(paperId),
      decision: finalDecision,
      reason: finalReason
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record screening decision: ' + err.message });
  }
});

module.exports = router;
