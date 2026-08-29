/**
 * LITNEXIS DYNAMIC COLUMNS & COLUMN SPLITTING ENGINE
 * Manages custom dynamic taxonomy columns, multi-level splitting, and hierarchical headers.
 */

window.loadDynamicColumns = async function() {
  try {
    const isCluster = window.currentClusterId && window.currentClusterId !== 'all';
    const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (new URLSearchParams(window.location.search).get('project') || 1);
    let url = `/api/dynamic-columns?project_id=${projId}`;
    if (isCluster) {
      url += `&cluster_id=${window.currentClusterId}`;
    }

    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load dynamic columns');
    const cols = await res.json();

    // Deduplicate and normalise each column with both name and column_name
    const seen = new Set();
    const cleanCols = [];
    (cols || []).forEach(c => {
      const cName = (c.column_name || c.name || '').trim();
      if (cName && !seen.has(cName.toLowerCase())) {
        seen.add(cName.toLowerCase());
        cleanCols.push({
          ...c,
          name: cName,
          column_name: cName
        });
      }
    });

    activeDataColumns = cleanCols;
    activeClusterColumns = cleanCols;
    window.activeDataColumns = cleanCols;
    window.activeClusterColumns = cleanCols;

    populateColumnSplittingSelect();
    if (typeof populateSearchColumnDropdown === 'function') {
      populateSearchColumnDropdown();
    }
    if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers) && allPapers.length > 0) {
      renderMasterMatrix(allPapers);
    }
  } catch (err) {
    console.warn('Load dynamic columns error:', err);
  }
};

window.openAddColumnModal = function() {
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot add custom columns.`, 'info');
    return;
  }
  const nameInput = document.getElementById('add-col-name') || document.getElementById('new-dyn-col-name');
  if (nameInput) nameInput.value = '';
  openModal('add-column-modal');
};

window.submitAddDynamicColumn = async function(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('add-col-name') || document.getElementById('new-dyn-col-name');
  const typeSelect = document.getElementById('add-col-type') || document.getElementById('new-dyn-col-type');
  const clusterSel = document.getElementById('add-col-cluster-select') || document.getElementById('add-paper-cluster');
  const name = nameInput ? nameInput.value.trim() : '';
  const col_type = typeSelect ? typeSelect.value : 'text';
  const cluster_id = (window.currentClusterId && window.currentClusterId !== 'all')
    ? parseInt(window.currentClusterId, 10)
    : (clusterSel && clusterSel.value && clusterSel.value !== '__new__' ? parseInt(clusterSel.value, 10) : null);

  if (!name) {
    showToast('Column name is required', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/dynamic-columns', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        project_id: activeProjectId,
        cluster_id,
        column_name: name,
        name,
        col_type,
        data_type: col_type
      })
    });

    if (res.ok) {
      closeModal('add-column-modal');
      showToast(`Dynamic column "${name}" created!`, 'success');
      await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadStats === 'function') await loadStats();
    } else {
      const errText = await res.text();
      let msg = errText;
      try { msg = JSON.parse(errText).error || errText; } catch (_) {}
      throw new Error(msg);
    }
  } catch (err) {
    showToast('Failed to create column: ' + err.message, 'error');
  }
};

window.openSplitColumnModal = function(preSelectedKey) {
  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot split columns.`, 'info');
    return;
  }
  populateColumnSplittingSelect(preSelectedKey);
  initSplitSubColumnsList();
  openModal('split-column-modal');
};

let currentSplitSubCols = ['', ''];

function initSplitSubColumnsList(customList) {
  if (Array.isArray(customList) && customList.length >= 2) {
    currentSplitSubCols = [...customList];
  } else {
    currentSplitSubCols = ['', ''];
  }
  renderSplitSubColumnsRows();
}

function renderSplitSubColumnsRows() {
  const container = document.getElementById('split-subcols-list');
  if (!container) return;
  container.innerHTML = '';

  currentSplitSubCols.forEach((val, idx) => {
    const row = document.createElement('div');
    row.className = 'split-subcol-entry-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';

    const numBadge = document.createElement('span');
    numBadge.style.fontSize = '0.78rem';
    numBadge.style.fontWeight = '700';
    numBadge.style.color = 'var(--accent-primary)';
    numBadge.style.minWidth = '22px';
    numBadge.textContent = `#${idx + 1}`;
    row.appendChild(numBadge);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input split-subcol-input';
    input.placeholder = `Sub-Column ${idx + 1} Name`;
    input.value = val || '';
    input.oninput = (e) => {
      currentSplitSubCols[idx] = e.target.value;
    };
    row.appendChild(input);

    if (currentSplitSubCols.length > 2) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'split-edit-del-btn';
      delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      delBtn.title = 'Remove this sub-column';
      delBtn.style.fontSize = '1.2rem';
      delBtn.style.lineHeight = '1';
      delBtn.style.padding = '0 6px';
      delBtn.onclick = () => {
        currentSplitSubCols.splice(idx, 1);
        renderSplitSubColumnsRows();
      };
      row.appendChild(delBtn);
    }

    container.appendChild(row);
  });
}

function addAnotherSplitSubColumn() {
  currentSplitSubCols.push('');
  renderSplitSubColumnsRows();
}

function populateColumnSplittingSelect(preSelectedKey) {
  const sel = document.getElementById('split-parent-col-select') || document.getElementById('split-target-col-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Choose Column to Split --</option>';

  const eligibleCols = (window.activeDataColumns || []).filter(c => !c.parent_column_id);
  eligibleCols.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id || c.name;
    opt.setAttribute('data-col-name', c.name || c.column_name);
    opt.textContent = c.name || c.column_name;
    sel.appendChild(opt);
  });

  if (preSelectedKey) {
    const cleanKey = preSelectedKey.replace(/^dyn_/, '').toLowerCase();
    const match = eligibleCols.find(c => 
      String(c.id) === String(preSelectedKey) || 
      (c.name && c.name.toLowerCase() === cleanKey) ||
      (c.key && c.key.toLowerCase() === preSelectedKey.toLowerCase())
    );
    if (match) {
      sel.value = match.id || match.name;
    }
  }
}

window.submitSplitColumn = async function(e) {
  if (e) e.preventDefault();
  const targetColSel = document.getElementById('split-parent-col-select') || document.getElementById('split-target-col-select');

  const selectedOpt = targetColSel ? targetColSel.options[targetColSel.selectedIndex] : null;
  const colVal = targetColSel ? targetColSel.value : '';
  const colName = selectedOpt ? (selectedOpt.getAttribute('data-col-name') || selectedOpt.textContent) : '';

  if (!colVal && !colName) {
    showToast('Please select a target column to split', 'warning');
    return;
  }

  // Gather sub-columns from dynamic inputs
  const inputs = document.querySelectorAll('.split-subcol-input');
  const sub_columns = [];
  inputs.forEach(inp => {
    const v = inp.value.trim();
    if (v) sub_columns.push(v);
  });

  if (sub_columns.length < 2) {
    showToast('Please specify at least two sub-column names', 'warning');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-split-col');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Splitting...';
  }

  try {
    const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
    const clustId = (window.currentClusterId && window.currentClusterId !== 'all') ? window.currentClusterId : null;

    const res = await fetch('/api/dynamic-columns/split', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        project_id: projId,
        cluster_id: clustId,
        parent_column_id: !isNaN(parseInt(colVal, 10)) ? parseInt(colVal, 10) : null,
        parent_column_name: colName || colVal,
        sub_columns
      })
    });

    if (res.ok) {
      closeModal('split-column-modal');
      showToast(`Column "${colName || colVal}" successfully split into ${sub_columns.length} sub-columns!`, 'success');
      await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof populateSearchColumnDropdown === 'function') populateSearchColumnDropdown();
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to split column');
    }
  } catch (err) {
    showToast('Failed to split column: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Apply Split';
    }
  }
};

// Bind split column modal controls
document.addEventListener('DOMContentLoaded', () => {
  const btnClose = document.getElementById('btn-close-split-col');
  const btnCancel = document.getElementById('btn-cancel-split-col');
  const btnSubmit = document.getElementById('btn-submit-split-col');
  const btnAddMore = document.getElementById('btn-add-more-subcol');

  if (btnClose) btnClose.onclick = () => closeModal('split-column-modal');
  if (btnCancel) btnCancel.onclick = () => closeModal('split-column-modal');
  if (btnSubmit) btnSubmit.onclick = (e) => window.submitSplitColumn(e);
  if (btnAddMore) {
    btnAddMore.onclick = () => addAnotherSplitSubColumn();
  }

  const btnOpenSplit = document.getElementById('btn-split-dyn-col') || document.getElementById('matrix-btn-split-col');
  if (btnOpenSplit) {
    btnOpenSplit.onclick = () => window.openSplitColumnModal();
  }
});
