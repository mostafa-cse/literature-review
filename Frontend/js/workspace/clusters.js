/**
 * LITSPHERE TAXONOMY CLUSTERS ENGINE
 * Manages taxonomy clusters, color tagging, cluster cards, and focused cluster filtering.
 */

window.clustersViewMode = 'cards'; // 'cards' | 'table'

let draggedClusterId = null;
window._isClusterDragging = false;

window.handleClusterDragStart = function (event, clusterId) {
  if (event.target.closest('button, a, input, select, textarea, .kw-tag')) {
    event.preventDefault();
    return;
  }
  draggedClusterId = clusterId;
  window._isClusterDragging = true;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(clusterId));
  }
  const el = event.currentTarget;
  if (el) {
    el.classList.add('is-dragging');
  }
};

window.handleClusterDragOver = function (event) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
};

window.handleClusterDragEnter = function (event, el) {
  if (el && !el.classList.contains('is-dragging')) {
    el.classList.add('drag-over');
  }
};

window.handleClusterDragLeave = function (event, el) {
  if (el) {
    const rect = el.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      el.classList.remove('drag-over');
    }
  }
};

window.handleClusterDrop = function (event, targetClusterId) {
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('.cluster-card, .clusters-table-row').forEach(el => {
    el.classList.remove('drag-over', 'is-dragging');
  });

  const sourceId = draggedClusterId;
  draggedClusterId = null;
  setTimeout(() => { window._isClusterDragging = false; }, 150);

  if (!sourceId || String(sourceId) === String(targetClusterId)) return;
  if (!Array.isArray(allClusters) || allClusters.length < 2) return;

  const fromIdx = allClusters.findIndex(c => String(c.id) === String(sourceId));
  const toIdx = allClusters.findIndex(c => String(c.id) === String(targetClusterId));
  if (fromIdx === -1 || toIdx === -1) return;

  const moved = allClusters.splice(fromIdx, 1)[0];
  allClusters.splice(toIdx, 0, moved);

  window.saveClustersOrder(allClusters.map(c => c.id));
};

window.handleClusterDragEnd = function (event) {
  document.querySelectorAll('.cluster-card, .clusters-table-row').forEach(el => {
    el.classList.remove('drag-over', 'is-dragging');
  });
  draggedClusterId = null;
  setTimeout(() => { window._isClusterDragging = false; }, 150);
};

window.moveClusterPosition = function (clusterId, direction) {
  if (!Array.isArray(allClusters) || allClusters.length < 2) return;
  const idx = allClusters.findIndex(c => String(c.id) === String(clusterId));
  if (idx === -1) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= allClusters.length) return;

  const moved = allClusters.splice(idx, 1)[0];
  allClusters.splice(targetIdx, 0, moved);

  window.saveClustersOrder(allClusters.map(c => c.id));
};

window.saveClustersOrder = async function (clusterIds) {
  // Optimistically re-render to reflect new sequence instantly
  renderClusters();
  populateClusterDropdowns();

  try {
    const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
    const res = await fetch('/api/clusters/reorder', {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project_id: pid, cluster_ids: clusterIds })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save cluster order');
    }

    showToast('Cluster position updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    // Revert by re-fetching
    window.loadClusters();
  }
};

window.switchClustersView = function (mode) {
  window.clustersViewMode = mode || 'cards';
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
  try { localStorage.setItem(`clusters_view_mode_${pid}`, window.clustersViewMode); } catch (_) { }
  const btnCards = document.getElementById('btn-clusters-view-cards');
  const btnTable = document.getElementById('btn-clusters-view-table');
  if (btnCards) btnCards.classList.toggle('active', window.clustersViewMode === 'cards');
  if (btnTable) btnTable.classList.toggle('active', window.clustersViewMode === 'table');
  renderClusters();
};

window.loadClusters = async function () {
  try {
    const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
    const savedMode = localStorage.getItem(`clusters_view_mode_${pid}`);
    if (savedMode && (savedMode === 'cards' || savedMode === 'table')) {
      window.clustersViewMode = savedMode;
      const btnCards = document.getElementById('btn-clusters-view-cards');
      const btnTable = document.getElementById('btn-clusters-view-table');
      if (btnCards) btnCards.classList.toggle('active', window.clustersViewMode === 'cards');
      if (btnTable) btnTable.classList.toggle('active', window.clustersViewMode === 'table');
    }
    const res = await fetch(`/api/clusters?project_id=${pid}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load taxonomy clusters');
    allClusters = await res.json();
    window.allClusters = allClusters;
    renderClusters();
    populateClusterDropdowns();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.renderClusters = function () {
  const container = document.getElementById('clusters-grid');
  const countBadge = document.getElementById('clusters-count-badge');
  if (countBadge && Array.isArray(allClusters)) {
    countBadge.textContent = `${allClusters.length} ${allClusters.length === 1 ? 'Cluster' : 'Clusters'}`;
  }
  if (!container) return;
  container.innerHTML = '';

  const role = (window.currentProjectRole || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isEditor = role === 'editor';
  const canEdit = isOwner || isEditor;

  if (allClusters.length === 0) {
    container.className = 'clusters-grid';
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 2.5rem 1.5rem; background: var(--bg-surface); border: 1.5px dashed var(--border-base); border-radius: 12px;">
        <div style="margin-bottom: 0.65rem; color: var(--accent-primary);"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 0.35rem;">No Taxonomy Clusters Created Yet</div>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: ${canEdit ? '1.15rem' : '0.2rem'}; max-width: 460px; margin-left: auto; margin-right: auto;">Categorize your systematic review papers into structured sub-domain taxonomy clusters for benchmark synthesis.</p>
        ${canEdit ? `<button class="action-btn gold" onclick="openCreateClusterModal()">+ Create First Cluster</button>` : `<span style="font-size:0.80rem; color:var(--text-tertiary); font-family:var(--font-mono);">[Read-Only Mode] Taxonomy clusters can only be created by the Owner or Editor.</span>`}
      </div>
    `;
    return;
  }

  if (window.clustersViewMode === 'table') {
    container.className = 'clusters-table-view-wrap';
    container.innerHTML = `
      <div class="clusters-table-wrapper">
        <table class="clusters-table">
          <colgroup>
            <col class="col-w-idx" style="width: 52px;">
            <col class="col-w-info">
            <col class="col-w-papers" style="width: 135px;">
            <col class="col-w-progress" style="width: 220px;">
            <col class="col-w-columns" style="width: 105px;">
            <col class="col-w-keywords" style="width: 105px;">
          </colgroup>
          <thead>
            <tr>
              <th class="th-cluster-idx" scope="col">#</th>
              <th class="th-cluster-info" scope="col">Cluster Name &amp; Scope</th>
              <th class="th-cluster-papers" scope="col">Total Papers</th>
              <th class="th-cluster-progress" scope="col">Reading Progress</th>
              <th class="th-cluster-columns" scope="col">Columns</th>
              <th class="th-cluster-keywords" scope="col">Keywords</th>
            </tr>
          </thead>
          <tbody>
            ${allClusters.map((c, idx) => {
      const clusterColor = c.color || 'var(--accent-primary)';
      const matchingPapers = (Array.isArray(window.allPapers) && window.allPapers.length > 0)
        ? window.allPapers.filter(p => String(p.cluster_id) === String(c.id))
        : null;
      const totalPapers = matchingPapers !== null ? matchingPapers.length : (c.paper_count || 0);
      const readPapers = matchingPapers !== null ? matchingPapers.filter(p => p.status === 'read').length : (c.read_count || 0);
      const unreadPapers = (c.unread_count !== undefined && matchingPapers === null)
        ? c.unread_count
        : (totalPapers - readPapers > 0 ? totalPapers - readPapers : 0);
      const columnsCount = c.column_count || 0;
      let keywordsCount = c.keyword_count || 0;
      if (matchingPapers !== null && matchingPapers.length > 0) {
        const kwSet = new Set();
        matchingPapers.forEach(p => {
          if (Array.isArray(p.keywords)) {
            p.keywords.forEach(k => {
              if (k && typeof k === 'string') {
                const clean = k.replace(/^#/, '').trim();
                if (clean) kwSet.add(clean.toLowerCase());
              }
            });
          }
        });
        if (kwSet.size > 0 && !keywordsCount) keywordsCount = kwSet.size;
      }
      const readPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;
      const isActive = String(c.id) === String(currentClusterId);

      return `
                <tr class="clusters-table-row ${isActive ? 'active-row' : ''}"
                    data-cluster-id="${c.id}"
                    ${canEdit ? `draggable="true" ondragstart="window.handleClusterDragStart(event, ${c.id})" ondragover="window.handleClusterDragOver(event)" ondragenter="window.handleClusterDragEnter(event, this)" ondragleave="window.handleClusterDragLeave(event, this)" ondrop="window.handleClusterDrop(event, ${c.id})" ondragend="window.handleClusterDragEnd(event)"` : ''}
                    onclick="if (window._isClusterDragging) return; exploreCluster(${c.id})">
                  <td class="col-cluster-idx" style="text-align: center;">
                    <div class="cluster-idx-cell">
                      ${canEdit ? `
                        <span class="cluster-drag-handle" title="Drag row to reposition" aria-label="Drag handle">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="9" cy="5" r="2.2"></circle>
                            <circle cx="15" cy="5" r="2.2"></circle>
                            <circle cx="9" cy="12" r="2.2"></circle>
                            <circle cx="15" cy="12" r="2.2"></circle>
                            <circle cx="9" cy="19" r="2.2"></circle>
                            <circle cx="15" cy="19" r="2.2"></circle>
                          </svg>
                        </span>
                      ` : ''}
                      <span class="cluster-row-num">${idx + 1}</span>
                    </div>
                  </td>
                  <td class="col-cluster-info">
                    <div class="cluster-info-header">
                      <span class="cluster-color-dot" style="background:${clusterColor}; box-shadow: 0 0 10px ${clusterColor}88;"></span>
                      <strong class="cluster-name-title">${escapeHtml(c.name)}</strong>
                      <span class="cluster-id-badge">#${c.id}</span>
                      ${canEdit ? `
                        <button type="button" class="cluster-action-icon-btn cluster-inline-gear-btn" onclick="event.stopPropagation(); openClusterSettingsMasterModal(${c.id})" title="Cluster Settings &amp; Manage" aria-label="Cluster Settings">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </button>
                      ` : ''}
                      ${isActive ? `<span class="cluster-active-pill"><span class="pulse-dot"></span>Active Focus</span>` : ''}
                    </div>
                    <div class="cluster-scope-desc" title="${escapeHtml(c.description || 'Systematic sub-domain taxonomy group')}">
                      ${escapeHtml(c.description || 'Systematic sub-domain taxonomy group')}
                    </div>
                  </td>
                  <td class="col-cluster-papers" style="text-align: center;">
                    <span class="cluster-paper-badge ${totalPapers > 0 ? 'has-papers' : 'zero-papers'}">
                      <span class="paper-badge-val">${totalPapers}</span>
                      <span class="paper-badge-label">${totalPapers === 1 ? 'paper' : 'papers'}</span>
                    </span>
                  </td>
                  <td class="col-cluster-progress">
                    <div class="cluster-table-progress-box">
                      <div class="cluster-table-progress-meta">
                        <span class="cluster-table-pct" style="color: ${readPct > 0 ? 'var(--accent-gold)' : 'var(--text-tertiary)'}; font-weight: 700;">${readPct}%</span>
                        <span class="cluster-table-counts">${totalPapers > 0 ? `${readPapers} read • ${unreadPapers} unread` : '0 read • 0 unread'}</span>
                      </div>
                      <div class="cluster-table-track">
                        <div class="cluster-table-fill" style="width: ${readPct}%; background: linear-gradient(90deg, ${clusterColor} 0%, var(--accent-gold) 100%);"></div>
                      </div>
                    </div>
                  </td>
                  <td class="col-cluster-columns" style="text-align: center;">
                    <span class="cluster-num-stat col-num ${columnsCount > 0 ? 'has-count' : 'zero-count'}" title="${columnsCount} Columns">
                      ${columnsCount}
                    </span>
                  </td>
                  <td class="col-cluster-keywords" style="text-align: center;">
                    <span class="cluster-num-stat kw-num ${keywordsCount > 0 ? 'has-count' : 'zero-count'}" title="${keywordsCount} Keywords">
                      ${keywordsCount}
                    </span>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.className = 'clusters-grid';
    allClusters.forEach((c, idx) => {
      const card = document.createElement('div');
      card.className = `cluster-card ${String(c.id) === String(currentClusterId) ? 'active-focus' : ''}`;
      card.setAttribute('data-cluster-id', c.id);
      if (canEdit) {
        card.setAttribute('draggable', 'true');
        card.ondragstart = (e) => window.handleClusterDragStart(e, c.id);
        card.ondragover = (e) => window.handleClusterDragOver(e);
        card.ondragenter = (e) => window.handleClusterDragEnter(e, card);
        card.ondragleave = (e) => window.handleClusterDragLeave(e, card);
        card.ondrop = (e) => window.handleClusterDrop(e, c.id);
        card.ondragend = (e) => window.handleClusterDragEnd(e);
      }
      card.onclick = () => {
        if (window._isClusterDragging) return;
        exploreCluster(c.id);
      };

      const clusterColor = c.color || 'var(--accent-primary)';
      const matchingPapers = (Array.isArray(window.allPapers) && window.allPapers.length > 0)
        ? window.allPapers.filter(p => String(p.cluster_id) === String(c.id))
        : null;
      const totalPapers = matchingPapers !== null ? matchingPapers.length : (c.paper_count || 0);
      const readPapers = matchingPapers !== null ? matchingPapers.filter(p => p.status === 'read').length : (c.read_count || 0);
      const unreadPapers = (c.unread_count !== undefined && matchingPapers === null)
        ? c.unread_count
        : (totalPapers - readPapers > 0 ? totalPapers - readPapers : 0);
      const columnsCount = c.column_count || 0;
      let keywordsCount = c.keyword_count || 0;
      if (matchingPapers !== null && matchingPapers.length > 0) {
        const kwSet = new Set();
        matchingPapers.forEach(p => {
          if (Array.isArray(p.keywords)) {
            p.keywords.forEach(k => { if (k) kwSet.add(String(k).trim().toLowerCase()); });
          }
        });
        if (kwSet.size > 0 && !keywordsCount) keywordsCount = kwSet.size;
      }
      const readPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

      card.innerHTML = `
        <div>
          <div class="cluster-header">
            <div class="cluster-header-left">
              ${canEdit ? `
                <span class="cluster-drag-handle" title="Drag to reposition cluster">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="5" r="1.5"></circle>
                    <circle cx="15" cy="5" r="1.5"></circle>
                    <circle cx="9" cy="12" r="1.5"></circle>
                    <circle cx="15" cy="12" r="1.5"></circle>
                    <circle cx="9" cy="19" r="1.5"></circle>
                    <circle cx="15" cy="19" r="1.5"></circle>
                  </svg>
                </span>
              ` : ''}
              <span class="cluster-color-dot" style="background:${clusterColor}; box-shadow: 0 0 10px ${clusterColor}88;"></span>
              <span class="cluster-tag-label" style="color: var(--text-tertiary);">TAXONOMY CLUSTER</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              ${canEdit ? `
                <div class="cluster-reorder-controls" style="display: inline-flex; align-items: center; gap: 0.2rem; margin-right: 0.2rem;">
                  <button type="button" class="cluster-reorder-btn" onclick="event.stopPropagation(); window.moveClusterPosition(${c.id}, -1)" title="Move Cluster Left" ${idx === 0 ? 'disabled' : ''}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>
                  <button type="button" class="cluster-reorder-btn" onclick="event.stopPropagation(); window.moveClusterPosition(${c.id}, 1)" title="Move Cluster Right" ${idx === allClusters.length - 1 ? 'disabled' : ''}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
              ` : ''}
              <span class="cluster-id-badge" style="font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; color: var(--text-tertiary); background: var(--bg-surface-raised); padding: 0.15rem 0.45rem; border-radius: 6px; border: 1px solid var(--border-base);">#${c.id}</span>
              ${canEdit ? `
                <button type="button" class="icon-btn-subtle" onclick="event.stopPropagation(); openClusterSettingsMasterModal(${c.id})" title="Cluster Settings &amp; Manage" style="background: transparent; border: none; color: var(--text-tertiary); cursor: pointer; padding: 0.15rem 0.3rem; border-radius: 4px; display: inline-flex; align-items: center;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                </button>
              ` : ''}
            </div>
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
          <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-tertiary); display: flex; align-items: center; gap: 0.35rem;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${clusterColor};"></span>
            <span>Focus Mode</span>
          </span>
          <button class="action-btn gold mini-btn" onclick="event.stopPropagation(); exploreCluster(${c.id})" style="font-weight: 700; padding: 0.35rem 0.95rem;">
            Explore Cluster →
          </button>
        </div>
      `;

      container.appendChild(card);
    });
  }
};

window.highlightClusterCard = function (clusterId) {
  const card = document.querySelector(`.cluster-card[data-cluster-id="${clusterId}"]`) ||
    document.getElementById(`cluster-card-${clusterId}`) ||
    document.querySelector(`.clusters-table-row[data-cluster-id="${clusterId}"]`);
  if (card) {
    card.classList.remove('cluster-card-pulse-assigned');
    void card.offsetWidth;
    card.classList.add('cluster-card-pulse-assigned');
    setTimeout(() => {
      card.classList.remove('cluster-card-pulse-assigned');
    }, 2000);
  }
};

window.populateClusterDropdowns = function () {
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

window.openCreateClusterModal = function () {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot create clusters.`, 'info');
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

window.editCluster = function (id) {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot edit clusters.`, 'info');
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

window.submitClusterForm = async function (e) {
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
      showToast(id ? 'Cluster updated successfully' : 'Cluster created successfully', 'success');
      try {
        await loadClusters();
      } catch (ce) {
        console.warn('loadClusters err:', ce);
      }
      try {
        if (typeof loadPapers === 'function') await loadPapers();
      } catch (pe) {
        console.warn('loadPapers err:', pe);
      }
      try {
        if (typeof loadStats === 'function') await loadStats();
      } catch (se) {
        console.warn('loadStats err:', se);
      }
      try {
        if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
      } catch (sye) { }
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || (await res.text()) || 'Failed to save cluster');
    }
  } catch (err) {
    showToast('Error saving cluster: ' + err.message, 'error');
  }
};

window.deleteCluster = async function (id, skipConfirm = false) {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot delete clusters.`, 'info');
    return;
  }
  if (!skipConfirm) {
    if (!confirm('Are you sure you want to delete this cluster? Papers assigned to it will become unassigned.')) return;
  }

  const idStr = String(id);
  const targetIdNum = parseInt(id, 10);

  try {
    const res = await fetch(`/api/clusters/${targetIdNum}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      // 1. Close settings modal if open
      if (typeof closeModal === 'function') {
        closeModal('cluster-settings-modal-overlay');
      }

      showToast('Cluster deleted successfully', 'success');

      // 2. Optimistically update local memory state immediately
      if (Array.isArray(allClusters)) {
        allClusters = allClusters.filter(c => String(c.id) !== idStr);
        window.allClusters = allClusters;
      }
      if (Array.isArray(allPapers)) {
        allPapers.forEach(p => {
          if (String(p.cluster_id) === idStr) {
            p.cluster_id = null;
            p.cluster_name = null;
            p.cluster_color = null;
          }
        });
        window.allPapers = allPapers;
        unassignedPapers = allPapers.filter(p => !p.cluster_id);
        window.unassignedPapers = unassignedPapers;
      }

      // 3. Remove DOM card or row elements immediately for live response
      const domCards = document.querySelectorAll(`.cluster-card[data-cluster-id="${targetIdNum}"], .cluster-card[data-cluster-id="${idStr}"]`);
      domCards.forEach(el => el.remove());

      // 4. If currentClusterId was the deleted cluster, exit cluster focus mode back to overview
      const wasActiveCluster = String(currentClusterId) === idStr || String(window.currentClusterId) === idStr;
      if (wasActiveCluster) {
        await clearClusterFocus();
      } else {
        renderClusters();
        populateClusterDropdowns();
        if (typeof renderUnassignedBox === 'function') renderUnassignedBox();
      }

      // 5. Authoritatively reload all data from server to guarantee 100% database sync
      try {
        await loadClusters();
      } catch (ce) {
        console.warn('loadClusters sync err:', ce);
      }

      try {
        if (typeof loadDynamicColumns === 'function') {
          await loadDynamicColumns();
        }
      } catch (de) {
        console.warn('loadDynamicColumns sync err:', de);
      }

      try {
        if (typeof loadPapers === 'function') {
          await loadPapers();
        }
      } catch (pe) {
        console.warn('loadPapers sync err:', pe);
      }

      try {
        if (typeof loadStats === 'function') {
          await loadStats();
        }
      } catch (se) {
        console.warn('loadStats sync err:', se);
      }

      try {
        if (typeof renderUnassignedBox === 'function') {
          renderUnassignedBox();
        }
      } catch (ue) {
        console.warn('renderUnassignedBox err:', ue);
      }

      try {
        if (typeof renderKeywordsHub === 'function') {
          renderKeywordsHub();
        }
      } catch (ke) {
        console.warn('renderKeywordsHub err:', ke);
      }

      try {
        if (typeof applyFilters === 'function') {
          applyFilters();
        }
      } catch (afe) {
        console.warn('applyFilters err:', afe);
      }

      try {
        if (typeof loadSynthesisInsights === 'function') {
          await loadSynthesisInsights();
        }
      } catch (sye) {
        console.warn('loadSynthesisInsights err:', sye);
      }
    } else {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) msg = parsed.error;
      } catch (e) { }
      throw new Error(msg || 'Failed to delete cluster');
    }
  } catch (err) {
    showToast('Failed to delete cluster: ' + err.message, 'error');
  }
};

window.setClusterColor = function (hex) {
  const colorInput = document.getElementById('modal-cluster-color');
  const hexInput = document.getElementById('modal-cluster-color-hex');
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
};

window.openClusterSettingsMasterModal = function (clusterId, initialTab = 'edit') {
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
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
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

window.switchClusterSettingsTab = function (tabName) {
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

window.setClusterSettingsColor = function (hex) {
  const colorInput = document.getElementById('csetting-cluster-color');
  const hexInput = document.getElementById('csetting-cluster-color-hex');
  if (colorInput) colorInput.value = hex;
  if (hexInput) hexInput.value = hex;
};

window.submitClusterSettingsForm = async function (e) {
  if (e) e.preventDefault();
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot edit clusters.`, 'info');
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

window.submitDeleteCurrentClusterFromSettings = async function () {
  const idInput = document.getElementById('csetting-cluster-id');
  const id = idInput ? idInput.value : window.currentClusterId;
  if (!id) return;

  closeModal('cluster-settings-modal-overlay');
  await window.deleteCluster(parseInt(id, 10), true);
};

window.exploreCluster = async function (clusterId) {
  if (window._isClusterDragging) return;
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
    const clusterPaperCount = (Array.isArray(window.allPapers) && window.allPapers.length > 0)
      ? window.allPapers.filter(p => String(p.cluster_id) === String(clusterId)).length
      : (cl.paper_count || 0);
    if (bannerCount) bannerCount.textContent = `${clusterPaperCount} Papers`;
  }

  // Live telemetry update for this cluster
  if (typeof loadStats === 'function') loadStats();

  // Dynamically load columns for this cluster's table
  if (typeof loadDynamicColumns === 'function') {
    await loadDynamicColumns();
  }

  renderClusters();
  if (typeof renderKeywordsHub === 'function') renderKeywordsHub();
  if (typeof applyFilters === 'function') applyFilters();
  if (typeof loadSynthesisInsights === 'function') loadSynthesisInsights();

  const mainView = document.querySelector('main');
  if (mainView) {
    mainView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.selectCluster = window.exploreCluster;

window.clearClusterFocus = async function () {
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
  if (typeof loadStats === 'function') await loadStats();

  // Dynamically reload all project columns
  if (typeof loadDynamicColumns === 'function') {
    await loadDynamicColumns();
  }

  renderClusters();
  if (typeof renderKeywordsHub === 'function') renderKeywordsHub();
  if (typeof applyFilters === 'function') applyFilters();
  if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
};
