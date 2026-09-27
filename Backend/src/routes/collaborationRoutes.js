const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, getProjectRole, logAuditEvent, optionalAuth } = require('../utils/auth');

// GET /api/projects/:id/my-role - Get current user's effective role on project
router.get('/projects/:id/my-role', optionalAuth, (req, res) => {
  const projectId = req.params.id;

  if (!req.user) {
    return res.json({ role: 'viewer', is_authenticated: false, is_guest: true });
  }

  const role = getProjectRole(req.user.id, projectId);
  res.json({
    role,
    user_id: req.user.id,
    user_name: req.user.name,
    is_authenticated: true
  });
});

// GET /api/projects/:id/members - List all project members and owner
router.get('/projects/:id/members', (req, res) => {
  const projectId = req.params.id;
  const db = getDb();

  try {
    const project = db.prepare("SELECT id, name, owner_id FROM projects WHERE id = ?").get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const owner = db.prepare("SELECT id, name, email, role as global_role, institution FROM users WHERE id = ?").get(project.owner_id);

    const members = db.prepare(`
      SELECT pm.id as membership_id, 
             CASE WHEN pm.role = 'owner' AND pm.user_id != ? THEN 'editor' ELSE pm.role END as project_role,
             pm.created_at as joined_at,
             u.id as user_id, u.name, u.email, u.institution, u.role as global_role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.id ASC
    `).all(project.owner_id, projectId);

    res.json({
      project_id: Number(projectId),
      project_name: project.name,
      owner: owner || { id: project.owner_id, name: 'Project Owner', email: 'owner@litsphere.local' },
      members
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve project members: ' + err.message });
  }
});

// POST /api/projects/:id/members - Invite / Add collaborator (Owner or Admin)
router.post('/projects/:id/members', authenticateToken, (req, res) => {
  const projectId = Number(req.params.id);
  const currentUserId = Number(req.user.id);
  const { email, role = 'editor' } = req.body;
  const db = getDb();

  if (!email) return res.status(400).json({ error: 'Collaborator email address is required.' });

  const currentRole = getProjectRole(currentUserId, projectId);
  const isOwner = currentRole === 'owner';
  const isAdmin = req.user && req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Only the project Owner can add or invite team members.' });
  }

  const cleanIdentifier = email.trim().toLowerCase();
  const validRole = ['editor', 'reviewer', 'viewer'].includes(role) ? role : 'editor';

  try {
    const targetUser = db.prepare(`
      SELECT id, name, email FROM users 
      WHERE LOWER(email) = ? OR LOWER(COALESCE(username, '')) = ? OR LOWER(name) = ?
    `).get(cleanIdentifier, cleanIdentifier, cleanIdentifier);

    if (!targetUser) {
      return res.status(404).json({ error: `User "${cleanIdentifier}" does not exist on LitSphere. They must register first.` });
    }

    const project = db.prepare("SELECT owner_id, name FROM projects WHERE id = ?").get(projectId);
    if (project && Number(project.owner_id) === Number(targetUser.id)) {
      return res.status(400).json({ error: 'User is already the Project Owner.' });
    }

    db.prepare(`
      INSERT INTO project_members (project_id, user_id, role, invited_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role
    `).run(projectId, Number(targetUser.id), validRole, currentUserId);

    try {
      const cacheService = require('../services/cacheService');
      cacheService.invalidateSurveyCache(projectId);
    } catch (_) {}

    logAuditEvent(req, 'COLLABORATOR_ADD', `Added ${targetUser.email} as ${validRole} on project ${projectId}`, 'SUCCESS');

    res.status(201).json({
      message: `Added ${targetUser.name} (${targetUser.email}) as ${validRole} successfully.`,
      user_id: targetUser.id,
      role: validRole
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add collaborator: ' + err.message });
  }
});

// PUT /api/projects/:id/members/:userId - Update collaborator role (Owner or Admin)
router.put('/projects/:id/members/:userId', authenticateToken, (req, res) => {
  const projectId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const currentUserId = Number(req.user.id);
  const { role } = req.body;
  const db = getDb();

  const currentRole = getProjectRole(currentUserId, projectId);
  const isOwner = currentRole === 'owner';
  const isAdmin = req.user && req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Only the project Owner can update collaborator permissions.' });
  }

  const validRole = ['editor', 'reviewer', 'viewer'].includes(role) ? role : 'editor';

  try {
    const result = db.prepare("UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?")
      .run(validRole, projectId, targetUserId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Collaborator membership not found on this project.' });
    }

    try {
      const cacheService = require('../services/cacheService');
      cacheService.invalidateSurveyCache(projectId);
    } catch (_) {}

    logAuditEvent(req, 'COLLABORATOR_ROLE_UPDATE', `Updated user ID ${targetUserId} to ${validRole} on project ${projectId}`, 'SUCCESS');

    res.json({ message: 'Collaborator role updated successfully.', role: validRole });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update collaborator role: ' + err.message });
  }
});

// DELETE /api/projects/:id/members/:userId - Remove collaborator or self-leave
router.delete('/projects/:id/members/:userId', authenticateToken, (req, res) => {
  const projectId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const currentUserId = Number(req.user.id);
  const db = getDb();

  const currentRole = getProjectRole(currentUserId, projectId);
  const isOwner = currentRole === 'owner';
  const isAdmin = req.user && req.user.role === 'admin';
  const isSelf = currentUserId === targetUserId;

  if (!isOwner && !isAdmin && !isSelf) {
    return res.status(403).json({ error: 'Only the project Owner or administrator can remove collaborators.' });
  }

  try {
    db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, targetUserId);

    try {
      const cacheService = require('../services/cacheService');
      cacheService.invalidateSurveyCache(projectId);
      cacheService.invalidateTag('stats');
    } catch (_) {}

    logAuditEvent(req, 'COLLABORATOR_REMOVE', `Removed user ID ${targetUserId} from project ${projectId}`, 'SUCCESS');

    res.json({
      success: true,
      message: isSelf ? 'You have successfully left this project.' : 'Collaborator removed from project successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove collaborator: ' + err.message });
  }
});

module.exports = router;
