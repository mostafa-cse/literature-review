/**
 * LITSPHERE SURVEY SETTINGS CONTROLLER
 * Manages Survey Configuration, Metadata Edits, Ownership Transfer,
 * JSON Backups, Project Duplication, Matrix Resets, and Cascading Deletion.
 */

window.currentSettingsTab = 'general';

window.openSurveySettingsModal = async function(initialTab = 'general') {
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  const role = (window.currentProjectRole || 'owner').toLowerCase();
  const isOwner = role === 'owner';
  const isEditor = role === 'editor';
  const canModify = isOwner || isEditor;

  // Load project details
  try {
    const res = await fetch(`/api/projects/${pid}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load survey settings');
    const project = await res.json();

    // Populate General Form
    const nameInput = document.getElementById('setting-survey-name');
    const descInput = document.getElementById('setting-survey-desc');
    const idBadge = document.getElementById('setting-survey-id-badge');
    const roleBadge = document.getElementById('setting-survey-role-badge');
    const createdBadge = document.getElementById('setting-survey-created-badge');

    if (nameInput) {
      nameInput.value = project.name || '';
      nameInput.disabled = !canModify;
    }
    if (descInput) {
      descInput.value = project.description || '';
      descInput.disabled = !canModify;
    }
    if (idBadge) idBadge.textContent = `ID #${project.id}`;
    if (roleBadge) {
      roleBadge.textContent = role.toUpperCase();
      roleBadge.className = `role-badge-pill role-${role}`;
    }
    if (createdBadge && project.created_at) {
      createdBadge.textContent = new Date(project.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Role-based UI visibility
    const saveGeneralBtn = document.getElementById('btn-save-survey-settings');
    if (saveGeneralBtn) saveGeneralBtn.style.display = canModify ? 'inline-flex' : 'none';

    // Transfer tab notice
    const transferNotice = document.getElementById('settings-transfer-role-notice');
    const transferForm = document.getElementById('settings-transfer-form');
    if (transferNotice && transferForm) {
      transferNotice.style.display = isOwner ? 'none' : 'block';
      transferForm.style.display = isOwner ? 'block' : 'none';
    }

    // Danger Zone notice
    const dangerOwnerNotice = document.getElementById('settings-danger-owner-notice');
    const dangerActions = document.getElementById('settings-danger-actions');
    if (dangerOwnerNotice && dangerActions) {
      dangerOwnerNotice.style.display = isOwner ? 'none' : 'block';
      dangerActions.style.display = isOwner ? 'block' : 'none';
    }

    // Update clone name placeholder
    const cloneNameInput = document.getElementById('setting-clone-name');
    if (cloneNameInput) {
      cloneNameInput.value = `${project.name} (Copy)`;
    }

    // Update delete confirm survey name match target
    const deleteMatchName = document.getElementById('setting-delete-target-name');
    if (deleteMatchName) deleteMatchName.textContent = project.name;

    switchSettingsTab(initialTab);
    openModal('settings-modal-overlay');
  } catch (err) {
    showToast(err.message || 'Failed to open settings', 'error');
  }
};

window.switchSettingsTab = function(tabName) {
  window.currentSettingsTab = tabName;

  // Toggle Tab Navigation Buttons
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle Tab Panes
  const panes = document.querySelectorAll('.settings-tab-pane');
  panes.forEach(pane => {
    if (pane.id === `settings-pane-${tabName}`) {
      pane.style.display = 'block';
    } else {
      pane.style.display = 'none';
    }
  });
};

window.saveGeneralSettings = async function(e) {
  if (e) e.preventDefault();
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  const nameInput = document.getElementById('setting-survey-name');
  const descInput = document.getElementById('setting-survey-desc');

  if (!nameInput || !nameInput.value.trim()) {
    showToast('Survey title cannot be empty.', 'warning');
    return;
  }

  const newName = nameInput.value.trim();
  const newDesc = descInput ? descInput.value.trim() : '';

  try {
    const res = await fetch(`/api/projects/${pid}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update survey details');
    }

    const updated = await res.json();

    // Update live workspace UI
    const surveyTitleEl = document.getElementById('project-title') || document.getElementById('hero-survey-title');
    const surveyDescEl = document.getElementById('project-description') || document.getElementById('hero-survey-desc');
    const activeSurveyPillName = document.getElementById('active-survey-pill-name');
    const activeSelect = document.getElementById('active-project-select');

    if (surveyTitleEl) {
      surveyTitleEl.innerHTML = `Literature Survey on <span style="color: var(--accent-gold);">${escapeHtml(updated.name)}</span>`;
    }
    if (surveyDescEl) {
      if (typeof window.renderSurveyDescription === 'function') {
        window.renderSurveyDescription(surveyDescEl, updated.description);
      } else {
        surveyDescEl.textContent = updated.description || 'Comprehensive systematic literature review, multi-level taxonomy benchmarking, and master matrix synthesis.';
      }
    }
    if (activeSurveyPillName) activeSurveyPillName.textContent = updated.name;
    if (activeSelect) {
      const curOpt = activeSelect.querySelector(`option[value="${pid}"]`);
      if (curOpt) curOpt.textContent = updated.name;
    }
    document.title = `Literature Survey on ${updated.name} | LitSphere`;

    // Update in-memory project list cache if available
    if (window.allProjects && Array.isArray(window.allProjects)) {
      const pIndex = window.allProjects.findIndex(p => String(p.id) === String(pid));
      if (pIndex !== -1) {
        window.allProjects[pIndex] = { ...window.allProjects[pIndex], ...updated };
      }
    }

    // Re-evaluate read more button for the updated description
    if (typeof window.initDescReadMore === 'function') {
      window.initDescReadMore();
    }

    showToast('Survey details saved successfully.', 'success');
    closeModal('settings-modal-overlay');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.transferSurveyOwnership = async function(e) {
  if (e) e.preventDefault();
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  const emailInput = document.getElementById('setting-transfer-email');
  const keepEditorCheckbox = document.getElementById('setting-transfer-keep-editor');

  if (!emailInput || !emailInput.value.trim()) {
    showToast('Please enter the recipient user email address.', 'warning');
    return;
  }

  const targetEmail = emailInput.value.trim().toLowerCase();
  const keepAsEditor = keepEditorCheckbox ? keepEditorCheckbox.checked : true;

  if (!confirm(`Are you sure you want to transfer ownership of this survey to "${targetEmail}"?\n\nYou will lose Owner privileges and become an ${keepAsEditor ? 'Editor' : 'unaffiliated user'}.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/projects/${pid}/transfer`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_email: targetEmail, keep_as_editor: keepAsEditor })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to transfer survey ownership');
    }

    const data = await res.json();
    showToast(data.message || 'Ownership transferred successfully.', 'success');

    // Update user's effective role
    window.currentProjectRole = data.your_new_role || 'editor';
    applyWorkspaceRolePermissions();
    closeModal('settings-modal-overlay');

    // Refresh team if open
    if (typeof loadTeamMembers === 'function') loadTeamMembers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.duplicateCurrentSurvey = async function() {
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  const cloneNameInput = document.getElementById('setting-clone-name');
  const includePapersCheckbox = document.getElementById('setting-clone-include-papers');

  const newName = cloneNameInput ? cloneNameInput.value.trim() : '';
  const includePapers = includePapersCheckbox ? includePapersCheckbox.checked : true;

  try {
    const res = await fetch(`/api/projects/${pid}/duplicate`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName, include_papers: includePapers })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to duplicate survey');
    }

    const cloned = await res.json();
    showToast(`Survey duplicated successfully as "${cloned.name}". Redirecting...`, 'success');
    setTimeout(() => {
      window.location.href = `/workspace?project=${cloned.id}`;
    }, 900);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.downloadCurrentSurveyBackup = function() {
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  
  // Download via authenticated fetch blob
  fetch(`/api/projects/${pid}/backup`, { headers: getAuthHeaders() })
    .then(res => {
      if (!res.ok) throw new Error('Failed to generate survey backup.');
      return res.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `survey-backup-${pid}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Survey backup downloaded successfully (.json).', 'success');
    })
    .catch(err => {
      showToast(err.message, 'error');
    });
};

window.resetCurrentSurveyMatrix = async function() {
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);

  if (!confirm('⚠️ WARNING: This will permanently wipe all extracted cell values and notes across all papers in this survey, and reset reading statuses to unread.\n\nPapers and taxonomy columns will NOT be deleted.\n\nDo you wish to proceed?')) {
    return;
  }

  try {
    const res = await fetch(`/api/projects/${pid}/reset-matrix`, {
      method: 'POST',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to reset master matrix data');
    }

    const data = await res.json();
    showToast(data.message || 'Matrix cells cleared successfully.', 'success');
    closeModal('settings-modal-overlay');

    // Reload workspace data & matrix
    await loadPapers();
    await loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteCurrentSurveyFromSettings = async function() {
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  const confirmInput = document.getElementById('setting-delete-confirm-input');
  const targetNameEl = document.getElementById('setting-delete-target-name');
  const requiredName = targetNameEl ? targetNameEl.textContent.trim() : '';

  if (!confirmInput || confirmInput.value.trim() !== requiredName) {
    showToast(`To confirm deletion, please type the exact survey title: "${requiredName}"`, 'warning');
    return;
  }

  if (!confirm(`Are you absolutely sure you want to permanently delete "${requiredName}"?\nThis cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/projects/${pid}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to delete survey');
    }

    showToast('Survey permanently deleted. Redirecting to Dashboard...', 'success');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 800);
  } catch (err) {
    showToast(err.message, 'error');
  }
};
