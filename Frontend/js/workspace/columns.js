/**
 * LITSPHERE DYNAMIC COLUMNS & COLUMN SPLITTING ENGINE
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

    let cols = await window.api.get(url, { abortKey: 'workspace-columns' });

    // If cluster query returned empty, fall back to survey project's dynamic columns
    if ((!Array.isArray(cols) || cols.length === 0) && isCluster) {
      try {
        const pCols = await window.api.get(`/api/dynamic-columns?project_id=${projId}`);
        if (Array.isArray(pCols) && pCols.length > 0) {
          cols = pCols;
        }
      } catch (_) {}
    }

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
    if (typeof window.updateMatrixColumnButtonStates === 'function') {
      window.updateMatrixColumnButtonStates();
    }
    if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers) && allPapers.length > 0) {
      renderMasterMatrix(allPapers);
    }
  } catch (err) {
    console.warn('Load dynamic columns error:', err);
  }
};

window.updateMatrixColumnButtonStates = function() {
  const btnSplit = document.getElementById('matrix-btn-split-col') || document.getElementById('btn-split-dyn-col');
  const eligibleCols = (window.activeDataColumns || []).filter(c => !c.parent_column_id);
  const hasCols = eligibleCols.length > 0;

  if (btnSplit) {
    if (!hasCols) {
      btnSplit.setAttribute('disabled', 'true');
      btnSplit.setAttribute('aria-disabled', 'true');
      btnSplit.classList.add('btn-split-disabled');
      btnSplit.title = 'No customizable columns available to split. Please click "+ Add Column" first.';
    } else {
      btnSplit.removeAttribute('disabled');
      btnSplit.removeAttribute('aria-disabled');
      btnSplit.classList.remove('btn-split-disabled');
      btnSplit.title = 'Split an extraction column into multi-level sub-columns';
    }
  }

  const btnAdd = document.getElementById('matrix-btn-add-col') || document.getElementById('btn-open-add-col');
  if (btnAdd) {
    if (!hasCols) {
      btnAdd.title = 'Click + Add Column to define taxonomy extraction parameters for this matrix';
      btnAdd.classList.add('pulse-add-col-cta');
    } else {
      btnAdd.title = 'Add new extraction column';
      btnAdd.classList.remove('pulse-add-col-cta');
    }
  }
};

window.openAddColumnModal = function() {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot add custom columns.`, 'info');
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

/**
 * Retrieves existing sub-columns for a column if it was previously split.
 */
window.getExistingSubColumnsForColumn = function(colIdentifier) {
  if (!colIdentifier) return [];
  const idStr = String(colIdentifier).trim().toLowerCase();
  const cleanKey = idStr.replace(/^dyn_/, '');

  // 1. Check in window.activeDataColumns / columnsData / activeClusterColumns
  const allCols = window.activeDataColumns || window.columnsData || window.activeClusterColumns || [];
  const parentCol = allCols.find(c =>
    !c.parent_column_id && (
      String(c.id).toLowerCase() === idStr ||
      String(c.id).toLowerCase() === cleanKey ||
      (c.name && c.name.toLowerCase() === cleanKey) ||
      (c.column_name && c.column_name.toLowerCase() === cleanKey) ||
      (c.key && c.key.toLowerCase() === idStr) ||
      (c.key && c.key.toLowerCase() === `dyn_${cleanKey}`)
    )
  );

  if (parentCol) {
    if (Array.isArray(parentCol.sub_columns) && parentCol.sub_columns.length >= 2) {
      return parentCol.sub_columns.map((s, idx) => {
        const sStr = typeof s === 'string' ? s : (s.name || s.column_name || `Sub ${idx + 1}`);
        const m = sStr.match(/\(([^)]+)\)$/);
        return m ? m[1].trim() : sStr.trim();
      });
    }

    const childCols = allCols.filter(c => 
      c.parent_column_id && (
        String(c.parent_column_id) === String(parentCol.id) ||
        (c.parent_column_name && c.parent_column_name.toLowerCase() === (parentCol.name || parentCol.column_name || '').toLowerCase())
      )
    );
    if (childCols.length >= 2) {
      return childCols.map((c, idx) => {
        const sStr = c.name || c.column_name || `Sub ${idx + 1}`;
        const m = sStr.match(/\(([^)]+)\)$/);
        return m ? m[1].trim() : sStr.trim();
      });
    }
  }

  // 2. Check DOM Table elements
  const table = document.getElementById('matrix-table');
  if (table) {
    const mainHeaderRow = table.querySelector('thead tr:first-child');
    if (mainHeaderRow) {
      let subThOffset = 0;
      for (let i = 0; i < mainHeaderRow.cells.length; i++) {
        const th = mainHeaderRow.cells[i];
        const span = parseInt(th.colSpan, 10) || 1;
        const thKey = (th.getAttribute('data-col-key') || '').toLowerCase();
        const thId = (th.getAttribute('data-col-id') || '').toLowerCase();
        const thName = (th.getAttribute('data-col-name') || th.querySelector('.col-title-text')?.textContent || '').trim().toLowerCase();

        const isMatch = (
          thKey === idStr ||
          thKey === `dyn_${cleanKey}` ||
          thId === idStr ||
          thId === cleanKey ||
          thName === idStr ||
          thName === cleanKey
        );

        if (isMatch) {
          if (span > 1 || th.getAttribute('data-is-split') === 'true') {
            const fromDataset = [];
            for (let s = 1; s <= span; s++) {
              if (th.dataset[`subName${s}`]) {
                fromDataset.push(th.dataset[`subName${s}`]);
              }
            }
            if (fromDataset.length >= 2) return fromDataset;

            const subHeaderRow = document.getElementById('matrix-sub-headers') || table.querySelector('thead tr:nth-child(2)');
            if (subHeaderRow && subHeaderRow.cells.length >= subThOffset + span) {
              const fromSubRow = [];
              for (let s = 0; s < span; s++) {
                const subTh = subHeaderRow.cells[subThOffset + s];
                if (subTh && subTh.textContent.trim()) {
                  fromSubRow.push(subTh.textContent.trim());
                }
              }
              if (fromSubRow.length >= 2) return fromSubRow;
            }
          }
          break;
        }

        if (span > 1) {
          subThOffset += span;
        }
      }
    }
  }

  return [];
};

window.handleSplitColumnSelectionChange = function(colVal) {
  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
  if (!colVal) {
    initSplitSubColumnsList(null, 2);
    return;
  }

  const existingSubCols = window.getExistingSubColumnsForColumn(colVal);
  if (Array.isArray(existingSubCols) && existingSubCols.length >= 2) {
    if (countInput) countInput.value = existingSubCols.length;
    initSplitSubColumnsList(existingSubCols, existingSubCols.length);
  } else {
    const defaultCount = countInput ? (parseInt(countInput.value, 10) || 2) : 2;
    initSplitSubColumnsList(null, defaultCount);
  }
};

window.openSplitColumnModal = function(preSelectedKey) {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot split columns.`, 'info');
    return;
  }
  const eligibleCols = (window.activeDataColumns || []).filter(c => !c.parent_column_id);
  if (eligibleCols.length === 0) {
    showToast('No columns available to split. Please add a column first.', 'warning');
    if (typeof openAddColumnModal === 'function') {
      setTimeout(() => openAddColumnModal(), 200);
    }
    return;
  }
  populateColumnSplittingSelect(preSelectedKey);
  const sel = document.getElementById('split-parent-col-select') || document.getElementById('split-target-col-select');
  const targetVal = (sel && sel.value) ? sel.value : preSelectedKey;
  window.handleSplitColumnSelectionChange(targetVal);
  openModal('split-column-modal');
};

let currentSplitSubCols = ['Sub 1', 'Sub 2'];

window.handleSplitCountChange = function(val) {
  let count = parseInt(val, 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 10) count = 10;
  
  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
  if (countInput && parseInt(countInput.value, 10) !== count) {
    countInput.value = count;
  }

  // Adjust currentSplitSubCols array size while retaining existing sub-columns
  while (currentSplitSubCols.length < count) {
    currentSplitSubCols.push(`Sub ${currentSplitSubCols.length + 1}`);
  }
  if (currentSplitSubCols.length > count) {
    currentSplitSubCols = currentSplitSubCols.slice(0, count);
  }
  renderSplitSubColumnsRows();
};

function initSplitSubColumnsList(customList, targetCount = 2) {
  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
  if (Array.isArray(customList) && customList.length >= 1) {
    currentSplitSubCols = [...customList];
    if (countInput) countInput.value = currentSplitSubCols.length;
  } else {
    const c = Math.max(1, Math.min(10, parseInt(targetCount, 10) || 2));
    if (countInput) countInput.value = c;
    currentSplitSubCols = Array.from({ length: c }, (_, i) => `Sub ${i + 1}`);
  }
  renderSplitSubColumnsRows();
}

function renderSplitSubColumnsRows() {
  const container = document.getElementById('split-subcols-list');
  if (!container) return;
  container.innerHTML = '';

  const submitBtn = document.getElementById('btn-submit-split-col');
  if (submitBtn) {
    if (currentSplitSubCols.length <= 1) {
      submitBtn.textContent = 'Unsplit to Single Column';
    } else {
      submitBtn.textContent = `Split Column (${currentSplitSubCols.length} Sub-Cols)`;
    }
  }

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
    input.placeholder = `Sub ${idx + 1} Name`;
    input.value = val || `Sub ${idx + 1}`;
    input.oninput = (e) => {
      currentSplitSubCols[idx] = e.target.value;
    };
    row.appendChild(input);

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
      const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
      if (countInput) countInput.value = currentSplitSubCols.length;
      renderSplitSubColumnsRows();
    };
    row.appendChild(delBtn);

    container.appendChild(row);
  });

  if (currentSplitSubCols.length <= 1) {
    const hint = document.createElement('div');
    hint.style.fontSize = '0.76rem';
    hint.style.color = 'var(--accent-amber)';
    hint.style.marginTop = '0.25rem';
    hint.style.fontStyle = 'italic';
    hint.textContent = currentSplitSubCols.length === 0
      ? '💡 0 sub-columns remaining: submitting will unsplit/collapse this column back into a single column.'
      : '💡 1 sub-column selected: submitting will unsplit/collapse this column back into a single column.';
    container.appendChild(hint);
  }
}

function addAnotherSplitSubColumn() {
  if (currentSplitSubCols.length >= 10) {
    showToast('Maximum 10 sub-columns allowed', 'info');
    return;
  }
  currentSplitSubCols.push(`Sub ${currentSplitSubCols.length + 1}`);
  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
  if (countInput) countInput.value = currentSplitSubCols.length;
  renderSplitSubColumnsRows();
}

function populateColumnSplittingSelect(preSelectedKey) {
  const sel = document.getElementById('split-parent-col-select') || document.getElementById('split-target-col-select');
  const emptyNotice = document.getElementById('split-col-empty-state');
  const formContent = document.getElementById('split-col-form-content');

  const eligibleCols = (window.activeDataColumns || []).filter(c => !c.parent_column_id);

  if (emptyNotice && formContent) {
    if (eligibleCols.length === 0) {
      emptyNotice.style.display = 'block';
      formContent.style.display = 'none';
    } else {
      emptyNotice.style.display = 'none';
      formContent.style.display = 'block';
    }
  }

  if (!sel) return;
  sel.innerHTML = '<option value="">-- Choose Column to Split --</option>';

  eligibleCols.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id || c.name;
    opt.setAttribute('data-col-name', c.name || c.column_name);
    opt.setAttribute('data-col-id', c.id || '');
    opt.textContent = c.name || c.column_name;
    sel.appendChild(opt);
  });

  if (preSelectedKey) {
    const cleanKey = String(preSelectedKey).replace(/^dyn_/, '').toLowerCase();
    const match = eligibleCols.find(c => 
      String(c.id) === String(preSelectedKey) || 
      (c.name && c.name.toLowerCase() === cleanKey) ||
      (c.key && c.key.toLowerCase() === String(preSelectedKey).toLowerCase())
    );
    if (match) {
      sel.value = match.id || match.name;
    }
  }
}

/**
 * Executes direct DOM manipulation to split, resize, or unsplit a column in the Master Matrix table.
 * Supports splitting unsplit columns, re-sizing sub-columns (adding/removing), or collapsing (count === 1).
 */
window.splitMatrixColumnDOM = function(selectedColIdentifier, splitCount, subColumnNames) {
  const table = document.getElementById('matrix-table');
  if (!table) return false;

  const thead = table.querySelector('thead') || document.getElementById('matrix-thead');
  const tbody = table.querySelector('tbody') || document.getElementById('matrix-tbody');
  if (!thead || !tbody) return false;

  const mainHeaderRow = thead.querySelector('tr:first-child');
  if (!mainHeaderRow) return false;

  const count = Math.max(1, parseInt(splitCount, 10) || 1);
  const subCols = (Array.isArray(subColumnNames) && subColumnNames.length >= count)
    ? subColumnNames.slice(0, count)
    : Array.from({ length: count }, (_, i) => (subColumnNames && subColumnNames[i]) || `Sub ${i + 1}`);

  // 1. Identify target <th> in mainHeaderRow
  let targetTh = null;
  let targetColIndex = -1;
  const idStr = String(selectedColIdentifier || '').trim().toLowerCase();
  const cleanIdStr = idStr.replace(/^dyn_/, '');

  for (let i = 0; i < mainHeaderRow.cells.length; i++) {
    const th = mainHeaderRow.cells[i];
    const thKey = (th.getAttribute('data-col-key') || '').toLowerCase();
    const thId = (th.getAttribute('data-col-id') || '').toLowerCase();
    const thName = (th.getAttribute('data-col-name') || th.querySelector('.col-title-text')?.textContent || '').trim().toLowerCase();

    if (thKey === idStr || thKey === `dyn_${cleanIdStr}` || thId === idStr || thName === idStr || thName === cleanIdStr) {
      targetTh = th;
      targetColIndex = i;
      break;
    }
  }

  if (!targetTh) {
    console.warn('splitMatrixColumnDOM: Could not find <th> for', selectedColIdentifier);
    return false;
  }

  // Record previous colSpan (if column was already split)
  const oldSpan = parseInt(targetTh.colSpan, 10) || 1;

  // 2. Calculate exact cell index in <tbody> by summing colSpan of all preceding <th>
  let targetCellIndex = 0;
  for (let i = 0; i < targetColIndex; i++) {
    targetCellIndex += (parseInt(mainHeaderRow.cells[i].colSpan, 10) || 1);
  }

  const colKey = targetTh.getAttribute('data-col-key') || `dyn_${selectedColIdentifier}`;
  const colName = targetTh.getAttribute('data-col-name') || targetTh.querySelector('.col-title-text')?.textContent?.trim() || selectedColIdentifier;
  const colId = targetTh.getAttribute('data-col-id') || '';

  // CASE 1: Unsplit / Collapse to single column (count === 1)
  if (count === 1) {
    targetTh.colSpan = 1;
    targetTh.setAttribute('data-is-split', 'false');
    targetTh.style.width = '200px';
    targetTh.style.minWidth = '200px';
    targetTh.style.maxWidth = '200px';

    // Clear sub-column datasets
    Object.keys(targetTh.dataset).forEach(k => {
      if (k.startsWith('subName')) delete targetTh.dataset[k];
    });

    const badge = targetTh.querySelector('.col-split-header-badge');
    if (badge) badge.remove();

    // In tbody: replace oldSpan cells with 1 single <td> cell
    Array.from(tbody.rows).forEach(row => {
      if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;

      const oldCells = [];
      for (let s = 0; s < oldSpan; s++) {
        const td = row.cells[targetCellIndex + s];
        if (td) oldCells.push(td);
      }

      if (oldCells.length > 0) {
        const refTd = oldCells[0];
        const paperId = refTd.getAttribute('data-paper-id') || row.getAttribute('data-paper-id');
        const oldRaw = refTd.getAttribute('data-raw-val') || refTd.textContent || '';

        const newTd = document.createElement('td');
        newTd.className = 'editable-cell';
        newTd.style.width = '200px';
        newTd.style.minWidth = '200px';
        newTd.style.maxWidth = '200px';
        newTd.style.overflow = 'hidden';
        newTd.setAttribute('data-col-key', colKey);
        newTd.setAttribute('data-col-name', colName);
        if (colId) newTd.setAttribute('data-col-id', colId);
        if (paperId) newTd.setAttribute('data-paper-id', paperId);
        newTd.setAttribute('data-raw-val', oldRaw.trim() && oldRaw !== '-' ? oldRaw : '');
        newTd.innerHTML = oldRaw.trim() && oldRaw !== '-' ? refTd.innerHTML : '<span style="color: var(--text-tertiary); font-style: italic;">-</span>';

        if (typeof window.makeCellEditable === 'function') {
          window.makeCellEditable(newTd, 'dynamic', paperId, true, colId, colName);
        }

        row.insertBefore(newTd, refTd);
        oldCells.forEach(td => {
          if (td.parentNode === row) row.removeChild(td);
        });
      }
    });

    // Check if any other columns still have colSpan > 1
    const hasRemainingSplit = Array.from(mainHeaderRow.cells).some(th => (parseInt(th.colSpan, 10) || 1) > 1);
    let subHeaderRow = document.getElementById('matrix-sub-headers') || thead.querySelector('tr:nth-child(2)');

    if (!hasRemainingSplit) {
      if (subHeaderRow) subHeaderRow.remove();
      Array.from(mainHeaderRow.cells).forEach(th => {
        th.rowSpan = 1;
      });
    } else {
      targetTh.rowSpan = 2;
      if (subHeaderRow) {
        subHeaderRow.innerHTML = '';
        Array.from(mainHeaderRow.cells).forEach(th => {
          const span = parseInt(th.colSpan, 10) || 1;
          if (span > 1) {
            const pName = (th.getAttribute('data-col-name') || th.querySelector('.col-title-text')?.textContent || '').trim();
            const pKey = th.getAttribute('data-col-key') || '';
            for (let i = 1; i <= span; i++) {
              const subTh = document.createElement('th');
              subTh.className = 'matrix-sub-th';
              subTh.style.width = '140px';
              subTh.style.minWidth = '140px';
              const sName = th.dataset[`subName${i}`] || `Sub ${i}`;
              subTh.textContent = sName;
              subTh.title = `${pName} → ${sName}`;
              subHeaderRow.appendChild(subTh);
            }
          }
        });
      }
    }

    return true;
  }

  // CASE 2: Split or Resize Sub-Columns (count >= 2)
  // 3. Ensure sub-header row exists below main headers
  let subHeaderRow = document.getElementById('matrix-sub-headers') || thead.querySelector('tr:nth-child(2)');
  if (!subHeaderRow) {
    Array.from(mainHeaderRow.cells).forEach(th => {
      if (th !== targetTh) {
        th.rowSpan = 2;
      }
    });
    subHeaderRow = document.createElement('tr');
    subHeaderRow.id = 'matrix-sub-headers';
    subHeaderRow.className = 'matrix-sub-header-row';
    thead.appendChild(subHeaderRow);
  }

  // 4. Update target <th> attributes
  targetTh.rowSpan = 1;
  targetTh.colSpan = count;
  targetTh.setAttribute('data-is-split', 'true');
  targetTh.style.width = (count * 140) + 'px';
  targetTh.style.minWidth = (count * 140) + 'px';
  targetTh.style.maxWidth = 'none';

  // Store sub-column names on dataset
  // First clear old sub names
  Object.keys(targetTh.dataset).forEach(k => {
    if (k.startsWith('subName')) delete targetTh.dataset[k];
  });
  subCols.forEach((name, i) => {
    targetTh.dataset[`subName${i + 1}`] = name;
  });

  // 5. Rebuild the sub-header row across all split headers in horizontal order
  subHeaderRow.innerHTML = '';
  Array.from(mainHeaderRow.cells).forEach(th => {
    const span = parseInt(th.colSpan, 10) || 1;
    if (span > 1) {
      const parentName = (th.getAttribute('data-col-name') || th.querySelector('.col-title-text')?.textContent || '').trim();
      for (let i = 1; i <= span; i++) {
        const subTh = document.createElement('th');
        subTh.className = 'matrix-sub-th';
        subTh.style.width = '140px';
        subTh.style.minWidth = '140px';
        const sName = (th === targetTh && subCols[i - 1]) 
          ? subCols[i - 1] 
          : (th.dataset[`subName${i}`] || `Sub ${i}`);
        subTh.textContent = sName;
        subTh.title = `${parentName} → ${sName}`;
        subHeaderRow.appendChild(subTh);
      }
    }
  });

  // 6. Loop through every row in <tbody>, replace oldSpan cells with new count sub-cells
  Array.from(tbody.rows).forEach(row => {
    if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;

    const oldCells = [];
    for (let s = 0; s < oldSpan; s++) {
      const td = row.cells[targetCellIndex + s];
      if (td) oldCells.push(td);
    }

    if (oldCells.length > 0) {
      const refTd = oldCells[0];
      const paperId = refTd.getAttribute('data-paper-id') || row.getAttribute('data-paper-id');

      // Create count new <td> elements
      for (let i = 1; i <= count; i++) {
        const subName = subCols[i - 1] || `Sub ${i}`;
        const fullSubColName = `${colName}(${subName})`;
        const existingOldTd = oldCells[i - 1];

        const newTd = document.createElement('td');
        newTd.className = 'editable-cell';
        newTd.style.width = '140px';
        newTd.style.minWidth = '140px';
        newTd.style.maxWidth = '200px';
        newTd.setAttribute('data-col-key', colKey);
        newTd.setAttribute('data-col-name', fullSubColName);
        if (colId) newTd.setAttribute('data-col-id', colId);
        if (paperId) newTd.setAttribute('data-paper-id', paperId);
        newTd.setAttribute('data-subcol-index', i);
        newTd.setAttribute('data-subcol-name', subName);

        if (existingOldTd) {
          const oldRaw = existingOldTd.getAttribute('data-raw-val') || existingOldTd.textContent || '';
          if (oldRaw.trim() && oldRaw !== '-') {
            newTd.setAttribute('data-raw-val', oldRaw);
            newTd.innerHTML = existingOldTd.innerHTML;
            if (!newTd.textContent) newTd.textContent = oldRaw;
          } else {
            newTd.setAttribute('data-raw-val', '');
            newTd.innerHTML = '<span style="color: var(--text-tertiary); font-style: italic;">-</span>';
            if (!newTd.textContent) newTd.textContent = '-';
          }
        } else {
          newTd.setAttribute('data-raw-val', '');
          newTd.innerHTML = '<span style="color: var(--text-tertiary); font-style: italic;">-</span>';
          if (!newTd.textContent) newTd.textContent = '-';
        }

        if (typeof window.makeCellEditable === 'function') {
          window.makeCellEditable(newTd, 'dynamic', paperId, true, colId, fullSubColName);
        }

        row.insertBefore(newTd, refTd);
      }

      // Remove all previous oldSpan cells
      oldCells.forEach(oldTd => {
        if (oldTd.parentNode === row) row.removeChild(oldTd);
      });
    }
  });

  return true;
};

/**
 * Quick Action: Appends 1 sub-column to a column
 */
window.quickAddSubColumn = async function(colIdentifier, customSubName, event) {
  if (event) {
    event.stopPropagation();
    if (typeof window.closeAllColumnMenus === 'function') window.closeAllColumnMenus();
  }
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot add sub-columns.`, 'info');
    return;
  }
  const existing = window.getExistingSubColumnsForColumn(colIdentifier) || [];
  let newSubs = [];
  if (existing.length === 0) {
    newSubs = ['Sub 1', 'Sub 2'];
  } else {
    newSubs = [...existing, customSubName || `Sub ${existing.length + 1}`];
  }

  // Update DOM immediately
  window.splitMatrixColumnDOM(colIdentifier, newSubs.length, newSubs);
  showToast(`Sub-column added: ${newSubs[newSubs.length - 1]}`, 'success');

  // Sync with Backend
  try {
    const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
    const clustId = (window.currentClusterId && window.currentClusterId !== 'all') ? window.currentClusterId : null;
    await fetch('/api/dynamic-columns/split', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        project_id: projId,
        cluster_id: clustId,
        parent_column_name: String(colIdentifier).replace(/^dyn_/, ''),
        sub_columns: newSubs
      })
    });
    if (typeof loadDynamicColumns === 'function') loadDynamicColumns();
  } catch (e) {
    console.warn('quickAddSubColumn backend sync error:', e);
  }
};

/**
 * Quick Action: Removes 1 sub-column from a column
 */
window.quickRemoveSubColumn = async function(colIdentifier, subNameOrIndex, event) {
  if (event) {
    event.stopPropagation();
    if (typeof window.closeAllColumnMenus === 'function') window.closeAllColumnMenus();
  }
  const existing = window.getExistingSubColumnsForColumn(colIdentifier) || [];
  if (existing.length === 0) return;

  let remaining = [];
  if (typeof subNameOrIndex === 'number') {
    remaining = existing.filter((_, idx) => idx !== (subNameOrIndex - 1) && idx !== subNameOrIndex);
  } else {
    const matchName = String(subNameOrIndex).trim().toLowerCase();
    remaining = existing.filter(s => s.toLowerCase() !== matchName);
  }

  if (remaining.length >= 2) {
    window.splitMatrixColumnDOM(colIdentifier, remaining.length, remaining);
    showToast(`Sub-column removed. (${remaining.length} sub-columns remaining)`, 'info');

    // Sync with Backend
    try {
      const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
      const clustId = (window.currentClusterId && window.currentClusterId !== 'all') ? window.currentClusterId : null;
      await fetch('/api/dynamic-columns/split', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          project_id: projId,
          cluster_id: clustId,
          parent_column_name: String(colIdentifier).replace(/^dyn_/, ''),
          sub_columns: remaining
        })
      });
      if (typeof loadDynamicColumns === 'function') loadDynamicColumns();
    } catch (e) {
      console.warn('quickRemoveSubColumn backend sync error:', e);
    }
  } else {
    // Collapse / Unsplit back to single column
    window.unsplitMatrixColumn(colIdentifier);
  }
};

/**
 * Unsplits / collapses a column back to a single standard column
 */
window.unsplitMatrixColumn = async function(selectedColIdentifier, event, customColName = null, customColId = null) {
  if (event) {
    event.stopPropagation();
    if (typeof window.closeAllColumnMenus === 'function') window.closeAllColumnMenus();
  }

  // Find column name and ID from activeDataColumns or DOM
  const idStr = String(selectedColIdentifier || '').trim();
  const cleanIdStr = idStr.replace(/^dyn_/, '');
  const foundCol = (window.activeDataColumns || []).find(c => 
    String(c.id) === idStr || 
    String(c.id) === cleanIdStr ||
    (c.name && c.name.toLowerCase() === idStr.toLowerCase()) ||
    (c.name && c.name.toLowerCase() === cleanIdStr.toLowerCase()) ||
    (c.key && c.key.toLowerCase() === idStr.toLowerCase())
  );

  const colId = customColId || (foundCol ? foundCol.id : (!isNaN(parseInt(idStr, 10)) ? parseInt(idStr, 10) : null));
  const colName = customColName || (foundCol ? (foundCol.name || foundCol.column_name) : cleanIdStr);

  // 1. Update in-memory activeDataColumns so any immediate re-render treats column as single
  if (foundCol) {
    foundCol.col_type = 'text';
    delete foundCol.sub_columns;
  }
  if (Array.isArray(window.activeDataColumns)) {
    window.activeDataColumns = window.activeDataColumns.filter(c => {
      if (c.parent_column_id && (String(c.parent_column_id) === String(colId) || (c.parent_column_name && c.parent_column_name.toLowerCase() === colName.toLowerCase()))) {
        return false;
      }
      return true;
    });
  }

  // 2. Perform instantaneous client-side DOM unsplit
  const domSuccess = window.splitMatrixColumnDOM(selectedColIdentifier || colName, 1, []);
  showToast(`Column "${colName}" unsplit to single column`, 'info');

  // 3. Sync with Backend
  try {
    const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 1;
    const clustId = (window.currentClusterId && window.currentClusterId !== 'all') ? window.currentClusterId : null;
    const res = await fetch('/api/dynamic-columns/unsplit', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        project_id: projId,
        cluster_id: clustId,
        parent_column_id: colId ? parseInt(colId, 10) : null,
        parent_column_name: colName || cleanIdStr
      })
    });

    if (res.ok) {
      if (typeof loadDynamicColumns === 'function') await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof populateSearchColumnDropdown === 'function') populateSearchColumnDropdown();
    }
  } catch (e) {
    console.warn('unsplitMatrixColumn backend error:', e);
  }
};

window.submitSplitColumn = async function(e) {
  if (e) e.preventDefault();
  const targetColSel = document.getElementById('split-parent-col-select') || document.getElementById('split-target-col-select');

  const selectedOpt = targetColSel ? targetColSel.options[targetColSel.selectedIndex] : null;
  const colVal = targetColSel ? targetColSel.value : '';
  const colName = selectedOpt ? (selectedOpt.getAttribute('data-col-name') || selectedOpt.textContent) : '';
  const colId = selectedOpt ? selectedOpt.getAttribute('data-col-id') : null;

  if (!colVal && !colName) {
    showToast('Please select a target column to split', 'warning');
    return;
  }

  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');
  let splitCount = countInput ? (parseInt(countInput.value, 10) || 1) : 1;

  // Gather sub-columns from dynamic inputs
  const inputs = document.querySelectorAll('.split-subcol-input');
  const sub_columns = [];
  inputs.forEach((inp, idx) => {
    const v = inp.value.trim();
    if (v) sub_columns.push(v);
  });

  if (splitCount <= 1 || sub_columns.length <= 1) {
    // User requested unsplit / single column
    closeModal('split-column-modal');
    return window.unsplitMatrixColumn(colId || colVal || colName, null, colName, colId);
  }

  while (sub_columns.length < splitCount) {
    sub_columns.push(`Sub ${sub_columns.length + 1}`);
  }

  // 1. Perform instantaneous client-side DOM split with calculated cell indexing
  const domSuccess = window.splitMatrixColumnDOM(colVal || colName, sub_columns.length, sub_columns);

  const submitBtn = document.getElementById('btn-submit-split-col');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating Columns...';
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
        parent_column_id: colId ? parseInt(colId, 10) : (!isNaN(parseInt(colVal, 10)) ? parseInt(colVal, 10) : null),
        parent_column_name: colName || colVal,
        sub_columns
      })
    });

    if (res.ok) {
      closeModal('split-column-modal');
      showToast(`Column "${colName || colVal}" successfully updated (${sub_columns.length} sub-columns)!`, 'success');
      await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof populateSearchColumnDropdown === 'function') populateSearchColumnDropdown();
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to split column on server');
    }
  } catch (err) {
    console.warn('Split Column error:', err);
    if (!domSuccess) {
      showToast('Failed to split column: ' + err.message, 'error');
    } else {
      closeModal('split-column-modal');
      showToast(`Column "${colName || colVal}" updated with ${sub_columns.length} sub-columns`, 'success');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Split Column';
    }
  }
};

// Bind split column modal controls
document.addEventListener('DOMContentLoaded', () => {
  const btnClose = document.getElementById('btn-close-split-col');
  const btnCancel = document.getElementById('btn-cancel-split-col');
  const btnSubmit = document.getElementById('btn-submit-split-col');
  const btnAddMore = document.getElementById('btn-add-more-subcol');
  const countInput = document.getElementById('split-count-input') || document.getElementById('splitCount');

  if (btnClose) btnClose.onclick = () => closeModal('split-column-modal');
  if (btnCancel) btnCancel.onclick = () => closeModal('split-column-modal');
  if (btnSubmit) btnSubmit.onclick = (e) => window.submitSplitColumn(e);
  if (btnAddMore) {
    btnAddMore.onclick = () => addAnotherSplitSubColumn();
  }
  if (countInput) {
    countInput.oninput = (e) => window.handleSplitCountChange(e.target.value);
    countInput.onchange = (e) => window.handleSplitCountChange(e.target.value);
  }

  const btnOpenSplit = document.getElementById('btn-split-dyn-col') || document.getElementById('matrix-btn-split-col');
  if (btnOpenSplit) {
    btnOpenSplit.onclick = () => window.openSplitColumnModal();
  }

  if (typeof window.updateMatrixColumnButtonStates === 'function') {
    window.updateMatrixColumnButtonStates();
  }
});
