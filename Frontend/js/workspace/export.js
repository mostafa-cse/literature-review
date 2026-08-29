/**
 * LITNEXIS MATRIX EXPORT ENGINE
 * Multi-level Excel (.xlsx), CSV, JSON, Camera-Ready LaTeX (.tex), and BibTeX (.bib) downloads.
 */

window.updateExportColumnsList = async function(clusterId) {
  const checklist = document.getElementById('export-cols-checklist');
  if (!checklist) return;

  const baseCols = [
    { id: 'year', label: 'Year' },
    { id: 'title', label: 'Paper Title' },
    { id: 'authors', label: 'Authors' },
    { id: 'cluster', label: 'Cluster Name' },
    { id: 'domain', label: 'Domain' },
    { id: 'status', label: 'Reading Status' },
    { id: 'pub', label: 'Pub / Conf' },
    { id: 'doi', label: 'DOI' },
    { id: 'pdf_url', label: 'PDF Link' }
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

  const allExportCols = [...baseCols, ...dynCols];

  checklist.innerHTML = allExportCols.map(c => `
    <label class="col-checkbox-card checked" id="col-card-${c.id}">
      <input type="checkbox" class="export-col-cb" value="${c.id}" checked onchange="updateExportColCardState(this)">
      <span>${escapeHtml(c.label)}</span>
    </label>
  `).join('');

  updateExportSelectedCount();
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
    clusterSel.value = currentClusterId || 'all';

    clusterSel.onchange = function() {
      window.updateExportColumnsList(this.value);
    };
  }

  const initialCluster = clusterSel ? clusterSel.value : (currentClusterId || 'all');
  await window.updateExportColumnsList(initialCluster);

  openModal('export-modal-overlay');
};

window.updateExportColCardState = function(inputEl) {
  const card = inputEl.closest('.col-checkbox-card');
  if (card) {
    if (inputEl.checked) card.classList.add('checked');
    else card.classList.remove('checked');
  }
  updateExportSelectedCount();
};

window.updateExportSelectedCount = function() {
  const countBadge = document.getElementById('export-selected-count-badge');
  const checked = document.querySelectorAll('.export-col-cb:checked').length;
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

  const cluster_id = clusterSel ? clusterSel.value : 'all';
  const format = formatSel ? formatSel.value : 'xlsx';

  const selectedCols = Array.from(document.querySelectorAll('.export-col-cb:checked')).map(cb => cb.value);

  if (selectedCols.length === 0 && format !== 'bib') {
    showToast('Please select at least one column to export', 'warning');
    return;
  }

  const colsParam = encodeURIComponent(selectedCols.join(','));
  const url = `/api/export?project_id=${activeProjectId}&cluster_id=${cluster_id}&format=${format}&cols=${colsParam}`;

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
