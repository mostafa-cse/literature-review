/**
 * LITNEXIS TAXONOMY CLUSTERS ENGINE
 * Manages taxonomy clusters, color tagging, cluster cards, and focused cluster filtering.
 */

window.loadClusters = async function() {
  try {
    const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
    const res = await fetch(`/api/clusters?project_id=${pid}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load taxonomy clusters');
    allClusters = await res.json();
    renderClusters();
    populateClusterDropdowns();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.renderClusters = function() {
  const container = document.getElementById('clusters-grid') || document.getElementById('clusters-container');
  if (!container) return;
  container.innerHTML = '';

  if (allClusters.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem; background: var(--bg-surface); border: 1.5px dashed var(--border-base); border-radius: 10px;">
        <div style="margin-bottom: 0.5rem; color: var(--accent-primary);"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">No Clusters Created Yet</div>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1rem;">Categorize your research papers into structured sub-domain taxonomy clusters.</p>
        <button class="action-btn" onclick="openCreateClusterModal()">+ Create First Cluster</button>
      </div>
    `;
    return;
  }

  const role = (window.currentProjectRole || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isEditor = role === 'editor';
  const canEdit = isOwner || isEditor;
  const canDelete = isOwner;

  allClusters.forEach(c => {
    const card = document.createElement('div');
    card.className = `cluster-card ${String(c.id) === String(currentClusterId) ? 'active-focus' : ''}`;
    card.setAttribute('data-cluster-id', c.id);
    card.onclick = () => exploreCluster(c.id);

    const clusterColor = c.color || 'var(--accent-primary)';
    const totalPapers = c.paper_count || 0;
    const readPapers = c.read_count || 0;
    const unreadPapers = c.unread_count !== undefined ? c.unread_count : (totalPapers - readPapers > 0 ? totalPapers - readPapers : 0);
    const columnsCount = c.column_count || 0;
    const keywordsCount = c.keyword_count || 0;
    const readPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

    card.innerHTML = `
      <div>
        <div class="cluster-header">
          <div class="cluster-header-left">
            <span class="cluster-color-dot" style="background:${clusterColor}; box-shadow: 0 0 10px ${clusterColor}88;"></span>
            <span class="cluster-tag-label" style="color: var(--text-tertiary);">TAXONOMY CLUSTER</span>
          </div>
          ${canEdit ? `
            <div class="cluster-actions" onclick="event.stopPropagation()">
              <button class="mini-btn" onclick="editCluster(${c.id})" title="Edit Cluster">Edit</button>
              ${canDelete ? `
                <button class="mini-btn danger" onclick="deleteCluster(${c.id})" title="Delete Cluster" style="display:inline-flex; align-items:center; justify-content:center; padding: 2px 6px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <h4 class="cluster-name" style="color: ${clusterColor};">${escapeHtml(c.name)}</h4>
        <p class="cluster-desc">${escapeHtml(c.description || 'Systematic sub-domain taxonomy group for methodology benchmarking.')}</p>

        <!-- 3 Metric Chips: Total Papers, Matrix Columns, Keywords -->
        <div class="cluster-metrics-grid">
          <div class="cluster-stat-chip">
            <span class="chip-num">${totalPapers}</span>
            <span class="chip-label">TOTAL PAPERS</span>
          </div>
          <div class="cluster-stat-chip">
            <span class="chip-num">${columnsCount}</span>
            <span class="chip-label">MATRIX COLUMNS</span>
          </div>
          <div class="cluster-stat-chip">
            <span class="chip-num">${keywordsCount}</span>
            <span class="chip-label">KEYWORDS</span>
          </div>
        </div>

        <!-- Read-Unread Percentages Progress Bar -->
        <div class="cluster-progress-wrap">
          <div class="cluster-progress-label-row">
            <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary);">Reading Progress</span>
            <span class="cluster-progress-stats" style="font-size: 0.78rem; font-family: 'JetBrains Mono', monospace; color: var(--text-tertiary);">
              <strong style="color: var(--accent-gold);">${readPct}%</strong> (${readPapers} read • ${unreadPapers} unread)
            </span>
          </div>
          <div class="cluster-progress-track">
            <div class="cluster-progress-fill" style="width: ${readPct}%; background: linear-gradient(90deg, ${clusterColor} 0%, var(--accent-gold) 100%);"></div>
          </div>
        </div>
      </div>

      <div class="cluster-card-footer">
        <span style="font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; color: var(--text-tertiary);">ID #${c.id}</span>
        <button class="mini-btn gold" onclick="event.stopPropagation(); exploreCluster(${c.id})">Explore Cluster →</button>
      </div>
    `;

    container.appendChild(card);
  });
};

window.highlightClusterCard = function(clusterId) {
  const card = document.querySelector(`.cluster-card[data-cluster-id="${clusterId}"]`) || document.getElementById(`cluster-card-${clusterId}`);
  if (card) {
    card.classList.remove('cluster-card-pulse-assigned');
    void card.offsetWidth;
    card.classList.add('cluster-card-pulse-assigned');
    setTimeout(() => {
      card.classList.remove('cluster-card-pulse-assigned');
    }, 2000);
  }
};

window.populateClusterDropdowns = function() {
  const selects = [
    document.getElementById('add-paper-cluster'),
    document.getElementById('paper-cluster-select'),
    document.getElementById('filter-cluster'),
    document.getElementById('filter-cluster-select'),
    document.getElementById('upload-target-cluster'),
    document.getElementById('unassigned-bulk-cluster-select'),
    document.getElementById('entry-cluster'),
    document.getElementById('export-cluster-select')
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const isFilterOrExport = sel.id === 'filter-cluster' || sel.id === 'filter-cluster-select' || sel.id === 'export-cluster-select';
    const isUpload = sel.id === 'add-paper-cluster' || sel.id === 'paper-cluster-select' || sel.id === 'upload-target-cluster';
    const curVal = sel.value;
    
    let defaultHtml = '<option value="">-- Select Cluster --</option>';
    if (isFilterOrExport) defaultHtml = '<option value="all">All Clusters (Entire Workspace)</option>';
    if (isUpload) defaultHtml = '<option value="unassigned">Unassigned (Organize Later)</option>';

    sel.innerHTML = defaultHtml;

    if (isFilterOrExport) {
      const hasUnassigned = (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) && allPapers.some(p => !p.cluster_id);
      if (hasUnassigned) {
        const optUnassigned = document.createElement('option');
        optUnassigned.value = 'unassigned';
        optUnassigned.textContent = 'Unassigned Papers';
        sel.appendChild(optUnassigned);
      }
    }

    allClusters.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });

    if (isUpload) {
      const optNew = document.createElement('option');
      optNew.value = '__new__';
      optNew.textContent = '+ Create & Assign to New Cluster...';
      sel.appendChild(optNew);
    }

    if (isFilterOrExport && typeof currentClusterId !== 'undefined' && currentClusterId) {
      sel.value = currentClusterId;
    } else if (curVal) {
      sel.value = curVal;
    }
  });
};

window.openCreateClusterModal = function() {
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot create clusters.`, 'info');
    return;
  }
  const titleEl = document.getElementById('cluster-modal-title');
  if (titleEl) titleEl.textContent = 'Create Taxonomy Cluster';

  const idInput = document.getElementById('modal-cluster-id') || document.getElementById('cluster-id-input');
  const nameInput = document.getElementById('modal-cluster-name') || document.getElementById('cluster-name-input');
  const descInput = document.getElementById('modal-cluster-desc') || document.getElementById('cluster-desc-input');
  const colorInput = document.getElementById('modal-cluster-color') || document.getElementById('cluster-color-input');
  const hexInput = document.getElementById('modal-cluster-color-hex');

  if (idInput) idInput.value = '';
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (colorInput) colorInput.value = '#38bdf8';
  if (hexInput) hexInput.value = '#38bdf8';

  openModal('cluster-modal-overlay');
};

window.editCluster = function(id) {
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot edit clusters.`, 'info');
    return;
  }
  const c = allClusters.find(item => item.id === id);
  if (!c) return;

  const titleEl = document.getElementById('cluster-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Taxonomy Cluster';

  const idInput = document.getElementById('modal-cluster-id') || document.getElementById('cluster-id-input');
  const nameInput = document.getElementById('modal-cluster-name') || document.getElementById('cluster-name-input');
  const descInput = document.getElementById('modal-cluster-desc') || document.getElementById('cluster-desc-input');
  const colorInput = document.getElementById('modal-cluster-color') || document.getElementById('cluster-color-input');
  const hexInput = document.getElementById('modal-cluster-color-hex');

  if (idInput) idInput.value = c.id;
  if (nameInput) nameInput.value = c.name;
  if (descInput) descInput.value = c.description || '';
  if (colorInput) colorInput.value = c.color || '#38bdf8';
  if (hexInput) hexInput.value = c.color || '#38bdf8';

  openModal('cluster-modal-overlay');
};

window.submitClusterForm = async function(e) {
  if (e) e.preventDefault();
  const idInput = document.getElementById('modal-cluster-id') || document.getElementById('cluster-id-input');
  const nameInput = document.getElementById('modal-cluster-name') || document.getElementById('cluster-name-input');
  const descInput = document.getElementById('modal-cluster-desc') || document.getElementById('cluster-desc-input');
  const colorInput = document.getElementById('modal-cluster-color') || document.getElementById('cluster-color-input');

  const id = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const color = colorInput ? colorInput.value : '#38bdf8';

  if (!name) {
    showToast('Cluster name is required', 'warning');
    return;
  }

  const payload = { project_id: activeProjectId, name, description, color };
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/clusters/${id}` : '/api/clusters';

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeModal('cluster-modal-overlay');
      showToast(id ? 'Cluster updated' : 'Cluster created', 'success');
      await loadClusters();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadStats === 'function') await loadStats();
      if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Error saving cluster: ' + err.message, 'error');
  }
};

window.deleteCluster = async function(id) {
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot delete clusters.`, 'info');
    return;
  }
  if (!confirm('Are you sure you want to delete this cluster? Papers assigned to it will become unassigned.')) return;

  try {
    const res = await fetch(`/api/clusters/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Cluster deleted successfully', 'success');
      if (String(currentClusterId) === String(id)) {
        clearClusterFocus();
      } else {
        await loadClusters();
        if (typeof loadPapers === 'function') await loadPapers();
        if (typeof loadStats === 'function') await loadStats();
      }
    } else {
      throw new Error(await res.text());
    }
  } catch (err) {
    showToast('Failed to delete cluster: ' + err.message, 'error');
  }
};

window.setClusterColor = function(hex) {
  const colorInput = document.getElementById('modal-cluster-color');
  const hexInput = document.getElementById('modal-cluster-color-hex');
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
};

window.openClusterSettingsMasterModal = function(clusterId, initialTab = 'edit') {
  const c = allClusters.find(item => String(item.id) === String(clusterId)) || (allClusters[0] || null);
  if (!c) {
    showToast('Cluster not found', 'warning');
    return;
  }

  const idInput = document.getElementById('csetting-cluster-id');
  const nameInput = document.getElementById('csetting-cluster-name');
  const descInput = document.getElementById('csetting-cluster-desc');
  const colorInput = document.getElementById('csetting-cluster-color');
  const hexInput = document.getElementById('csetting-cluster-color-hex');
  const headerTitle = document.getElementById('csetting-header-title');
  const deleteNameBadge = document.getElementById('csetting-delete-cluster-name');

  if (idInput) idInput.value = c.id;
  if (nameInput) nameInput.value = c.name;
  if (descInput) descInput.value = c.description || '';
  if (colorInput) colorInput.value = c.color || '#38bdf8';
  if (hexInput) hexInput.value = c.color || '#38bdf8';
  if (headerTitle) headerTitle.textContent = `Cluster Settings: ${c.name}`;
  if (deleteNameBadge) deleteNameBadge.textContent = c.name;

  // Role checks for editing and deleting
  const role = (window.currentProjectRole || 'owner').toLowerCase();
  const isReadOnly = ['reviewer', 'viewer'].includes(role);
  if (nameInput) nameInput.disabled = isReadOnly;
  if (descInput) descInput.disabled = isReadOnly;
  if (colorInput) colorInput.disabled = isReadOnly;
  if (hexInput) hexInput.disabled = isReadOnly;

  const saveBtn = document.getElementById('btn-save-csettings');
  if (saveBtn) saveBtn.style.display = isReadOnly ? 'none' : 'inline-flex';

  const delBtn = document.getElementById('btn-submit-delete-cluster-from-settings');
  if (delBtn) delBtn.disabled = isReadOnly;

  switchClusterSettingsTab(initialTab);
  openModal('cluster-settings-modal-overlay');
};

window.switchClusterSettingsTab = function(tabName) {
  const tabBtns = document.querySelectorAll('.csettings-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.dataset.ctab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const panes = document.querySelectorAll('.csettings-tab-pane');
  panes.forEach(pane => {
    if (pane.id === `csettings-pane-${tabName}`) {
      pane.style.display = 'block';
    } else {
      pane.style.display = 'none';
    }
  });
};

window.setClusterSettingsColor = function(hex) {
  const colorInput = document.getElementById('csetting-cluster-color');
  const hexInput = document.getElementById('csetting-cluster-color-hex');
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
};

window.submitClusterSettingsForm = async function(e) {
  if (e) e.preventDefault();
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot edit clusters.`, 'info');
    return;
  }

  const idInput = document.getElementById('csetting-cluster-id');
  const nameInput = document.getElementById('csetting-cluster-name');
  const descInput = document.getElementById('csetting-cluster-desc');
  const colorInput = document.getElementById('csetting-cluster-color');

  const id = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const color = colorInput ? colorInput.value : '#38bdf8';

  if (!id || !name) {
    showToast('Cluster name is required', 'warning');
    return;
  }

  const payload = { project_id: activeProjectId, name, description, color };

  try {
    const res = await fetch(`/api/clusters/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeModal('cluster-settings-modal-overlay');
      showToast(`Cluster "${name}" updated successfully!`, 'success');
      await loadClusters();

      // If we are currently exploring this cluster, refresh focus banner elements immediately
      if (String(window.currentClusterId) === String(id)) {
        const bannerBadge = document.getElementById('focus-banner-badge');
        const bannerDesc = document.getElementById('focus-banner-desc');
        const colorBar = document.getElementById('cluster-color-bar');
        if (bannerBadge) {
          bannerBadge.textContent = name;
          bannerBadge.style.color = color;
          bannerBadge.style.textShadow = `0 0 22px ${color}55`;
        }
        if (bannerDesc) bannerDesc.textContent = description || 'Focus Mode active for this taxonomy subfamily.';
        if (colorBar) colorBar.style.background = color;
      }

      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadStats === 'function') await loadStats();
      if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to update cluster');
    }
  } catch (err) {
    showToast('Error updating cluster: ' + err.message, 'error');
  }
};

window.submitDeleteCurrentClusterFromSettings = async function() {
  const idInput = document.getElementById('csetting-cluster-id');
  const id = idInput ? idInput.value : window.currentClusterId;
  if (!id) return;

  closeModal('cluster-settings-modal-overlay');
  await window.deleteCluster(parseInt(id, 10));
};

window.exploreCluster = async function(clusterId) {
  currentClusterId = String(clusterId);
  window.currentClusterId = currentClusterId;
  const filterSel = document.getElementById('filter-cluster') || document.getElementById('filter-cluster-select');
  if (filterSel) filterSel.value = clusterId;

  const url = new URL(window.location.href);
  url.searchParams.set('cluster', clusterId);
  window.history.replaceState({}, '', url.toString());

  const banner = document.getElementById('cluster-focus-banner');
  const bannerBadge = document.getElementById('focus-banner-badge');
  const bannerDesc = document.getElementById('focus-banner-desc');
  const bannerCount = document.getElementById('focus-banner-count');
  const cl = allClusters.find(c => String(c.id) === String(clusterId));

  // Switch to dedicated Cluster Page view: hide top hero, global clusters grid, and unassigned box
  document.body.classList.add('cluster-page-active');
  const heroSec = document.querySelector('.hero');
  const clustersSec = document.querySelector('.clusters-section');
  const unassignedSec = document.getElementById('unassigned-section');
  if (heroSec) heroSec.style.display = 'none';
  if (clustersSec) clustersSec.style.display = 'none';
  if (unassignedSec) unassignedSec.style.display = 'none';

  const bannerWrapper = document.getElementById('cluster-banner-wrapper');
  if (bannerWrapper) bannerWrapper.style.display = 'block';

  if (banner && cl) {
    banner.style.display = 'flex';
    const col = cl.color || '#38bdf8';

    // Large cluster name display
    if (bannerBadge) {
      bannerBadge.textContent = cl.name;
      bannerBadge.style.color = col;
      bannerBadge.style.textShadow = `0 0 22px ${col}55`;
    }

    // Left color accent bar
    const colorBar = document.getElementById('cluster-color-bar');
    if (colorBar) colorBar.style.background = col;

    if (bannerDesc) bannerDesc.textContent = cl.description || 'Focus Mode active for this taxonomy subfamily.';
    if (bannerCount) bannerCount.textContent = `${cl.paper_count || 0} Papers`;
  }

  // Live telemetry update for this cluster
  if (typeof loadStats === 'function') loadStats();

  // Dynamically load columns for this cluster's table
  if (typeof loadDynamicColumns === 'function') {
    await loadDynamicColumns();
  }

  renderClusters();
  if (typeof applyFilters === 'function') applyFilters();
  if (typeof loadSynthesisInsights === 'function') loadSynthesisInsights();
  
  const mainView = document.querySelector('main');
  if (mainView) {
    mainView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.selectCluster = window.exploreCluster;

window.clearClusterFocus = async function() {
  currentClusterId = 'all';
  window.currentClusterId = 'all';
  const filterSel = document.getElementById('filter-cluster') || document.getElementById('filter-cluster-select');
  if (filterSel) filterSel.value = 'all';

  const url = new URL(window.location.href);
  url.searchParams.delete('cluster');
  window.history.replaceState({}, '', url.toString());

  // Restore overview sections
  document.body.classList.remove('cluster-page-active');
  const heroSec = document.querySelector('.hero');
  const clustersSec = document.querySelector('.clusters-section');
  const unassignedSec = document.getElementById('unassigned-section');
  if (heroSec) heroSec.style.display = 'block';
  if (clustersSec) clustersSec.style.display = 'block';
  if (typeof renderUnassignedBox === 'function') renderUnassignedBox();

  const bannerWrapper = document.getElementById('cluster-banner-wrapper');
  if (bannerWrapper) bannerWrapper.style.display = 'none';
  const banner = document.getElementById('cluster-focus-banner');
  if (banner) banner.style.display = 'none';

  // Restore global project telemetry
  if (typeof loadStats === 'function') loadStats();

  // Dynamically reload all project columns
  if (typeof loadDynamicColumns === 'function') {
    await loadDynamicColumns();
  }

  renderClusters();
  if (typeof applyFilters === 'function') applyFilters();
  if (typeof loadSynthesisInsights === 'function') loadSynthesisInsights();
};
