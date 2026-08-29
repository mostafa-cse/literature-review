/**
 * LITNEXIS COLLABORATION & SUPERVISOR SHARING ENGINE
 * RBAC Team management, role invitations, role modifications, and read-only supervisor share tokens.
 */

window.openTeamModal = function() {
  loadTeamMembers();
  openModal('team-modal-overlay');
};

window.loadTeamMembers = async function() {
  const container = document.getElementById('team-members-list');
  const addMemberBar = document.getElementById('team-add-member-bar');
  const readOnlyNotice = document.getElementById('team-readonly-notice');
  const currentRoleLabel = document.getElementById('team-current-role-label');
  const rosterCount = document.getElementById('team-roster-count');

  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-tertiary); font-size:0.84rem; padding: 1rem; text-align: center;">Loading project team...</span>';

  // Get cached user info
  let currentUserId = null;
  const cachedUserStr = localStorage.getItem('litnexis_user');
  if (cachedUserStr) {
    try { currentUserId = JSON.parse(cachedUserStr).id; } catch(e) {}
  }

  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);

  try {
    const res = await fetch(`/api/projects/${pid}/members`, { headers: getAuthHeaders() });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to load project members');
    }
    const data = await res.json();
    const owner = data.owner || null;
    const members = Array.isArray(data.members) ? data.members : [];

    // Filter out owner from members if already listed to avoid duplicates
    const collaborators = members.filter(m => !owner || (m.user_id !== owner.id && m.id !== owner.id));
    const totalCount = (owner ? 1 : 0) + collaborators.length;

    if (rosterCount) {
      rosterCount.textContent = `${totalCount} Member${totalCount !== 1 ? 's' : ''}`;
    }

    // Determine current user's effective role
    const isOwner = (owner && currentUserId === owner.id) || currentProjectRole === 'owner';

    if (addMemberBar) {
      addMemberBar.style.display = isOwner ? 'block' : 'none';
    }
    if (readOnlyNotice) {
      readOnlyNotice.style.display = isOwner ? 'none' : 'block';
      if (currentRoleLabel) {
        currentRoleLabel.textContent = (currentProjectRole || 'VIEWER').toUpperCase();
      }
    }

    let html = '';

    // 1. Render Project Owner Card
    if (owner) {
      const ownerInitials = (owner.name || 'Owner').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      const isYou = currentUserId === owner.id;
      html += `
        <div class="team-member-card owner-card">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="team-avatar-circle owner-avatar">${ownerInitials}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.45rem;">
                <span style="font-weight: 700; font-size: 0.94rem; color: var(--text-primary);">${escapeHtml(owner.name || 'Project Owner')}</span>
                ${isYou ? '<span style="font-size: 0.72rem; color: var(--accent-gold); font-weight: 700; font-family: var(--font-mono);">(You)</span>' : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-tertiary); font-family: var(--font-mono); margin-top: 0.1rem;">
                ${escapeHtml(owner.email || '')} ${owner.institution ? `• <span style="color:var(--text-secondary);">${escapeHtml(owner.institution)}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="role-badge-pill role-owner">OWNER</span>
          </div>
        </div>
      `;
    }

    // 2. Render Collaborators List
    if (collaborators.length === 0) {
      html += `
        <div style="padding: 1.5rem 1rem; text-align: center; background: var(--bg-surface); border: 1px dashed var(--border-base); border-radius: 8px; color: var(--text-tertiary); font-size: 0.85rem;">
          <div style="margin-bottom: 0.5rem; color: var(--accent-primary); display: flex; justify-content: center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <span>No additional collaborators added yet.</span><br>
          ${isOwner ? '<span style="font-size: 0.78rem; color: var(--text-secondary);">Use the invite bar above to add co-authors, advisors, or reviewers.</span>' : ''}
        </div>
      `;
    } else {
      collaborators.forEach(m => {
        const role = (m.project_role || m.role || 'editor').toLowerCase();
        const initials = (m.name || 'User').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const isYou = currentUserId === m.user_id;

        html += `
          <div class="team-member-card">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="team-avatar-circle">${initials}</div>
              <div>
                <div style="display: flex; align-items: center; gap: 0.45rem;">
                  <span style="font-weight: 600; font-size: 0.92rem; color: var(--text-primary);">${escapeHtml(m.name || 'Researcher')}</span>
                  ${isYou ? '<span style="font-size: 0.72rem; color: var(--accent-primary); font-weight: 700; font-family: var(--font-mono);">(You)</span>' : ''}
                </div>
                <div style="font-size: 0.78rem; color: var(--text-tertiary); font-family: var(--font-mono); margin-top: 0.1rem;">
                  ${escapeHtml(m.email || '')} ${m.institution ? `• <span style="color:var(--text-secondary);">${escapeHtml(m.institution)}</span>` : ''}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              ${isOwner ? `
                <select class="team-member-select-role" onchange="updateCollaboratorRole(${m.user_id}, this.value)">
                  <option value="editor" ${role === 'editor' ? 'selected' : ''}>Editor</option>
                  <option value="reviewer" ${role === 'reviewer' ? 'selected' : ''}>Reviewer</option>
                  <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
                <button class="mini-btn danger" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;" onclick="removeCollaborator(${m.user_id}, '${escapeHtml(m.name || m.email)}')" title="Remove Collaborator">
                  Remove
                </button>
              ` : `
                <span class="role-badge-pill role-${role}">${role.toUpperCase()}</span>
                ${isYou ? `<button class="mini-btn danger" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="removeCollaborator(${m.user_id}, 'yourself')">Leave</button>` : ''}
              `}
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--accent-rose); font-size:0.84rem; padding:1rem; text-align:center;">${escapeHtml(err.message)}</div>`;
  }
};

window.submitInviteCollaborator = async function(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('team-invite-email');
  const roleSelect = document.getElementById('team-invite-role');

  const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
  const role = roleSelect ? roleSelect.value : 'editor';

  if (!email) {
    showToast('Please enter a collaborator email address', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }

  // Basic email pattern check
  if (!email.includes('@') || !email.includes('.')) {
    showToast('Please enter a valid email address (e.g. colleague@university.ac)', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }

  try {
    const res = await fetch(`/api/projects/${activeProjectId}/members`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, role })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (emailInput) emailInput.value = '';
      showToast(data.message || `Invited ${email} as ${role.toUpperCase()}!`, 'success');
      loadTeamMembers();
    } else {
      throw new Error(data.error || 'Failed to add collaborator');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.updateCollaboratorRole = async function(userId, newRole) {
  try {
    const res = await fetch(`/api/projects/${activeProjectId}/members/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role: newRole })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update collaborator role');

    showToast(data.message || `Role updated to ${newRole.toUpperCase()} successfully`, 'success');
    loadTeamMembers();
  } catch (err) {
    showToast(err.message, 'error');
    loadTeamMembers();
  }
};

window.removeCollaborator = async function(userId, memberName = 'this collaborator') {
  if (!confirm(`Are you sure you want to remove ${memberName} from this project?`)) return;
  try {
    const res = await fetch(`/api/projects/${activeProjectId}/members/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast(data.message || 'Collaborator removed successfully', 'success');
      loadTeamMembers();
    } else {
      throw new Error(data.error || 'Failed to remove collaborator');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

/* =========================================================
   SUPERVISOR / PUBLIC READ-ONLY SHARE LINK ENGINE
   ========================================================= */

window.openShareModal = async function() {
  const shareInput = document.getElementById('share-url-input');
  const previewLink = document.getElementById('btn-open-share-link');
  const statusBadge = document.getElementById('share-link-status-badge');
  const revokeBtn = document.getElementById('btn-revoke-share-link');
  const enableBtn = document.getElementById('btn-enable-share-link');

  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;

  if (shareInput) shareInput.value = 'Checking share status...';
  if (statusBadge) {
    statusBadge.className = 'role-badge-pill role-editor';
    statusBadge.textContent = 'CHECKING...';
  }
  if (previewLink) previewLink.style.display = 'none';
  if (revokeBtn) revokeBtn.style.display = 'none';
  if (enableBtn) enableBtn.style.display = 'none';

  openModal('share-modal-overlay');

  try {
    const res = await fetch(`/api/projects/${pid}/share`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.is_public && data.share_token) {
        const fullUrl = `${window.location.origin}/shared/${data.share_token}`;
        if (shareInput) shareInput.value = fullUrl;
        if (previewLink) {
          previewLink.href = fullUrl;
          previewLink.style.display = 'inline-flex';
        }
        if (statusBadge) {
          statusBadge.className = 'role-badge-pill role-reviewer';
          statusBadge.textContent = 'ACTIVE';
        }
        if (revokeBtn) {
          revokeBtn.style.display = (currentProjectRole === 'owner' || currentProjectRole === 'admin') ? 'inline-flex' : 'none';
        }
        if (enableBtn) enableBtn.style.display = 'none';
      } else {
        // Disabled state
        if (shareInput) shareInput.value = 'Public link is currently disabled.';
        if (previewLink) previewLink.style.display = 'none';
        if (statusBadge) {
          statusBadge.className = 'role-badge-pill role-viewer';
          statusBadge.textContent = 'DISABLED';
        }
        if (revokeBtn) revokeBtn.style.display = 'none';
        if (enableBtn) {
          enableBtn.style.display = ['owner', 'editor', 'admin'].includes(currentProjectRole) ? 'inline-flex' : 'none';
        }
      }
    } else {
      // If GET endpoint returns 404 or requires generation, attempt initial creation
      await window.enableShareLink(false);
    }
  } catch (err) {
    if (shareInput) shareInput.value = 'Failed to inspect share link.';
    if (statusBadge) {
      statusBadge.className = 'role-badge-pill role-viewer';
      statusBadge.textContent = 'ERROR';
    }
    showToast(err.message, 'error');
  }
};

window.enableShareLink = async function(showFeedback = true) {
  const shareInput = document.getElementById('share-url-input');
  const previewLink = document.getElementById('btn-open-share-link');
  const statusBadge = document.getElementById('share-link-status-badge');
  const revokeBtn = document.getElementById('btn-revoke-share-link');
  const enableBtn = document.getElementById('btn-enable-share-link');

  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;

  if (shareInput) shareInput.value = 'Generating secure public share link...';
  if (statusBadge) {
    statusBadge.className = 'role-badge-pill role-editor';
    statusBadge.textContent = 'CONNECTING...';
  }

  try {
    const res = await fetch(`/api/projects/${pid}/share`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      const token = data.share_token;
      const fullUrl = `${window.location.origin}/shared/${token}`;
      
      if (shareInput) shareInput.value = fullUrl;
      if (previewLink) {
        previewLink.href = fullUrl;
        previewLink.style.display = 'inline-flex';
      }
      if (statusBadge) {
        statusBadge.className = 'role-badge-pill role-reviewer';
        statusBadge.textContent = 'ACTIVE';
      }
      if (revokeBtn) {
        revokeBtn.style.display = (currentProjectRole === 'owner' || currentProjectRole === 'admin') ? 'inline-flex' : 'none';
      }
      if (enableBtn) enableBtn.style.display = 'none';

      if (showFeedback) {
        showToast('Public supervisor share link activated!', 'success');
      }
    } else {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to generate share link');
    }
  } catch (err) {
    if (shareInput) shareInput.value = 'Failed to generate share link.';
    if (statusBadge) {
      statusBadge.className = 'role-badge-pill role-viewer';
      statusBadge.textContent = 'ERROR';
    }
    showToast(err.message, 'error');
  }
};

window.copyShareUrl = function() {
  const shareInput = document.getElementById('share-url-input');
  if (!shareInput || !shareInput.value || !shareInput.value.includes('/shared/')) {
    showToast('Share link is disabled. Click "Enable Link" to generate one.', 'warning');
    return;
  }
  
  const textToCopy = shareInput.value.trim();
  
  // Try navigator.clipboard first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Share link copied to clipboard!', 'success');
    }).catch(() => {
      fallbackCopy(shareInput);
    });
  } else {
    fallbackCopy(shareInput);
  }
};

function fallbackCopy(inputElement) {
  try {
    inputElement.select();
    inputElement.setSelectionRange(0, 99999);
    const successful = document.execCommand('copy');
    if (successful) {
      showToast('Share link copied to clipboard!', 'success');
    } else {
      showToast('Link selected. Press Ctrl+C to copy.', 'info');
    }
  } catch (e) {
    showToast('Link selected. Press Ctrl+C to copy.', 'info');
  }
}

window.revokeShareLink = async function() {
  if (!confirm('Are you sure you want to disable this public share link? External visitors will immediately lose access.')) return;

  const shareInput = document.getElementById('share-url-input');
  const previewLink = document.getElementById('btn-open-share-link');
  const statusBadge = document.getElementById('share-link-status-badge');
  const revokeBtn = document.getElementById('btn-revoke-share-link');
  const enableBtn = document.getElementById('btn-enable-share-link');

  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;

  try {
    const res = await fetch(`/api/projects/${pid}/share`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (shareInput) shareInput.value = 'Public link is currently disabled.';
      if (previewLink) previewLink.style.display = 'none';
      if (statusBadge) {
        statusBadge.className = 'role-badge-pill role-viewer';
        statusBadge.textContent = 'DISABLED';
      }
      if (revokeBtn) revokeBtn.style.display = 'none';
      if (enableBtn) {
        enableBtn.style.display = ['owner', 'editor', 'admin'].includes(currentProjectRole) ? 'inline-flex' : 'none';
      }
      showToast(data.message || 'Share link disabled successfully', 'success');
    } else {
      throw new Error(data.error || 'Failed to disable share link');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
