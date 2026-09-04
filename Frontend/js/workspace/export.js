/**
 * LITSPHERE MATRIX EXPORT ENGINE
 * Multi-level Excel (.xlsx), CSV, and Camera-Ready LaTeX (.tex) downloads.
 * Supports dynamic column search, empty table detection, and multi-cluster filtering.
 */

let exportColumnsStore = [];
let exportSelectedSet = new Set();

window.updateExportColumnsList = async function(clusterId) {
  const checklist = document.getElementById('export-cols-checklist');
  const countBadge = document.getElementById('export-selected-count-badge');
  const submitBtn = document.getElementById('btn-submit-export');
  const searchInput = document.getElementById('export-col-search');
  if (!checklist) return;

  if (searchInput) searchInput.value = '';

  // 1. Check if the project or cluster has papers (Empty Table Detection)
  let papersInScope = 0;
  if (Array.isArray(allPapers)) {
    if (clusterId && clusterId !== 'all') {
      papersInScope = allPapers.filter(p => String(p.cluster_id) === String(clusterId)).length;
    } else {
      papersInScope = allPapers.length;
    }
  }

  // If table is completely empty:
  if (papersInScope === 0) {
    exportColumnsStore = [];
    exportSelectedSet.clear();
    checklist.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 2rem 1.5rem; text-align: center; background: rgba(244, 63, 94, 0.05); border: 1.5px dashed rgba(244, 63, 94, 0.3); border-radius: 8px; color: var(--text-secondary);">
        <div style="color: var(--accent-rose); margin-bottom: 0.4rem; display: flex; justify-content: center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <strong style="color: var(--accent-rose); font-size: 0.94rem; display: block; margin-bottom: 0.25rem;">Matrix Table Is Empty</strong>
        <span style="font-size: 0.82rem; line-height: 1.5; display: block; max-width: 420px; margin: 0 auto;">
          There are no research papers in this ${clusterId && clusterId !== 'all' ? 'selected cluster' : 'survey'}. You cannot export an empty matrix. Please add papers first.
        </span>
      </div>
    `;
    if (countBadge) countBadge.textContent = '0 Selected';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.title = 'Cannot export an empty survey matrix';
    }
    return;
  }

  // Enable download button when papers exist
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
    submitBtn.title = 'Download formatted export file';
  }

  // 2. Base Columns
  const baseCols = [
    { id: 'title', label: 'Title' },
    { id: 'authors', label: 'Authors' },
    { id: 'year', label: 'Year' },
    { id: 'pub', label: 'Venue' },
    { id: 'doi', label: 'DOI / Link' },
    { id: 'cluster', label: 'Cluster' },
    { id: 'domain', label: 'Domain' },
    { id: 'status', label: 'Reading Status' },
    { id: 'advantages', label: 'Advantages' },
    { id: 'criticism', label: 'Criticism' },
    { id: 'future_directions', label: 'Future Research Direction' },
    { id: 'keywords', label: 'Keywords' }
  ];

  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
    ? activeProjectId
    : (new URLSearchParams(window.location.search).get('project') || 1);

  let dynCols = [];
  try {
    let url = `/api/dynamic-columns?project_id=${projId}`;
    if (clusterId && clusterId !== 'all') {
      url += `&cluster_id=${clusterId}`;
    }
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      const cols = await res.json();
      const seen = new Set();
      (cols || []).forEach(c => {
        const name = (c.column_name || c.name || '').trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          dynCols.push({
            id: `dyn_${c.id || name}`,
            label: name
          });
        }
      });
    }
  } catch (err) {
    console.warn('Failed to load dynamic columns for export:', err);
  }

  exportColumnsStore = [...baseCols, ...dynCols];
  exportSelectedSet = new Set(exportColumnsStore.map(c => c.id));

  renderExportChecklist(exportColumnsStore);
};

function renderExportChecklist(colsToRender) {
  const checklist = document.getElementById('export-cols-checklist');
  if (!checklist) return;

  if (colsToRender.length === 0) {
    checklist.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 1.5rem; text-align: center; color: var(--text-tertiary); font-size: 0.85rem;">
        No columns match your search term.
      </div>
    `;
    return;
  }

  checklist.innerHTML = colsToRender.map(c => {
    const isChecked = exportSelectedSet.has(c.id);
    return `
      <label class="col-checkbox-card ${isChecked ? 'checked' : ''}" id="col-card-${c.id}">
        <input type="checkbox" class="export-col-cb" value="${c.id}" ${isChecked ? 'checked' : ''} onchange="handleExportColToggle(this, '${c.id}')">
        <span>${escapeHtml(c.label)}</span>
      </label>
    `;
  }).join('');

  updateExportSelectedCount();
}

window.handleExportColToggle = function(inputEl, colId) {
  if (inputEl.checked) {
    exportSelectedSet.add(colId);
  } else {
    exportSelectedSet.delete(colId);
  }
  const card = inputEl.closest('.col-checkbox-card');
  if (card) {
    if (inputEl.checked) card.classList.add('checked');
    else card.classList.remove('checked');
  }
  updateExportSelectedCount();
};

window.filterExportColumns = function(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    renderExportChecklist(exportColumnsStore);
    return;
  }
  const filtered = exportColumnsStore.filter(c => c.label.toLowerCase().includes(q));
  renderExportChecklist(filtered);
};

window.openExportModal = async function() {
  const clusterSel = document.getElementById('export-cluster-select');
  if (clusterSel) {
    clusterSel.innerHTML = '<option value="all">Full Project (All Clusters)</option>';
    if (Array.isArray(allClusters) && allClusters.length > 0) {
      allClusters.forEach(cl => {
        const opt = document.createElement('option');
        opt.value = cl.id;
        opt.textContent = `${cl.name} (${cl.paper_count || 0} papers)`;
        clusterSel.appendChild(opt);
      });
    }
    clusterSel.value = (typeof currentClusterId !== 'undefined' && currentClusterId) ? currentClusterId : 'all';

    clusterSel.onchange = function() {
      window.updateExportColumnsList(this.value);
    };
  }

  const initialCluster = clusterSel ? clusterSel.value : ((typeof currentClusterId !== 'undefined' && currentClusterId) ? currentClusterId : 'all');
  await window.updateExportColumnsList(initialCluster);

  openModal('export-modal-overlay');
};

window.updateExportSelectedCount = function() {
  const countBadge = document.getElementById('export-selected-count-badge');
  const checked = exportSelectedSet.size;
  if (countBadge) {
    countBadge.textContent = `${checked} Selected`;
  }
};

window.closeExportModal = function() {
  if (typeof closeModal === 'function') {
    closeModal('export-modal-overlay');
  } else {
    const modal = document.getElementById('export-modal-overlay');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
  }
};

window.toggleAllExportCols = function(check) {
  if (check) {
    exportColumnsStore.forEach(c => exportSelectedSet.add(c.id));
  } else {
    exportSelectedSet.clear();
  }
  const checkboxes = document.querySelectorAll('.export-col-cb');
  checkboxes.forEach(cb => {
    cb.checked = check;
    const card = cb.closest('.col-checkbox-card');
    if (card) {
      if (check) card.classList.add('checked');
      else card.classList.remove('checked');
    }
  });
  updateExportSelectedCount();
};

window.submitExport = function() {
  const clusterSel = document.getElementById('export-cluster-select');
  const formatSel = document.getElementById('export-format-select');

  // Verify papers exist
  if (!Array.isArray(allPapers) || allPapers.length === 0) {
    showToast('Cannot export an empty survey matrix. Please add papers first.', 'warning');
    return;
  }

  const cluster_id = clusterSel ? clusterSel.value : 'all';
  const format = formatSel ? formatSel.value : 'xlsx';

  const selectedCols = Array.from(exportSelectedSet);

  if (selectedCols.length === 0) {
    showToast('Please select at least one column to export', 'warning');
    return;
  }

  const colsParam = encodeURIComponent(selectedCols.join(','));
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
  const url = `/api/export?project_id=${pid}&cluster_id=${cluster_id}&format=${format}&cols=${colsParam}`;

  // Trigger browser download via temporary anchor element
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', '');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  closeExportModal();
  showToast(`Generating ${format.toUpperCase()} export download...`, 'success');
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
