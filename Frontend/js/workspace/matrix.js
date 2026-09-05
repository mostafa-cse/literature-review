/**
 * LITSPHERE MASTER MATRIX TABLE ENGINE
 * Renders Excel-like interactive data matrix, hierarchical table headers, inline editable cells,
 * and column operations (reorder, move left/right/leftmost/rightmost, drag & drop, rename, delete).
 */

window.triggerMath = function(container) {
  try {
    const target = (container && container.nodeType) ? container : (document.getElementById('matrix-table') || document.body);
    if (!target) return;
    if (window.renderMathInElement) {
      window.renderMathInElement(target, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    } else if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([target]).catch(err => {
        console.warn('MathJax typeset warning:', err);
      });
    }
  } catch (err) {
    console.warn('Math rendering safe catch:', err);
  }
};

window.siSortOrder = 'asc';

window.toggleSortSI = function(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  window.siSortOrder = (window.siSortOrder === 'asc') ? 'desc' : 'asc';
  if (typeof applyFilters === 'function') {
    applyFilters();
  } else if (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) {
    window.renderMasterMatrix(allPapers);
  }
};

/**
 * Returns the active list of customizable columns in user-defined order.
 * Default arrangement places Paper Metadata columns first:
 * Paper ID, Title (frozen) followed by Authors, Year, Venue, DOI / Link, Cluster, Domain, Reading Status,
/**
 * Column View Mode (All Columns vs Custom Columns Only vs Metadata Only)
 */
window.getMatrixColumnViewMode = function() {
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 'default';
  const modeKey = 'matrix_col_view_mode_' + projId;
  return localStorage.getItem(modeKey) || 'all';
};

window.setMatrixColumnViewMode = function(mode) {
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 'default';
  const modeKey = 'matrix_col_view_mode_' + projId;
  localStorage.setItem(modeKey, mode);

  // Sync toolbar controls
  window.syncMatrixColumnViewControls();

  // Re-render matrix
  if (typeof applyFilters === 'function') {
    applyFilters();
  } else if (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) {
    window.renderMasterMatrix(allPapers);
  }

  let toastMsg = 'Showing all columns';
  if (mode === 'custom') toastMsg = 'Hiding metadata columns • Showing custom columns only';
  else if (mode === 'custom_pure') toastMsg = 'Showing pure custom columns only (metadata & title hidden)';
  else if (mode === 'metadata') toastMsg = 'Showing metadata columns only';

  if (typeof showToast === 'function') showToast(toastMsg, 'info');
};

window.toggleMetadataColumnsVisibility = function() {
  const currentMode = window.getMatrixColumnViewMode();
  const nextMode = (currentMode === 'custom' || currentMode === 'custom_pure') ? 'all' : 'custom';
  window.setMatrixColumnViewMode(nextMode);
};

window.syncMatrixColumnViewControls = function() {
  const mode = window.getMatrixColumnViewMode();
  const selectEl = document.getElementById('matrix-column-view-select');
  if (selectEl) {
    selectEl.value = mode;
    selectEl.classList.toggle('active-custom-filter', mode === 'custom' || mode === 'custom_pure');
  }

  const btnEl = document.getElementById('btn-toggle-metadata-visibility');
  const btnLabel = document.getElementById('metadata-toggle-btn-label');
  if (btnEl && btnLabel) {
    const isCustom = (mode === 'custom' || mode === 'custom_pure');
    btnEl.classList.toggle('active', isCustom);
    btnLabel.textContent = isCustom ? 'Show All Columns' : 'Show Custom Only';
    btnEl.title = isCustom 
      ? 'Currently showing Custom Columns Only. Click to show All Columns.' 
      : 'Currently showing All Columns. Click to hide metadata and show custom columns only.';
  }
};

/**
 * Returns ordered columns list for matrix rendering.
 * Initial arrangement follows Paper Metadata first:
 * Paper ID, Title (frozen sticky columns 1 & 2),
 * Authors, Year, Venue, DOI / Link, Cluster, Domain, Reading Status,
 * then Advantages, Criticism, Future Research Direction, Keywords, and dynamic columns.
 */
window.getOrderedColumnsList = function() {
  const baseCols = [
    { key: 'authors', name: 'Authors', isBase: true, group: 'Paper Metadata' },
    { key: 'year', name: 'Year', isBase: true, group: 'Paper Metadata' },
    { key: 'pub', name: 'Venue', isBase: true, group: 'Paper Metadata' },
    { key: 'doi', name: 'DOI / Link', isBase: true, group: 'Paper Metadata' },
    { key: 'cluster', name: 'Cluster', isBase: true, group: 'Paper Metadata' },
    { key: 'domain', name: 'Domain', isBase: true, group: 'Taxonomy & Classification' },
    { key: 'status', name: 'Reading Status', isBase: true, group: 'Paper Metadata' },
    { key: 'advantages', name: 'Advantages', isBase: true, group: 'Synthesis & Insights' },
    { key: 'criticism', name: 'Criticism', isBase: true, group: 'Synthesis & Insights' },
    { key: 'future_directions', name: 'Future Research Direction', isBase: true, group: 'Synthesis & Insights' },
    { key: 'keywords', name: 'Keywords', isBase: true, group: 'Taxonomy & Classification' }
  ];

  const rawCols = window.activeDataColumns || window.activeClusterColumns || [];
  const seenNames = new Set();
  const dynCols = [];
  rawCols.forEach(col => {
    if (col.parent_column_id) return; // Sub-columns are rendered hierarchically inside their parent column
    const cName = (col.name || col.column_name || '').trim();
    if (cName && !seenNames.has(cName.toLowerCase())) {
      seenNames.add(cName.toLowerCase());
      dynCols.push({
        key: 'dyn_' + cName,
        name: cName,
        id: col.id,
        isDynamic: true,
        group: 'Custom Columns',
        parent_column_id: col.parent_column_id,
        parent_column_name: col.parent_column_name,
        col_type: col.col_type
      });
    }
  });

  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 'default';
  const storageKey = 'matrix_col_order_' + projId;
  const aliasKey = 'matrix_col_aliases_' + projId;
  const hiddenKey = 'matrix_hidden_cols_' + projId;

  let aliases = {};
  let hiddenCols = [];
  try {
    aliases = JSON.parse(localStorage.getItem(aliasKey) || '{}');
    hiddenCols = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
  } catch (e) {
    console.warn('Error reading column preferences:', e);
  }

  // Ensure essential taxonomy columns 'domain' and 'keywords' are never suppressed by stale hiddenCols
  if (Array.isArray(hiddenCols) && (hiddenCols.includes('domain') || hiddenCols.includes('keywords'))) {
    hiddenCols = hiddenCols.filter(k => k !== 'domain' && k !== 'keywords');
    try {
      localStorage.setItem(hiddenKey, JSON.stringify(hiddenCols));
    } catch (e) {}
  }

  baseCols.forEach(bc => {
    if (aliases[bc.key]) bc.name = aliases[bc.key];
  });

  // Filter columns based on active column view mode
  const mode = window.getMatrixColumnViewMode();
  let filteredBaseCols = baseCols.filter(c => !hiddenCols.includes(c.key));
  let filteredDynCols = dynCols;

  // Suppress duplicate base columns when exact dynamic columns exist
  const hasDynStrengths = dynCols.some(c => c.name && c.name.toLowerCase() === 'strengths');
  if (hasDynStrengths) {
    filteredBaseCols = filteredBaseCols.filter(c => c.key !== 'advantages');
  }
  const hasDynCriticism = dynCols.some(c => c.name && (c.name.toLowerCase().includes('criticism') || c.name.toLowerCase().includes('limitation')));
  if (hasDynCriticism) {
    filteredBaseCols = filteredBaseCols.filter(c => c.key !== 'criticism');
  }
  const hasDynFuture = dynCols.some(c => c.name && c.name.toLowerCase().includes('future'));
  if (hasDynFuture) {
    filteredBaseCols = filteredBaseCols.filter(c => c.key !== 'future_directions');
  }
  // Paper ID is rendered as Frozen Column 1, so suppress duplicate dyn_Paper ID from scrollable body
  filteredDynCols = filteredDynCols.filter(c => c.name && c.name.toLowerCase() !== 'paper id');

  if (mode === 'custom' || mode === 'custom_pure') {
    // Hide default administrative metadata columns, but ALWAYS preserve core taxonomy & synthesis columns:
    // Domain, Keywords, Cluster, Advantages, Criticism, Future Directions
    filteredBaseCols = filteredBaseCols.filter(c => 
      c.group !== 'Paper Metadata' || c.key === 'domain' || c.key === 'keywords' || c.key === 'cluster'
    );
  } else if (mode === 'metadata') {
    // Ensure metadata mode preserves core metadata as well as taxonomy classifications (domain, keywords)
    filteredBaseCols = filteredBaseCols.filter(c => 
      c.group === 'Paper Metadata' || c.key === 'domain' || c.key === 'keywords'
    );
    filteredDynCols = [];
  }

  const combined = [...filteredBaseCols, ...filteredDynCols];
  
  let savedOrder = null;
  try {
    savedOrder = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(savedOrder)) {
      // If any standard column is missing from savedOrder (e.g. legacy order missing domain, keywords, doi, status),
      // insert it into savedOrder in its natural sequence next to adjacent base columns
      // so it never gets index -1 and pushed behind 30+ dynamic columns!
      let orderUpdated = false;
      const naturalOrder = ['authors', 'year', 'pub', 'doi', 'cluster', 'domain', 'status', 'advantages', 'criticism', 'future_directions', 'keywords'];
      
      naturalOrder.forEach(k => {
        if (!savedOrder.includes(k)) {
          orderUpdated = true;
          const natIdx = naturalOrder.indexOf(k);
          let placed = false;
          // Look backwards for a predecessor already in savedOrder
          for (let p = natIdx - 1; p >= 0; p--) {
            const prev = naturalOrder[p];
            const pIdx = savedOrder.indexOf(prev);
            if (pIdx !== -1) {
              savedOrder.splice(pIdx + 1, 0, k);
              placed = true;
              break;
            }
          }
          if (!placed) {
            // Look forwards for a successor already in savedOrder
            for (let n = natIdx + 1; n < naturalOrder.length; n++) {
              const next = naturalOrder[n];
              const nIdx = savedOrder.indexOf(next);
              if (nIdx !== -1) {
                savedOrder.splice(nIdx, 0, k);
                placed = true;
                break;
              }
            }
          }
          if (!placed) {
            savedOrder.unshift(k);
          }
        }
      });

      if (orderUpdated) {
        localStorage.setItem(storageKey, JSON.stringify(savedOrder));
      }
    }
  } catch (e) {
    console.warn('Error parsing saved column order:', e);
  }

  if (Array.isArray(savedOrder) && savedOrder.length > 0) {
    combined.sort((a, b) => {
      const idxA = savedOrder.indexOf(a.key);
      const idxB = savedOrder.indexOf(b.key);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  }

  return combined;
};

/**
 * Saves column order to localStorage
 */
window.saveOrderedColumnsList = function(cols) {
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 'default';
  const storageKey = 'matrix_col_order_' + projId;
  localStorage.setItem(storageKey, JSON.stringify(cols.map(c => c.key)));
};

/**
 * Resets matrix column order back to default Paper Metadata sequence
 */
window.resetMatrixColumnOrder = function() {
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : 'default';
  const storageKey = 'matrix_col_order_' + projId;
  localStorage.removeItem(storageKey);
  if (typeof applyFilters === 'function') {
    applyFilters();
  } else if (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) {
    window.renderMasterMatrix(allPapers);
  }
  showToast('Matrix column layout reset to default Paper Metadata order', 'info');
};

/**
 * Move a column left, leftmost, right, or rightmost
 */
window.moveColumn = function(key, direction, event) {
  if (event) {
    event.stopPropagation();
    closeAllColumnMenus();
  }
  const cols = window.getOrderedColumnsList();
  const idx = cols.findIndex(c => c.key === key);
  if (idx === -1) return;

  const item = cols.splice(idx, 1)[0];
  if (direction === 'leftmost') {
    cols.unshift(item);
  } else if (direction === 'left') {
    const targetIdx = Math.max(0, idx - 1);
    cols.splice(targetIdx, 0, item);
  } else if (direction === 'right') {
    const targetIdx = Math.min(cols.length, idx + 1);
    cols.splice(targetIdx, 0, item);
  } else if (direction === 'rightmost') {
    cols.push(item);
  }

  window.saveOrderedColumnsList(cols);
  if (typeof applyFilters === 'function') {
    applyFilters();
  } else if (typeof allPapers !== 'undefined') {
    window.renderMasterMatrix(allPapers);
  }
  showToast(`Column moved ${direction}`, 'info');
};

/**
 * Drag & Drop Column Reordering Handlers (Supports standard & split columns)
 */
let draggedColKey = null;
window.handleColDragStart = function(event, key) {
  if (event.target && event.target.closest('.col-title-text, .col-menu-dropdown-wrapper')) {
    event.preventDefault();
    return false;
  }
  draggedColKey = key;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  }
  const th = event.currentTarget.closest('th');
  if (th) th.classList.add('col-dragging');
};

window.handleColDragOver = function(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
};

window.handleColDragEnter = function(event, th) {
  if (th && !th.classList.contains('col-dragging')) {
    th.classList.add('col-drag-over');
  }
};

window.handleColDragLeave = function(event, th) {
  if (th) {
    th.classList.remove('col-drag-over');
  }
};

window.handleColDrop = function(event, targetKey) {
  event.preventDefault();
  event.stopPropagation();
  document.querySelectorAll('th').forEach(t => t.classList.remove('col-drag-over', 'col-dragging'));

  if (!draggedColKey || draggedColKey === targetKey) return;
  const cols = window.getOrderedColumnsList();
  const fromIdx = cols.findIndex(c => c.key === draggedColKey);
  const toIdx = cols.findIndex(c => c.key === targetKey);
  if (fromIdx === -1 || toIdx === -1) return;

  const item = cols.splice(fromIdx, 1)[0];
  cols.splice(toIdx, 0, item);
  window.saveOrderedColumnsList(cols);
  
  const fromKey = draggedColKey;
  draggedColKey = null;

  if (typeof applyFilters === 'function') {
    applyFilters();
  } else if (typeof allPapers !== 'undefined' && Array.isArray(allPapers) && allPapers.length > 0) {
    window.renderMasterMatrix(allPapers);
  } else if (window.lastRenderedPapers && Array.isArray(window.lastRenderedPapers)) {
    window.renderMasterMatrix(window.lastRenderedPapers);
  } else {
    window.reorderMatrixColumnDOM(fromKey, targetKey);
  }
  showToast('Column position updated', 'success');
};

window.handleColDragEnd = function(event) {
  document.querySelectorAll('th').forEach(t => t.classList.remove('col-drag-over', 'col-dragging'));
  draggedColKey = null;
};

/**
 * Direct DOM column re-ordering engine for Master Matrix table:
 * Moves parent column (with all its sub-headers and cell blocks) from fromKey to toKey.
 */
window.reorderMatrixColumnDOM = function(fromKey, toKey) {
  const table = document.getElementById('matrix-table');
  if (!table || !fromKey || !toKey || fromKey === toKey) return false;

  const thead = table.querySelector('thead') || document.getElementById('matrix-thead');
  const tbody = table.querySelector('tbody') || document.getElementById('matrix-tbody');
  if (!thead || !tbody) return false;

  const mainRow = thead.querySelector('tr:first-child');
  if (!mainRow) return false;

  let fromTh = null, toTh = null;
  let fromHeaderIdx = -1, toHeaderIdx = -1;

  for (let i = 0; i < mainRow.cells.length; i++) {
    const th = mainRow.cells[i];
    const key = th.getAttribute('data-col-key');
    if (key === fromKey) {
      fromTh = th;
      fromHeaderIdx = i;
    }
    if (key === toKey) {
      toTh = th;
      toHeaderIdx = i;
    }
  }

  if (!fromTh || !toTh || fromHeaderIdx === -1 || toHeaderIdx === -1) return false;

  const fromSpan = parseInt(fromTh.colSpan, 10) || 1;

  // Calculate starting cell index in tbody for fromHeaderIdx
  let fromCellIdx = 0;
  for (let i = 0; i < fromHeaderIdx; i++) {
    fromCellIdx += (parseInt(mainRow.cells[i].colSpan, 10) || 1);
  }

  // 1. Move Header in mainRow
  if (fromHeaderIdx < toHeaderIdx) {
    mainRow.insertBefore(fromTh, toTh.nextSibling);
  } else {
    mainRow.insertBefore(fromTh, toTh);
  }

  // 2. Rebuild / update sub-headers row if exists
  const subHeaderRow = document.getElementById('matrix-sub-headers') || thead.querySelector('tr:nth-child(2)');
  if (subHeaderRow) {
    subHeaderRow.innerHTML = '';
    Array.from(mainRow.cells).forEach(th => {
      const span = parseInt(th.colSpan, 10) || 1;
      if (span > 1) {
        const parentName = (th.getAttribute('data-col-name') || th.querySelector('.col-title-text')?.textContent || '').trim();
        for (let i = 1; i <= span; i++) {
          const subTh = document.createElement('th');
          subTh.className = 'matrix-sub-th';
          subTh.style.width = '140px';
          subTh.style.minWidth = '140px';
          const sName = th.dataset[`subName${i}`] || `Sub ${i}`;
          subTh.textContent = sName;
          subTh.title = `${parentName} → ${sName}`;
          subHeaderRow.appendChild(subTh);
        }
      }
    });
  }

  // 3. Move cell blocks in tbody rows
  Array.from(tbody.rows).forEach(row => {
    if (row.cells.length <= 1 && row.cells[0]?.colSpan > 1) return;

    // Collect all fromSpan cells from row
    const fromCells = [];
    for (let s = 0; s < fromSpan; s++) {
      const td = row.cells[fromCellIdx];
      if (td) {
        fromCells.push(td);
        row.removeChild(td);
      }
    }

    // Determine target insertion reference cell after fromCells removal
    let updatedToCellIdx = 0;
    for (let i = 0; i < mainRow.cells.length; i++) {
      const th = mainRow.cells[i];
      if (th === fromTh) break;
      updatedToCellIdx += (parseInt(th.colSpan, 10) || 1);
    }

    const refTd = row.cells[updatedToCellIdx] || null;
    fromCells.forEach(cell => {
      if (refTd) {
        row.insertBefore(cell, refTd);
      } else {
        row.appendChild(cell);
      }
    });
  });

  return true;
};

/**
 * Helper to retrieve sub-columns for a column (supports both dynamic and base columns, backend & DOM data)
 */
function _getSubColumnsForCol(col, rawAllCols = []) {
  if (!col) return [];
  if (col.col_type && col.col_type !== 'split' && !Array.isArray(col.sub_columns)) {
    return [];
  }
  const colName = (col.name || '').trim().toLowerCase();
  const cleanKey = (col.key || '').replace(/^dyn_/, '').trim().toLowerCase();

  // 1. Direct sub_columns on column object
  if (Array.isArray(col.sub_columns) && col.sub_columns.length >= 2) {
    return col.sub_columns.map((s, idx) => typeof s === 'string' ? { name: s, column_name: s } : s);
  }

  // 2. From rawAllCols
  const found = (rawAllCols || []).filter(c => 
    c.parent_column_id && (
      (col.id && String(c.parent_column_id) === String(col.id)) ||
      (c.parent_column_name && c.parent_column_name.toLowerCase() === colName) ||
      (c.parent_column_name && c.parent_column_name.toLowerCase() === cleanKey)
    )
  );
  if (found.length >= 2) return found;

  return [];
}

/**
 * Rename Column Modal Engine
 */
window.openRenameColumnModal = function(key, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (typeof closeAllColumnMenus === 'function') closeAllColumnMenus();

  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot rename columns.`, 'info');
    return;
  }

  const cols = window.getOrderedColumnsList();
  let colObj = cols.find(c => c.key === key);
  if (!colObj) {
    colObj = cols.find(c => 
      (c.key && c.key.toLowerCase() === (key || '').toLowerCase()) ||
      (c.name && ('dyn_' + c.name.toLowerCase()) === (key || '').toLowerCase())
    );
  }

  const displayCurrentName = colObj ? colObj.name : (key ? key.replace(/^dyn_/, '') : 'Column');

  const keyInput = document.getElementById('rename-col-key');
  const nameInput = document.getElementById('rename-col-input');
  if (keyInput) keyInput.value = key;
  if (nameInput) nameInput.value = displayCurrentName;

  if (typeof openModal === 'function') {
    openModal('rename-column-modal');
  } else {
    const modal = document.getElementById('rename-column-modal');
    if (modal) modal.classList.add('active');
  }

  setTimeout(() => {
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 100);
};

window.renameColumnPrompt = window.openRenameColumnModal;

window.submitRenameColumnModal = async function() {
  const keyInput = document.getElementById('rename-col-key');
  const nameInput = document.getElementById('rename-col-input');
  if (!keyInput || !nameInput) return;

  const key = keyInput.value;
  const newName = nameInput.value.trim();
  if (!newName) {
    showToast('Column name cannot be empty', 'warning');
    nameInput.focus();
    return;
  }

  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) 
    ? activeProjectId 
    : (new URLSearchParams(window.location.search).get('project') || 1);

  const cols = window.getOrderedColumnsList();
  let colObj = cols.find(c => c.key === key);
  if (!colObj) {
    colObj = cols.find(c => 
      (c.key && c.key.toLowerCase() === (key || '').toLowerCase()) ||
      (c.name && ('dyn_' + c.name.toLowerCase()) === (key || '').toLowerCase())
    );
  }

  const oldName = colObj ? colObj.name : (key ? key.replace(/^dyn_/, '') : 'Column');
  if (oldName === newName) {
    if (typeof closeModal === 'function') closeModal('rename-column-modal');
    return;
  }

  const isDynamic = colObj ? colObj.isDynamic : (key.startsWith('dyn_') || !['cluster', 'domain', 'authors', 'year', 'pub', 'doi', 'status', 'advantages', 'criticism', 'future_directions', 'keywords'].includes(key));

  const submitBtn = document.getElementById('btn-submit-rename-col');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    if (isDynamic) {
      const clustId = (typeof currentClusterId !== 'undefined' && currentClusterId && currentClusterId !== 'all') ? currentClusterId : null;
      const res = await fetch('/api/dynamic-columns/rename-by-name', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          old_column_name: oldName,
          new_column_name: newName,
          column_id: colObj?.id || null,
          project_id: projId,
          cluster_id: clustId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to rename column');
      }

      // Update local paper custom_columns cache so table renders new value immediately
      if (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) {
        allPapers.forEach(p => {
          if (p.custom_columns) {
            if (p.custom_columns[oldName] !== undefined) {
              p.custom_columns[newName] = p.custom_columns[oldName];
            }
            if (p.custom_columns[oldName.toLowerCase()] !== undefined) {
              p.custom_columns[newName.toLowerCase()] = p.custom_columns[oldName.toLowerCase()];
            }
          }
        });
      }

      // Update ordered column list in localStorage
      const storageKey = 'matrix_col_order_' + projId;
      try {
        let savedOrder = JSON.parse(localStorage.getItem(storageKey) || '[]');
        savedOrder = savedOrder.map(k => k === key ? ('dyn_' + newName) : k);
        localStorage.setItem(storageKey, JSON.stringify(savedOrder));
      } catch (e) {}

      if (colObj) {
        colObj.name = newName;
        colObj.key = 'dyn_' + newName;
      }

      if (typeof loadDynamicColumns === 'function') await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      else if (typeof applyFilters === 'function') applyFilters();
      else if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers)) renderMasterMatrix(allPapers);

      if (typeof populateSearchColumnDropdown === 'function') {
        populateSearchColumnDropdown();
      }

      showToast(`Column renamed to "${newName}"`, 'success');
    } else {
      // Base column alias rename (Cluster, Domain, Authors, Publish Year, Publisher)
      const aliasKey = 'matrix_col_aliases_' + projId;
      let aliases = {};
      try {
        aliases = JSON.parse(localStorage.getItem(aliasKey) || '{}');
      } catch (e) {}
      aliases[key] = newName;
      localStorage.setItem(aliasKey, JSON.stringify(aliases));
      if (colObj) colObj.name = newName;
      window.saveOrderedColumnsList(cols);
      if (typeof applyFilters === 'function') applyFilters();
      else if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers)) renderMasterMatrix(allPapers);
      showToast(`Column renamed to "${newName}"`, 'success');
    }

    if (typeof closeModal === 'function') closeModal('rename-column-modal');
  } catch (err) {
    showToast('Failed to rename: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  }
};

/**
 * Delete Column Modal & Handler
 */
window.openDeleteColumnModal = function(key, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (typeof closeAllColumnMenus === 'function') closeAllColumnMenus();

  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot delete columns.`, 'info');
    return;
  }

  const cols = window.getOrderedColumnsList();
  let colObj = cols.find(c => c.key === key);
  if (!colObj) {
    colObj = cols.find(c => 
      (c.key && c.key.toLowerCase() === (key || '').toLowerCase()) ||
      (c.name && ('dyn_' + c.name.toLowerCase()) === (key || '').toLowerCase())
    );
  }

  const displayCurrentName = colObj ? colObj.name : (key ? key.replace(/^dyn_/, '') : 'Column');

  const keyInput = document.getElementById('delete-col-key');
  const badgeEl = document.getElementById('delete-col-name-badge');
  if (keyInput) keyInput.value = key;
  if (badgeEl) badgeEl.textContent = displayCurrentName;

  if (typeof openModal === 'function') {
    openModal('delete-column-modal');
  } else {
    const modal = document.getElementById('delete-column-modal');
    if (modal) modal.classList.add('active');
  }
};

window.deleteColumnPrompt = window.openDeleteColumnModal;

window.submitDeleteColumnModal = async function() {
  const keyInput = document.getElementById('delete-col-key');
  if (!keyInput) return;

  const key = keyInput.value;
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId) 
    ? activeProjectId 
    : (new URLSearchParams(window.location.search).get('project') || 1);

  const cols = window.getOrderedColumnsList();
  let colObj = cols.find(c => c.key === key);
  if (!colObj) {
    colObj = cols.find(c => 
      (c.key && c.key.toLowerCase() === (key || '').toLowerCase()) ||
      (c.name && ('dyn_' + c.name.toLowerCase()) === (key || '').toLowerCase())
    );
  }

  const displayCurrentName = colObj ? colObj.name : (key ? key.replace(/^dyn_/, '') : 'Column');
  const isDynamic = colObj ? colObj.isDynamic : (key.startsWith('dyn_') || !['cluster', 'domain', 'authors', 'year', 'pub', 'doi', 'status', 'advantages', 'criticism', 'future_directions', 'keywords'].includes(key));

  const submitBtn = document.getElementById('btn-submit-delete-col');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Deleting...';
  }

  try {
    if (isDynamic) {
      const clustId = (typeof currentClusterId !== 'undefined' && currentClusterId && currentClusterId !== 'all') ? currentClusterId : null;
      const res = await fetch('/api/dynamic-columns/delete-by-name', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          column_name: displayCurrentName,
          column_id: colObj?.id || null,
          project_id: projId,
          cluster_id: clustId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete column');
      }

      // Remove from localStorage saved order
      const storageKey = 'matrix_col_order_' + projId;
      try {
        let savedOrder = JSON.parse(localStorage.getItem(storageKey) || '[]');
        savedOrder = savedOrder.filter(k => k !== key && k !== ('dyn_' + displayCurrentName));
        localStorage.setItem(storageKey, JSON.stringify(savedOrder));
      } catch (e) {}

      const updated = cols.filter(c => c.key !== key && c.name !== displayCurrentName);
      window.saveOrderedColumnsList(updated);

      // Delete from local papers custom_columns
      if (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) {
        allPapers.forEach(p => {
          if (p.custom_columns) {
            delete p.custom_columns[displayCurrentName];
            delete p.custom_columns[displayCurrentName.toLowerCase()];
          }
        });
      }

      if (typeof loadDynamicColumns === 'function') await loadDynamicColumns();
      if (typeof loadPapers === 'function') await loadPapers();
      else if (typeof applyFilters === 'function') applyFilters();
      else if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers)) renderMasterMatrix(allPapers);

      if (typeof populateSearchColumnDropdown === 'function') {
        populateSearchColumnDropdown();
      }

      showToast(`Column "${displayCurrentName}" deleted`, 'success');
    } else {
      // Base column hide
      const hiddenKey = 'matrix_hidden_cols_' + projId;
      let hiddenCols = [];
      try {
        hiddenCols = JSON.parse(localStorage.getItem(hiddenKey) || '[]');
      } catch (e) {}
      if (!hiddenCols.includes(key)) hiddenCols.push(key);
      localStorage.setItem(hiddenKey, JSON.stringify(hiddenCols));
      const updated = cols.filter(c => c.key !== key);
      window.saveOrderedColumnsList(updated);
      if (typeof applyFilters === 'function') applyFilters();
      else if (typeof renderMasterMatrix === 'function' && Array.isArray(allPapers)) renderMasterMatrix(allPapers);
      showToast(`Column "${displayCurrentName}" hidden`, 'info');
    }

    if (typeof closeModal === 'function') closeModal('delete-column-modal');
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Yes, Delete Column';
    }
  }
};

/**
 * Dropdown Menu Toggle and Global Click Listener
 */
window.toggleColMenu = function(key, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const btn = event ? event.currentTarget : null;
  const menu = btn ? btn.closest('.col-menu-dropdown-wrapper')?.querySelector('.col-dropdown-menu') : document.getElementById(`col-menu-${key}`);
  if (!menu) return;

  const isOpen = menu.classList.contains('open');
  closeAllColumnMenus();
  if (!isOpen) {
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 210;
      const calculatedLeft = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, rect.right - menuWidth + 8));
      menu.style.top = (rect.bottom + 6) + 'px';
      menu.style.left = calculatedLeft + 'px';
    }
    menu.classList.add('open');
  }
};

/**
 * Toggle column expand/collapse — shows full text vs 2-line clamp
 */
const COL_FIXED_W = '200px';
const COL_SPLIT_W = '260px';
const COL_EXPANDED_MAX = '540px';

/**
 * Single-click and Double-click column header handlers
 * - Single click: Extends (expands) the column
 * - Double click: Collapses the column
 */
let colHeaderClickTimer = null;
let lastClickedColKey = null;

window.handleColHeaderClick = function(key, event) {
  if (event) {
    event.stopPropagation();
  }
  // If the browser fires click with detail >= 2 (rapid second click), collapse immediately
  if (event && event.detail && event.detail >= 2) {
    if (colHeaderClickTimer) {
      clearTimeout(colHeaderClickTimer);
      colHeaderClickTimer = null;
      lastClickedColKey = null;
    }
    window.toggleColExpand(key, null, null, false);
    return;
  }

  if (colHeaderClickTimer) {
    clearTimeout(colHeaderClickTimer);
    colHeaderClickTimer = null;
    if (lastClickedColKey && lastClickedColKey !== key) {
      window.toggleColExpand(lastClickedColKey, null, null, true);
    }
  }
  lastClickedColKey = key;
  colHeaderClickTimer = setTimeout(() => {
    colHeaderClickTimer = null;
    const targetKey = lastClickedColKey;
    lastClickedColKey = null;
    if (targetKey) {
      window.toggleColExpand(targetKey, null, null, true);
    }
  }, 250);
};

window.handleColHeaderDblClick = function(key, event) {
  if (event) {
    event.stopPropagation();
  }
  if (colHeaderClickTimer) {
    clearTimeout(colHeaderClickTimer);
    colHeaderClickTimer = null;
    lastClickedColKey = null;
  }
  window.toggleColExpand(key, null, null, false);
};

window.toggleColExpand = function(key, btnEl, event, forceExpand) {
  if (event) event.stopPropagation();

  const colIdx = _getColIndexByKey(key);
  const cellStartIdx = _getCellIndexByKey(key);
  if (colIdx === -1 || cellStartIdx === -1) return;

  const table = document.getElementById('matrix-table');
  if (!table) return;

  const mainRow = table.querySelector('thead tr:first-child');
  if (!mainRow) return;
  const th = mainRow.cells[colIdx];
  if (!th) return;

  const span = parseInt(th.colSpan, 10) || 1;
  const isExpanded = th.getAttribute('data-col-expanded') === 'true';
  const shouldExpand = (forceExpand !== undefined && forceExpand !== null) ? !!forceExpand : !isExpanded;

  if (shouldExpand === isExpanded) return;

  const isTitleCol = key === 'title';
  const isKeywordsCol = key === 'keywords';
  const isDomainCol = key === 'domain';
  const isSplitCol = th.querySelector('.col-split-header-badge') !== null || th.getAttribute('data-is-split') === 'true' || span > 1;
  const baseWidth = isTitleCol ? '220px' : (isKeywordsCol ? '240px' : (isDomainCol ? '220px' : (isSplitCol ? `${span * 140}px` : COL_FIXED_W)));
  const expWidth = isTitleCol ? '460px' : (isKeywordsCol ? '540px' : (isDomainCol ? '460px' : (isSplitCol ? `${Math.max(span * 220, 460)}px` : COL_EXPANDED_MAX)));

  if (shouldExpand) {
    // EXPAND: unlock width so content dictates size
    th.style.width = expWidth;
    th.style.minWidth = expWidth;
    th.style.maxWidth = isTitleCol ? '520px' : 'none';
    th.style.overflow = 'visible';
    th.style.whiteSpace = 'normal';
    th.setAttribute('data-col-expanded', 'true');
    th.classList.add('col-expanded');

    table.querySelectorAll('tbody tr').forEach(row => {
      for (let s = 0; s < span; s++) {
        const td = row.cells[cellStartIdx + s];
        if (!td) continue;
        td.style.width = isTitleCol ? '460px' : (isKeywordsCol ? '540px' : (isDomainCol ? '460px' : (isSplitCol ? '220px' : COL_EXPANDED_MAX)));
        td.style.minWidth = isTitleCol ? '420px' : (isKeywordsCol ? '460px' : (isDomainCol ? '400px' : (isSplitCol ? '220px' : COL_EXPANDED_MAX)));
        td.style.maxWidth = isTitleCol ? '520px' : 'none';
        td.style.overflow = 'visible';
        td.style.whiteSpace = 'normal';
        td.classList.add('col-expanded');
        td.setAttribute('data-col-expanded', 'true');

        // Expand split cell values
        const splitValCells = td.querySelectorAll('.split-cell-val');
        splitValCells.forEach(svc => {
          svc.style.whiteSpace = 'normal';
          svc.style.wordBreak = 'break-word';
        });

        // Remove clamp from the inner cell-clamp-2 div
        const clamp = td.querySelector('.cell-clamp-2');
        if (clamp) {
          clamp.style.webkitLineClamp = 'unset';
          clamp.style.display = 'block';
          clamp.style.overflow = 'visible';
          clamp.style.maxHeight = 'none';
          clamp.style.whiteSpace = 'normal';
        }
        const kwWrap = td.querySelector('.keywords-cell-wrap');
        if (kwWrap) {
          kwWrap.style.maxHeight = 'none';
          kwWrap.style.overflow = 'visible';
        }
        const domWrap = td.querySelector('.domain-cell-wrap, .domain-clamp-wrap');
        if (domWrap) {
          domWrap.style.maxHeight = 'none';
          domWrap.style.overflow = 'visible';
        }
        const popover = td.querySelector('.cell-hover-popover');
        if (popover) popover.style.display = 'none';
      }
    });

    const targetBtn = btnEl || th.querySelector('.col-expand-toggle-btn');
    if (targetBtn) {
      targetBtn.classList.add('expanded');
      targetBtn.title = 'Collapse column (return to 2 lines)';
      targetBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
    }
  } else {
    // COLLAPSE: restore base width and 2-line clamp
    th.style.width = baseWidth;
    th.style.minWidth = isTitleCol ? '200px' : baseWidth;
    th.style.maxWidth = isTitleCol ? '240px' : (isSplitCol ? 'none' : baseWidth);
    th.style.overflow = 'hidden';
    th.style.whiteSpace = 'nowrap';
    th.setAttribute('data-col-expanded', 'false');
    th.classList.remove('col-expanded');

    table.querySelectorAll('tbody tr').forEach(row => {
      for (let s = 0; s < span; s++) {
        const td = row.cells[cellStartIdx + s];
        if (!td) continue;
        td.style.width = isTitleCol ? '220px' : (isKeywordsCol ? '240px' : (isDomainCol ? '220px' : (isSplitCol ? '140px' : baseWidth)));
        td.style.minWidth = isTitleCol ? '200px' : (isKeywordsCol ? '240px' : (isDomainCol ? '200px' : (isSplitCol ? '140px' : baseWidth)));
        td.style.maxWidth = isTitleCol ? '240px' : (isKeywordsCol ? '240px' : (isDomainCol ? '240px' : (isSplitCol ? '200px' : baseWidth)));
        td.style.overflow = 'hidden';
        td.style.whiteSpace = 'nowrap';
        td.classList.remove('col-expanded');
        td.setAttribute('data-col-expanded', 'false');

        // Restore split cell values nowrap
        const splitValCells = td.querySelectorAll('.split-cell-val');
        splitValCells.forEach(svc => {
          svc.style.whiteSpace = 'nowrap';
          svc.style.wordBreak = 'normal';
        });

        // Restore 2-line clamp
        const clamp = td.querySelector('.cell-clamp-2');
        if (clamp) {
          clamp.style.webkitLineClamp = '2';
          clamp.style.display = '-webkit-box';
          clamp.style.overflow = 'hidden';
          clamp.style.maxHeight = '2.84em';
          clamp.style.whiteSpace = 'normal';
        }
        const kwWrap = td.querySelector('.keywords-cell-wrap');
        if (kwWrap) {
          kwWrap.style.maxHeight = '48px';
          kwWrap.style.overflow = 'hidden';
        }
        const domWrap = td.querySelector('.domain-cell-wrap, .domain-clamp-wrap');
        if (domWrap) {
          domWrap.style.maxHeight = '';
          domWrap.style.overflow = '';
        }
        const popover = td.querySelector('.cell-hover-popover');
        if (popover) popover.style.display = '';
      }
    });

    const targetBtn = btnEl || th.querySelector('.col-expand-toggle-btn');
    if (targetBtn) {
      targetBtn.classList.remove('expanded');
      targetBtn.title = 'Expand column to show full text';
      targetBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
    }
  }

  if (typeof window.syncMatrixExpandAllButtonState === 'function') {
    window.syncMatrixExpandAllButtonState();
  }
};

window.toggleAllColumnsExpand = function(forceExpand) {
  const table = document.getElementById('matrix-table');
  if (!table) return;
  const ths = table.querySelectorAll('thead tr:first-child th[data-col-key]');
  if (!ths || ths.length === 0) return;

  let anyCollapsed = false;
  ths.forEach(th => {
    if (th.getAttribute('data-col-expanded') !== 'true') {
      anyCollapsed = true;
    }
  });

  const targetState = (forceExpand !== undefined && forceExpand !== null) ? !!forceExpand : anyCollapsed;

  ths.forEach(th => {
    const key = th.getAttribute('data-col-key');
    if (key && typeof window.toggleColExpand === 'function') {
      window.toggleColExpand(key, null, null, targetState);
    }
  });

  window.syncMatrixExpandAllButtonState();
};

window.syncMatrixExpandAllButtonState = function() {
  const btn = document.getElementById('btn-matrix-toggle-all-expand');
  const label = document.getElementById('matrix-expand-all-label');
  if (!btn) return;
  const table = document.getElementById('matrix-table');
  if (!table) return;
  const ths = table.querySelectorAll('thead tr:first-child th[data-col-key]');
  if (!ths || ths.length === 0) return;

  const allExpanded = Array.from(ths).every(th => th.getAttribute('data-col-expanded') === 'true');
  if (allExpanded) {
    btn.classList.add('expanded');
    if (label) label.textContent = 'Collapse All Columns';
    btn.title = 'Collapse all columns to at most 2 lines';
  } else {
    btn.classList.remove('expanded');
    if (label) label.textContent = 'Expand All Columns';
    btn.title = 'Expand all columns to show full text';
  }
};

/** Returns the visual header column index in the main header row for a given col key */
function _getColIndexByKey(key) {
  const table = document.getElementById('matrix-table');
  if (!table) return -1;
  const mainRow = table.querySelector('thead tr:first-child');
  if (!mainRow) return -1;
  const ths = mainRow.cells;
  for (let i = 0; i < ths.length; i++) {
    if (ths[i].getAttribute('data-col-key') === key) return i;
  }
  return -1;
}

/** Returns the exact cell index in tbody rows taking preceding colSpans into account */
function _getCellIndexByKey(key) {
  const table = document.getElementById('matrix-table');
  if (!table) return -1;
  const mainRow = table.querySelector('thead tr:first-child');
  if (!mainRow) return -1;
  let cellIdx = 0;
  for (let i = 0; i < mainRow.cells.length; i++) {
    const th = mainRow.cells[i];
    if (th.getAttribute('data-col-key') === key) return cellIdx;
    cellIdx += (parseInt(th.colSpan, 10) || 1);
  }
  return -1;
}

/**
 * Extracts sub-column value from paper custom_columns or parent JSON split data
 */
window.getSubColumnValue = function(paper, col, subColObj, sIdx, subShortKey, subColName) {
  if (!paper) return '';
  const customCols = paper.custom_columns || {};
  
  if (subColName && customCols[subColName] !== undefined && customCols[subColName] !== '') return customCols[subColName];
  if (subColObj?.id && customCols[subColObj.id] !== undefined && customCols[subColObj.id] !== '') return customCols[subColObj.id];
  if (subColObj?.id && customCols[`col_${subColObj.id}`] !== undefined && customCols[`col_${subColObj.id}`] !== '') return customCols[`col_${subColObj.id}`];
  if (subShortKey && customCols[subShortKey] !== undefined && customCols[subShortKey] !== '') return customCols[subShortKey];
  
  const parentVal = customCols[col.name] !== undefined 
    ? customCols[col.name] 
    : (col.id && customCols[col.id] !== undefined ? customCols[col.id] : (customCols[`col_${col.id}`] || ''));
  
  if (parentVal) {
    const splitPairs = window.parseSplitData(parentVal);
    if (Array.isArray(splitPairs) && splitPairs.length > 0) {
      const match = splitPairs.find(p => 
        p.key && (p.key.toLowerCase() === (subShortKey || '').toLowerCase() || p.key.toLowerCase() === (subColName || '').toLowerCase())
      );
      if (match) return match.value || '';
      if (splitPairs[sIdx]) return splitPairs[sIdx].value || '';
    }
  }
  return '';
};

function closeAllColumnMenus() {
  document.querySelectorAll('.col-dropdown-menu.open').forEach(m => m.classList.remove('open'));
}
window.closeAllColumnMenus = closeAllColumnMenus;

document.addEventListener('click', () => closeAllColumnMenus());
window.addEventListener('resize', closeAllColumnMenus);
window.addEventListener('scroll', closeAllColumnMenus, true);

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.syncMatrixColumnViewControls === 'function') {
    window.syncMatrixColumnViewControls();
  }
  const renameInput = document.getElementById('rename-col-input');
  if (renameInput) {
    renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.submitRenameColumnModal();
      }
    });
  }
});

/**
 * MASTER MATRIX TABLE MAIN RENDER FUNCTION
 */
window.renderMasterMatrix = function(papers) {
  const matrixTable = document.getElementById('matrix-table');
  if (!matrixTable) return;

  let matrixThead = document.getElementById('matrix-thead');
  let matrixTbody = document.getElementById('matrix-tbody');

  if (!matrixThead) {
    matrixThead = matrixTable.querySelector('thead');
    if (!matrixThead) {
      matrixThead = document.createElement('thead');
      matrixTable.appendChild(matrixThead);
    }
  }

  if (!matrixTbody) {
    matrixTbody = matrixTable.querySelector('tbody');
    if (!matrixTbody) {
      matrixTbody = document.createElement('tbody');
      matrixTable.appendChild(matrixTbody);
    }
  }

  matrixThead.innerHTML = '';
  matrixTbody.innerHTML = '';

  if (!papers || papers.length === 0) {
    const isFiltered = (typeof allPapers !== 'undefined' && Array.isArray(allPapers) && allPapers.length > 0);
    const emptyRow = document.createElement('tr');
    if (isFiltered) {
      emptyRow.innerHTML = `
        <td colspan="100" style="text-align: center; padding: 3.5rem 2rem; color: var(--text-tertiary);">
          <div style="margin-bottom: 0.75rem; color: var(--accent-amber); display: flex; justify-content: center;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </div>
          <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem;">No Matching Papers Found</div>
          <div style="font-size: 0.86rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto 1.25rem; line-height: 1.5;">No papers in the Master Matrix match your active search and filter criteria. Try adjusting the search query, column selector, cluster, domain, or status filter.</div>
          <button type="button" class="mini-btn gold" onclick="if(typeof resetAllFilters === 'function') resetAllFilters();" style="padding: 0.45rem 1.15rem; font-weight: 600; font-size: 0.86rem;">Reset All Filters</button>
        </td>
      `;
    } else {
      emptyRow.innerHTML = `
        <td colspan="100" style="text-align: center; padding: 4rem 2rem; color: var(--text-tertiary);">
          <div style="margin-bottom: 0.75rem; color: var(--accent-primary); opacity: 0.8; display: flex; justify-content: center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
          <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.35rem;">No Papers in Master Matrix</div>
          <div style="font-size: 0.85rem; max-width: 400px; margin: 0 auto; line-height: 1.5;">Add papers to your survey workspace to explore clusters, populate custom taxonomy columns, and benchmark literature.</div>
        </td>
      `;
    }
    matrixTbody.appendChild(emptyRow);
    if (typeof window.renderClusterSummary === 'function') {
      window.renderClusterSummary([]);
    }
    return;
  }

  window.lastRenderedPapers = papers;
  if (typeof window.syncMatrixColumnViewControls === 'function') {
    window.syncMatrixColumnViewControls();
  }

  const mode = window.getMatrixColumnViewMode();
  const hideTitle = (mode === 'custom_pure');

  const orderedCols = window.getOrderedColumnsList();
  const rawAllCols = window.activeDataColumns || window.activeClusterColumns || [];

  // Check if any column is split to determine if 2 header rows are required
  const hasAnySplitCol = orderedCols.some(col => {
    const subCols = _getSubColumnsForCol(col, rawAllCols);
    return col.col_type === 'split' || subCols.length > 0;
  });

  // Create Main Header Row (Row 1)
  const trHead = document.createElement('tr');
  trHead.id = 'matrix-main-headers';

  // Frozen Column 1: Paper ID (Clickable to sort rows ascending / descending)
  const thIndex = document.createElement('th');
  thIndex.id = 'th-sort-si';
  thIndex.className = 'sticky-col th-sortable';
  thIndex.rowSpan = hasAnySplitCol ? 2 : 1;
  thIndex.style.cursor = 'pointer';
  thIndex.style.userSelect = 'none';
  thIndex.title = `Click to sort rows by Paper ID (${window.siSortOrder === 'desc' ? 'Descending' : 'Ascending'})`;
  thIndex.onclick = (e) => window.toggleSortSI(e);
  const sortIcon = window.siSortOrder === 'desc' ? '▼' : (window.siSortOrder === 'asc' ? '▲' : '⇅');
  thIndex.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 0.3rem;">
      <span style="font-weight: 700; font-size: 0.76rem; letter-spacing: 0.02em;">Paper ID</span>
      <span id="si-sort-indicator" style="font-size: 0.68rem; color: var(--accent-gold); opacity: 0.9;">${sortIcon}</span>
    </div>
  `;
  trHead.appendChild(thIndex);

  // Frozen Column 2: Title
  const thTitle = document.createElement('th');
  thTitle.setAttribute('data-col-key', 'title');
  thTitle.setAttribute('data-col-name', 'Title');
  thTitle.setAttribute('data-col-expanded', 'false');
  thTitle.title = 'Paper Title (Click to expand • Click again to collapse)';
  thTitle.className = 'sticky-col-2';
  thTitle.style.textAlign = 'center';
  thTitle.rowSpan = hasAnySplitCol ? 2 : 1;
  if (hideTitle) {
    thTitle.style.display = 'none';
  }
  thTitle.innerHTML = `
    <div class="col-header-inner" style="display: flex; align-items: center; justify-content: space-between; gap: 0.35rem; width: 100%;">
      <span class="col-title-text" style="font-weight: 700;" onclick="window.toggleColExpand('title', this.closest('th').querySelector('.col-expand-toggle-btn'), event)" title="Paper Title (Click to expand • Click again to collapse)">Title</span>
      <button type="button" class="col-expand-toggle-btn" onclick="window.toggleColExpand('title', this, event)" title="Expand Title column to show full text" aria-label="Expand column">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
      </button>
    </div>
  `;
  trHead.appendChild(thTitle);

  // Customizable & Reorderable Columns
  orderedCols.forEach(col => {
    const subCols = _getSubColumnsForCol(col, rawAllCols);
    const isSplitCol = col.col_type === 'split' || subCols.length > 0;
    const splitCount = isSplitCol ? (subCols.length >= 2 ? subCols.length : 2) : 1;

    let subBadgeHtml = '';
    if (isSplitCol) {
      const shortBadges = subCols.length > 0
        ? subCols.map(s => s.name.match(/\(([^)]+)\)$/)?.[1] || s.name)
        : ['Sub 1', 'Sub 2'];
      subBadgeHtml = `<span class="col-split-header-badge" title="Split Column (${subCols.map(s => s.name).join(', ') || 'Sub-Columns'})">${escapeHtml(shortBadges.join(' | '))}</span>`;
    }

    const isKwCol = col.key === 'keywords';
    const isDomCol = col.key === 'domain';
    const colWidth = isSplitCol ? `${splitCount * 140}px` : (isKwCol ? '240px' : (isDomCol ? '220px' : COL_FIXED_W));

    const th = document.createElement('th');
    th.setAttribute('draggable', 'true');
    th.setAttribute('data-col-key', col.key);
    th.setAttribute('data-col-name', col.name);
    if (col.id) th.setAttribute('data-col-id', col.id);
    th.setAttribute('data-is-split', isSplitCol ? 'true' : 'false');
    th.setAttribute('data-col-expanded', 'false');

    if (isSplitCol) {
      th.colSpan = splitCount;
      th.rowSpan = 1;
      th.style.width = colWidth;
      th.style.minWidth = colWidth;
      th.style.maxWidth = 'none';
      subCols.forEach((s, idx) => {
        const sName = s.name.match(/\(([^)]+)\)$/)?.[1] || s.name;
        th.dataset[`subName${idx + 1}`] = sName;
      });
    } else {
      th.colSpan = 1;
      th.rowSpan = hasAnySplitCol ? 2 : 1;
      th.style.width = colWidth;
      th.style.minWidth = colWidth;
      th.style.maxWidth = isKwCol ? '240px' : (isDomCol ? '240px' : COL_FIXED_W);
    }

    th.style.overflow = 'visible';
    th.ondragstart = (e) => window.handleColDragStart(e, col.key);
    th.ondragover = (e) => window.handleColDragOver(e);
    th.ondragenter = (e) => window.handleColDragEnter(e, th);
    th.ondragleave = (e) => window.handleColDragLeave(e, th);
    th.ondrop = (e) => window.handleColDrop(e, col.key);
    th.ondragend = (e) => window.handleColDragEnd(e);

    th.innerHTML = `
      <div class="col-header-inner">
        <span class="col-drag-handle" title="Drag to change column position"><svg width="10" height="14" viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="7" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="7" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/></svg></span>
        <span class="col-title-text" draggable="false" onmousedown="event.stopPropagation()" title="${escapeHtml(col.name)} (Click to extend • Double-click to collapse)" onclick="window.handleColHeaderClick('${escapeHtml(col.key)}', event)" ondblclick="window.handleColHeaderDblClick('${escapeHtml(col.key)}', event)">${escapeHtml(col.name)}</span>
        ${subBadgeHtml}
        <button type="button" class="col-expand-toggle-btn" draggable="false" onmousedown="event.stopPropagation()" onclick="window.toggleColExpand('${escapeHtml(col.key)}', this, event)" title="Expand column to show full text" aria-label="Expand column">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
        </button>
        <div class="col-menu-dropdown-wrapper" draggable="false" onmousedown="event.stopPropagation()">
          <button class="col-menu-btn" draggable="false" onmousedown="event.stopPropagation()" data-col-key="${escapeHtml(col.key)}" onclick="window.toggleColMenu(this.getAttribute('data-col-key'), event)" title="Column Settings"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
          <div class="col-dropdown-menu" id="col-menu-${escapeHtml(col.key)}" draggable="false" onclick="event.stopPropagation()">
            <div class="col-menu-header">
              <span>Column Settings</span>
            </div>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.openRenameColumnModal(this.getAttribute('data-col-key'), event)">
              <span>Rename Column</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.quickAddSubColumn(this.getAttribute('data-col-key'), null, event)">
              <span>+ Add Sub-Column</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.openSplitColumnModal(this.getAttribute('data-col-key'), event)">
              <span>${isSplitCol ? 'Manage Column' : 'Split Column'}</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.toggleColExpand(this.getAttribute('data-col-key'), null, event); window.closeAllColumnMenus();">
              <span>Expand / Collapse</span>
            </button>
            <button type="button" class="col-menu-item" onclick="window.toggleMetadataColumnsVisibility(); window.closeAllColumnMenus();">
              <span>${(window.getMatrixColumnViewMode() === 'custom' || window.getMatrixColumnViewMode() === 'custom_pure') ? 'Show All Columns' : 'Show Custom Columns Only'}</span>
            </button>
            <div class="col-menu-divider"></div>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.moveColumn(this.getAttribute('data-col-key'), 'left', event)">
              <span>Move Left</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.moveColumn(this.getAttribute('data-col-key'), 'right', event)">
              <span>Move Right</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.moveColumn(this.getAttribute('data-col-key'), 'leftmost', event)">
              <span>Move to First</span>
            </button>
            <button type="button" class="col-menu-item" data-col-key="${escapeHtml(col.key)}" onclick="window.moveColumn(this.getAttribute('data-col-key'), 'rightmost', event)">
              <span>Move to Last</span>
            </button>
            <div class="col-menu-divider"></div>
            <button type="button" class="col-menu-item" onclick="window.resetMatrixColumnOrder(); window.closeAllColumnMenus();">
              <span>↺ Reset Default Layout</span>
            </button>
            <button type="button" class="col-menu-item danger-item" data-col-key="${escapeHtml(col.key)}" onclick="window.openDeleteColumnModal(this.getAttribute('data-col-key'), event)">
              <span>Delete Column</span>
            </button>
          </div>
        </div>
      </div>
    `;
    trHead.appendChild(th);
  });

  // If there are no customizable dynamic columns defined in this matrix, append a clean + Add Column helper header
  const hasDynCols = orderedCols.some(c => c.isDynamic);
  if (!hasDynCols) {
    const thAdd = document.createElement('th');
    thAdd.className = 'th-add-col-placeholder';
    thAdd.rowSpan = hasAnySplitCol ? 2 : 1;
    thAdd.title = 'Click to add a custom extraction column to this matrix';
    thAdd.onclick = () => {
      if (typeof openAddColumnModal === 'function') openAddColumnModal();
    };
    thAdd.innerHTML = `
      <div class="col-header-inner" style="justify-content: center; color: var(--accent-primary); border: 1.5px dashed rgba(56, 189, 248, 0.4); border-radius: 6px; padding: 0.25rem 0.65rem; transition: all 0.2s ease;">
        <span style="font-weight: 600; font-size: 0.76rem; letter-spacing: 0.02em;">+ Add Column</span>
      </div>
    `;
    trHead.appendChild(thAdd);
  }

  matrixThead.appendChild(trHead);

  // Create Sub-Header Row (Row 2) if any split columns exist
  if (hasAnySplitCol) {
    const trSubHead = document.createElement('tr');
    trSubHead.id = 'matrix-sub-headers';
    trSubHead.className = 'matrix-sub-header-row';

    orderedCols.forEach(col => {
      const subCols = _getSubColumnsForCol(col, rawAllCols);
      const isSplitCol = col.col_type === 'split' || subCols.length > 0;
      const splitCount = isSplitCol ? (subCols.length >= 2 ? subCols.length : 2) : 1;

      if (isSplitCol) {
        for (let sIdx = 0; sIdx < splitCount; sIdx++) {
          const subColObj = subCols[sIdx];
          const subName = subColObj ? (subColObj.name.match(/\(([^)]+)\)$/)?.[1] || subColObj.name) : `Sub ${sIdx + 1}`;
          const subTh = document.createElement('th');
          subTh.className = 'matrix-sub-th';
          subTh.style.width = '140px';
          subTh.style.minWidth = '140px';
          subTh.textContent = subName;
          subTh.title = `${col.name} → ${subName}`;
          trSubHead.appendChild(subTh);
        }
      }
    });

    matrixThead.appendChild(trSubHead);
  }

  // Sort papers according to active siSortOrder
  const sortedPapers = [...papers];
  if (window.siSortOrder === 'desc') {
    sortedPapers.sort((a, b) => {
      const sA = (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(a) : (a.serial_no || a.id));
      const sB = (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(b) : (b.serial_no || b.id));
      return String(sB).localeCompare(String(sA), undefined, { numeric: true, sensitivity: 'base' });
    });
  } else if (window.siSortOrder === 'asc') {
    sortedPapers.sort((a, b) => {
      const sA = (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(a) : (a.serial_no || a.id));
      const sB = (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(b) : (b.serial_no || b.id));
      return String(sA).localeCompare(String(sB), undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  // Populate Table Body Rows
  sortedPapers.forEach((p, index) => {
    const tr = document.createElement('tr');
    const statusVal = p.status || 'unread';
    tr.className = `matrix-row row-status-${statusVal}`;
    tr.setAttribute('data-paper-id', p.id);

    // 1. Serial Number with Status Color Indicator (Fixed Permanent Reference ID)
    const tdIndex = document.createElement('td');
    tdIndex.className = 'sticky-col td-index';
    tdIndex.style.fontFamily = 'var(--font-mono)';
    tdIndex.style.fontSize = '0.82rem';
    const paperSerial = (typeof window.getPaperSerialNo === 'function' ? window.getPaperSerialNo(p) : (p.serial_no || (index + 1)));
    tdIndex.title = `Paper #${paperSerial} | Reading Status: ${statusVal.replace('_', ' ').toUpperCase()} (Click to toggle)`;
    tdIndex.innerHTML = `<span class="status-dot status-dot-${statusVal}"></span><span>${paperSerial}</span>`;
    tdIndex.onclick = (e) => cyclePaperStatus(p.id, statusVal, e);
    tr.appendChild(tdIndex);

    // 2. Paper Title (Frozen Column, Clickable to open Reader Modal, 2-line clamp)
    const tdTitle = document.createElement('td');
    tdTitle.className = 'editable-cell sticky-col-2';
    tdTitle.setAttribute('data-col-key', 'title');
    tdTitle.setAttribute('data-paper-id', p.id);
    tdTitle.setAttribute('data-raw-val', p.title || '');
    tdTitle.style.fontWeight = '600';
    tdTitle.innerHTML = formatCellContent(p.title, 'title', p.id);
    if (hideTitle) {
      tdTitle.style.display = 'none';
    }
    makeCellEditable(tdTitle, 'title', p.id, true);
    tr.appendChild(tdTitle);

    // 3. Render cells in the exact order of orderedCols
    orderedCols.forEach(col => {
      const subCols = _getSubColumnsForCol(col, rawAllCols);
      const isSplitCol = col.col_type === 'split' || subCols.length > 0;
      const splitCount = isSplitCol ? (subCols.length >= 2 ? subCols.length : 2) : 1;

      if (isSplitCol) {
        // Render separate individual <td> cells for each sub-column
        for (let sIdx = 0; sIdx < splitCount; sIdx++) {
          const subColObj = subCols[sIdx];
          const subShortKey = subColObj ? (subColObj.name.match(/\(([^)]+)\)$/)?.[1] || subColObj.name) : `Sub ${sIdx + 1}`;
          const subColName = subColObj ? subColObj.name : `${col.name}(${subShortKey})`;
          const subVal = window.getSubColumnValue(p, col, subColObj, sIdx, subShortKey, subColName);

          const tdSub = document.createElement('td');
          tdSub.className = 'editable-cell';
          tdSub.style.width = '140px';
          tdSub.style.minWidth = '140px';
          tdSub.style.maxWidth = '200px';
          tdSub.style.overflow = 'hidden';
          tdSub.setAttribute('data-col-key', col.key);
          tdSub.setAttribute('data-col-name', subColName);
          if (subColObj?.id) tdSub.setAttribute('data-col-id', subColObj.id);
          else if (col.id) tdSub.setAttribute('data-col-id', col.id);
          tdSub.setAttribute('data-paper-id', p.id);
          tdSub.setAttribute('data-subcol-index', sIdx + 1);
          tdSub.setAttribute('data-subcol-name', subShortKey);
          tdSub.setAttribute('data-raw-val', typeof subVal === 'object' ? JSON.stringify(subVal) : (subVal || ''));
          tdSub.innerHTML = formatCellContent(subVal, 'dynamic', p.id);
          makeCellEditable(tdSub, 'dynamic', p.id, true, subColObj?.id || col.id, subColName);
          tr.appendChild(tdSub);
        }
      } else {
        // Helper to stamp fixed width on a newly created td
        function applyColFixedWidth(td) {
          const w = col.key === 'keywords' ? '240px' : (col.key === 'domain' ? '220px' : COL_FIXED_W);
          td.style.width = w;
          td.style.minWidth = w;
          td.style.maxWidth = w;
          td.style.overflow = 'hidden';
          td.setAttribute('data-col-key', col.key);
          td.setAttribute('data-is-split', 'false');
        }

        if (col.key === 'authors') {
          const tdAuthors = document.createElement('td');
          applyColFixedWidth(tdAuthors);
          tdAuthors.className = 'editable-cell';
          tdAuthors.setAttribute('data-paper-id', p.id);
          tdAuthors.setAttribute('data-raw-val', p.authors || '');
          tdAuthors.style.color = 'var(--text-secondary)';
          tdAuthors.innerHTML = formatCellContent(p.authors || '-', 'authors', p.id);
          makeCellEditable(tdAuthors, 'authors', p.id, true);
          tr.appendChild(tdAuthors);
        } else if (col.key === 'year') {
          const tdYear = document.createElement('td');
          applyColFixedWidth(tdYear);
          tdYear.className = 'editable-cell';
          tdYear.setAttribute('data-paper-id', p.id);
          tdYear.setAttribute('data-raw-val', p.year || '');
          tdYear.style.fontFamily = 'var(--font-mono)';
          tdYear.innerHTML = formatCellContent(p.year || '-', 'year', p.id);
          makeCellEditable(tdYear, 'year', p.id, false);
          tr.appendChild(tdYear);
        } else if (col.key === 'pub') {
          const tdPub = document.createElement('td');
          applyColFixedWidth(tdPub);
          tdPub.className = 'editable-cell';
          tdPub.setAttribute('data-paper-id', p.id);
          tdPub.setAttribute('data-raw-val', p.pub || '');
          tdPub.innerHTML = formatCellContent(p.pub || '-', 'pub', p.id);
          makeCellEditable(tdPub, 'pub', p.id, true);
          tr.appendChild(tdPub);
        } else if (col.key === 'doi') {
          const tdDoi = document.createElement('td');
          applyColFixedWidth(tdDoi);
          tdDoi.className = 'editable-cell';
          tdDoi.setAttribute('data-paper-id', p.id);
          const rawDoi = p.doi || p.pdf_url || '';
          tdDoi.setAttribute('data-raw-val', rawDoi);
          tdDoi.innerHTML = formatCellContent(rawDoi, 'doi', p.id);
          makeCellEditable(tdDoi, 'doi', p.id, false);
          tr.appendChild(tdDoi);
        } else if (col.key === 'cluster') {
          const tdCluster = document.createElement('td');
          applyColFixedWidth(tdCluster);
          tdCluster.className = 'editable-cell';
          tdCluster.setAttribute('data-paper-id', p.id);
          tdCluster.setAttribute('data-raw-val', p.cluster_name || 'Unassigned');
          const cName = p.cluster_name || 'Unassigned';
          const cColor = p.cluster_color || 'var(--accent-primary)';
          tdCluster.innerHTML = `<div class="cell-wrapper" style="display: flex; align-items: center; justify-content: center;"><span class="cluster-tag" style="background: rgba(56, 189, 248, 0.12); color: ${cColor}; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 180px;" title="Cluster: ${escapeHtml(cName)}">${escapeHtml(cName)}</span></div>`;
          tr.appendChild(tdCluster);
        } else if (col.key === 'domain') {
          const tdDomain = document.createElement('td');
          applyColFixedWidth(tdDomain);
          tdDomain.className = 'editable-cell';
          tdDomain.setAttribute('data-paper-id', p.id);
          tdDomain.setAttribute('data-raw-val', p.domain || 'General');
          tdDomain.innerHTML = formatCellContent(p.domain, 'domain', p.id);
          makeCellEditable(tdDomain, 'domain', p.id, true);
          tr.appendChild(tdDomain);
        } else if (col.key === 'status') {
          const tdStatus = document.createElement('td');
          applyColFixedWidth(tdStatus);
          tdStatus.className = 'editable-cell td-status-cell';
          tdStatus.setAttribute('data-paper-id', p.id);
          const curStat = p.status || 'unread';
          tdStatus.setAttribute('data-raw-val', curStat);
          tdStatus.innerHTML = formatCellContent(curStat, 'status', p.id);
          tdStatus.onclick = (e) => {
            if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
            window.cyclePaperStatus(p.id, p.status || 'unread', e);
          };
          tr.appendChild(tdStatus);
        } else if (col.key === 'advantages') {
          const tdAdv = document.createElement('td');
          applyColFixedWidth(tdAdv);
          tdAdv.className = 'editable-cell';
          const rawAdv = p.advantages || p.strengths || (p.custom_columns && (p.custom_columns['Advantages'] || p.custom_columns['advantages'] || p.custom_columns['Strengths'])) || '-';
          tdAdv.setAttribute('data-paper-id', p.id);
          tdAdv.setAttribute('data-raw-val', typeof rawAdv === 'object' ? JSON.stringify(rawAdv) : (rawAdv || ''));
          tdAdv.innerHTML = formatCellContent(rawAdv, 'advantages', p.id);
          makeCellEditable(tdAdv, 'advantages', p.id, true);
          tr.appendChild(tdAdv);
        } else if (col.key === 'criticism') {
          const tdCrit = document.createElement('td');
          applyColFixedWidth(tdCrit);
          tdCrit.className = 'editable-cell';
          const rawCrit = p.criticism || p.gaps || (p.custom_columns && (p.custom_columns['Criticism'] || p.custom_columns['criticism'] || p.custom_columns['Gaps'])) || '-';
          tdCrit.setAttribute('data-paper-id', p.id);
          tdCrit.setAttribute('data-raw-val', typeof rawCrit === 'object' ? JSON.stringify(rawCrit) : (rawCrit || ''));
          tdCrit.innerHTML = formatCellContent(rawCrit, 'criticism', p.id);
          makeCellEditable(tdCrit, 'criticism', p.id, true);
          tr.appendChild(tdCrit);
        } else if (col.key === 'future_directions') {
          const tdFut = document.createElement('td');
          applyColFixedWidth(tdFut);
          tdFut.className = 'editable-cell';
          const rawFut = p.future_directions || p.future_research_direction || (p.custom_columns && (p.custom_columns['Future Research Direction'] || p.custom_columns['future_directions'] || p.custom_columns['Future Directions'])) || '-';
          tdFut.setAttribute('data-paper-id', p.id);
          tdFut.setAttribute('data-raw-val', typeof rawFut === 'object' ? JSON.stringify(rawFut) : (rawFut || ''));
          tdFut.innerHTML = formatCellContent(rawFut, 'future_directions', p.id);
          makeCellEditable(tdFut, 'future_directions', p.id, true);
          tr.appendChild(tdFut);
        } else if (col.key === 'keywords') {
          const tdKw = document.createElement('td');
          applyColFixedWidth(tdKw);
          tdKw.className = 'editable-cell';
          const kws = Array.isArray(p.keywords) ? p.keywords : (typeof p.keywords === 'string' ? p.keywords.split(/[,;\n]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean) : []);
          tdKw.setAttribute('data-paper-id', p.id);
          tdKw.setAttribute('data-raw-val', kws.join(', '));
          tdKw.innerHTML = formatCellContent(kws, 'keywords', p.id);
          makeCellEditable(tdKw, 'keywords', p.id, true);
          tr.appendChild(tdKw);
        } else if (col.isDynamic) {
          const tdCol = document.createElement('td');
          applyColFixedWidth(tdCol);
          tdCol.className = 'editable-cell';
          const colName = col.name;
          const colId = col.id;
          const customCols = p.custom_columns || {};
          const val = (customCols[colName] !== undefined ? customCols[colName] : (colId && customCols[colId] !== undefined ? customCols[colId] : (customCols[`col_${colId}`] || '')));
          tdCol.setAttribute('data-col-id', colId || '');
          tdCol.setAttribute('data-col-name', colName);
          tdCol.setAttribute('data-paper-id', p.id);
          tdCol.setAttribute('data-raw-val', typeof val === 'object' ? JSON.stringify(val) : (val || ''));
          tdCol.innerHTML = formatCellContent(val, 'dynamic', p.id);
          makeCellEditable(tdCol, 'dynamic', p.id, true, colId, colName);
          tr.appendChild(tdCol);
        }
      }
    });

    if (!hasDynCols) {
      const tdAdd = document.createElement('td');
      tdAdd.className = 'td-add-col-placeholder';
      tdAdd.style.textAlign = 'center';
      tdAdd.style.color = 'var(--text-tertiary)';
      tdAdd.style.opacity = '0.35';
      tdAdd.style.fontSize = '0.8rem';
      tdAdd.textContent = '—';
      tr.appendChild(tdAdd);
    }

    matrixTbody.appendChild(tr);
  });

  window.triggerMath(matrixTbody);
  if (typeof window.renderClusterSummary === 'function') {
    window.renderClusterSummary(papers);
  }
  if (typeof window.updateMatrixColumnButtonStates === 'function') {
    window.updateMatrixColumnButtonStates();
  }
  if (typeof window.syncMatrixExpandAllButtonState === 'function') {
    window.syncMatrixExpandAllButtonState();
  }
};

/**
 * Split Data Parser — Converts JSON objects or "Key: Value" text into [{key, value}]
 */
window.parseSplitData = function(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const entries = Object.entries(raw).map(([k, v]) => ({ key: k.trim(), value: (v !== null && v !== undefined ? String(v).trim() : '') }));
    return entries.length > 0 ? entries : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed).map(([k, v]) => ({ key: k.trim(), value: (v !== null && v !== undefined ? String(v).trim() : '') }));
        return entries.length > 0 ? entries : null;
      }
    } catch (_) {}
  }
  if (trimmed.includes('\n') || trimmed.includes(';') || (trimmed.includes(':') && (trimmed.includes('TC') || trimmed.includes('SC') || trimmed.includes('Time') || trimmed.includes('Space')))) {
    const lines = trimmed.split(/[\r\n;]+/).map(l => l.trim()).filter(Boolean);
    const pairs = [];
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        pairs.push({ key: match[1].trim(), value: match[2].trim() });
      }
    }
    if (pairs.length > 0) return pairs;
  }
  return null;
};

window.makeCellEditable = function(cell, fieldType, paperId, isMultiline = true, columnId = null, columnName = null) {
  cell.addEventListener('dblclick', (e) => {
    if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
      showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot edit table data.`, 'info');
      return;
    }
    if (cell.classList.contains('editing')) return;
    e.stopPropagation();

    const originalRaw = cell.getAttribute('data-raw-val') || '';
    const isColExpanded = cell.classList.contains('col-expanded') || cell.closest('table')?.querySelector(`thead th[data-col-key="${cell.getAttribute('data-col-key')}"]`)?.getAttribute('data-col-expanded') === 'true';

    cell.classList.add('editing');
    cell.style.overflow = 'visible';

    const colKey = cell.getAttribute('data-col-key');
    const expandThisColumn = () => {
      if (!colKey) return;
      const table = cell.closest('table') || document.getElementById('matrix-table');
      if (!table) return;
      const colIdx = _getColIndexByKey(colKey);
      if (colIdx !== -1) {
        const th = table.querySelectorAll('thead tr th')[colIdx];
        if (th && th.getAttribute('data-col-expanded') !== 'true' && typeof window.toggleColExpand === 'function') {
          window.toggleColExpand(colKey, null, null, true);
        }
      }
    };

    const collapseThisColumn = () => {
      if (!colKey) return;
      const table = cell.closest('table') || document.getElementById('matrix-table');
      if (!table) return;
      const colIdx = _getColIndexByKey(colKey);
      if (colIdx !== -1) {
        const th = table.querySelectorAll('thead tr th')[colIdx];
        if (th && th.getAttribute('data-col-expanded') === 'true' && typeof window.toggleColExpand === 'function') {
          window.toggleColExpand(colKey, null, null, false);
        }
      }
    };

    // 1. Standard Single-Value Inline Input
    let input;
    if (fieldType === 'year') {
      input = document.createElement('input');
      input.type = 'number';
      input.className = 'cell-inline-input';
      input.value = originalRaw;
    } else if (fieldType === 'doi') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-inline-input';
      input.placeholder = 'e.g. 10.xxxx or https://...';
      input.value = originalRaw;
    } else {
      input = document.createElement('textarea');
      input.className = 'cell-inline-textarea';
      input.value = originalRaw;
      
      const autoResize = () => {
        input.style.height = 'auto';
        input.style.height = Math.max(54, Math.min(input.scrollHeight, 320)) + 'px';
      };
      input.addEventListener('input', autoResize);
      input.addEventListener('keyup', autoResize);
      input.addEventListener('paste', () => setTimeout(autoResize, 10));
      setTimeout(autoResize, 15);
    }

    cell.innerHTML = '';
    cell.appendChild(input);

    input.focus();
    if (input.setSelectionRange) {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    } else if (input.select) {
      input.select();
    }

    let isSaved = false;
    async function saveInlineEdit() {
      if (isSaved) return;
      isSaved = true;
      const newVal = input.value.trim();
      cell.classList.remove('editing');
      cell.style.overflow = isColExpanded ? 'visible' : 'hidden';

      if (newVal === originalRaw) {
        restoreCellDisplay(cell, fieldType, originalRaw);
        return;
      }

      await saveValueToBackend(newVal);
    }

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (cell.classList.contains('editing')) {
          saveInlineEdit();
        }
      }, 180);
    });

    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter' && !ke.shiftKey && fieldType !== 'dynamic') {
        ke.preventDefault();
        saveInlineEdit();
      } else if (ke.key === 'Escape') {
        isSaved = true;
        cell.classList.remove('editing');
        cell.style.overflow = isColExpanded ? 'visible' : 'hidden';
        restoreCellDisplay(cell, fieldType, originalRaw);
      }
    });

    async function saveValueToBackend(valToSave) {
      try {
        if (fieldType === 'dynamic') {
          const res = await fetch('/api/paper-column-values', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              paper_id: paperId,
              column_id: columnId,
              column_name: columnName,
              value: valToSave
            })
          });
          if (res.ok) {
            cell.setAttribute('data-raw-val', valToSave);
            restoreCellDisplay(cell, fieldType, valToSave);
            cell.classList.add('cell-saved');
            setTimeout(() => cell.classList.remove('cell-saved'), 900);
            const pObj = (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) ? allPapers.find(item => item.id === paperId) : null;
            if (pObj) {
              if (!pObj.custom_columns) pObj.custom_columns = {};
              if (columnName) pObj.custom_columns[columnName] = valToSave;
              if (columnId) pObj.custom_columns[columnId] = valToSave;
            }
            if (typeof window.renderClusterSummary === 'function') {
              window.renderClusterSummary();
            }
          } else {
            throw new Error(await res.text());
          }
        } else {
          const bodyPayload = {};
          if (fieldType === 'year') {
            bodyPayload.year = valToSave ? parseInt(valToSave, 10) : null;
          } else if (fieldType === 'doi') {
            bodyPayload.doi = valToSave;
          } else if (fieldType === 'advantages') {
            bodyPayload.advantages = valToSave;
            bodyPayload.strengths = valToSave;
          } else if (fieldType === 'criticism') {
            bodyPayload.criticism = valToSave;
            bodyPayload.gaps = valToSave;
          } else if (fieldType === 'future_directions') {
            bodyPayload.future_directions = valToSave;
            bodyPayload.future_research_direction = valToSave;
          } else if (fieldType === 'keywords') {
            const kwArr = typeof valToSave === 'string'
              ? valToSave.split(/[,;\n]+/).map(k => k.trim().replace(/^#/, '')).filter(Boolean)
              : (Array.isArray(valToSave) ? valToSave : []);
            bodyPayload.keywords = kwArr;
          } else {
            bodyPayload[fieldType] = valToSave;
          }

          const res = await fetch(`/api/papers/${paperId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(bodyPayload)
          });
          if (res.ok) {
            cell.setAttribute('data-raw-val', valToSave);
            restoreCellDisplay(cell, fieldType, valToSave);
            cell.classList.add('cell-saved');
            setTimeout(() => cell.classList.remove('cell-saved'), 900);
            const pObj = (typeof allPapers !== 'undefined' && Array.isArray(allPapers)) ? allPapers.find(item => item.id === paperId) : null;
            if (pObj) {
              pObj[fieldType] = valToSave;
              if (fieldType === 'doi') pObj.doi = valToSave;
              if (fieldType === 'advantages') pObj.strengths = valToSave;
              if (fieldType === 'criticism') pObj.gaps = valToSave;
              if (fieldType === 'future_directions') pObj.future_research_direction = valToSave;
              if (fieldType === 'keywords') {
                pObj.keywords = bodyPayload.keywords;
                if (typeof window.renderKeywordsHub === 'function') {
                  window.renderKeywordsHub();
                }
              }
            }
            if (fieldType === 'domain') {
              if (typeof window.registerCustomDomain === 'function') {
                window.registerCustomDomain(valToSave);
              } else if (typeof window.populateDomainDropdown === 'function') {
                window.populateDomainDropdown();
              }
              if (typeof window.populateDomainSelects === 'function') {
                window.populateDomainSelects();
              }
            }
            if (typeof window.renderClusterSummary === 'function') {
              window.renderClusterSummary();
            }
          } else {
            throw new Error(await res.text());
          }
        }
      } catch (err) {
        showToast('Failed to save cell: ' + err.message, 'error');
        restoreCellDisplay(cell, fieldType, originalRaw);
      }
    }
  });
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCellContent(val, fieldType, paperId = null) {
  if (fieldType === 'domain') {
    let arr = [];
    if (Array.isArray(val)) {
      arr = val.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof val === 'string') {
      arr = val.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
    }
    if (arr.length === 0) {
      arr = ['General'];
    }

    const curDom = (window.currentDomain || '').toLowerCase().trim();
    const chipsHtml = arr.map(d => {
      const isSel = curDom && curDom !== 'all' && curDom === d.toLowerCase();
      return `<span class="domain-tag ${isSel ? 'active' : ''}" onclick="event.stopPropagation(); if (typeof window.toggleDomainFilter === 'function') window.toggleDomainFilter('${escapeHtml(d)}');" title="Filter by Domain: ${escapeHtml(d)}">${escapeHtml(d)}</span>`;
    }).join('');

    const popoverHtml = (arr.length > 1 || arr.some(d => d.length > 18)) ? `
      <div class="cell-hover-popover domain-hover-popover">
        <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.4rem;">Domain (${arr.length})</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
          ${chipsHtml}
        </div>
      </div>
    ` : '';

    return `
      <div class="cell-wrapper domain-cell-wrapper">
        <div class="domain-cell-wrap domain-clamp-wrap">
          ${chipsHtml}
        </div>
        ${popoverHtml}
      </div>
    `;
  }
  if (fieldType === 'status') {
    const sVal = (val || 'unread').toLowerCase().trim();
    const label = sVal === 'in_progress' ? 'In Progress' : (sVal === 'read' ? 'Read' : 'Unread');
    return `
      <div class="cell-wrapper" style="display: flex; align-items: center; justify-content: center;">
        <span class="matrix-status-badge status-badge-${sVal}" title="Reading Status: ${label} (Click to change)">
          <span class="status-dot status-dot-${sVal}"></span>
          <span>${label}</span>
        </span>
      </div>
    `;
  }
  if (fieldType === 'doi') {
    if (!val || val === '-' || val === 'null' || val === 'undefined') {
      return '<span style="color: var(--text-tertiary); font-size: 0.82rem;">-</span>';
    }
    const cleanVal = String(val).trim();
    if (!cleanVal) return '<span style="color: var(--text-tertiary); font-size: 0.82rem;">-</span>';
    let url = cleanVal;
    let displayLabel = cleanVal;
    if (cleanVal.startsWith('10.')) {
      url = `https://doi.org/${cleanVal}`;
    } else if (!cleanVal.startsWith('http://') && !cleanVal.startsWith('https://')) {
      if (cleanVal.includes('doi.org/')) {
        url = `https://${cleanVal.replace(/^https?:\/\//, '')}`;
      } else {
        url = `https://${cleanVal}`;
      }
    }
    return `
      <div class="cell-wrapper" style="display: flex; align-items: center; justify-content: flex-start;">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="matrix-doi-link" onclick="event.stopPropagation()" title="Open DOI / Link in new tab: ${escapeHtml(url)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; vertical-align: middle;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          <span class="doi-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayLabel)}</span>
        </a>
      </div>
    `;
  }
  if (fieldType === 'keywords') {
    const arr = Array.isArray(val)
      ? val
      : (typeof val === 'string' ? val.split(/[,;\n]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean) : []);
    if (arr.length === 0) return '<span style="color: var(--text-tertiary); font-size: 0.82rem;">-</span>';
    const chipsHtml = arr.map(k => {
      const isSel = window.selectedKeywords && (window.selectedKeywords.has(k) || Array.from(window.selectedKeywords).some(sk => sk.toLowerCase() === k.toLowerCase()));
      return `<span class="kw-tag ${isSel ? 'active' : ''}" onclick="event.stopPropagation(); if (typeof window.toggleKeywordFilter === 'function') window.toggleKeywordFilter('${escapeHtml(k)}');" title="Filter by #${escapeHtml(k)}">#${escapeHtml(k)}</span>`;
    }).join('');
    const popoverHtml = arr.length > 1 ? `
      <div class="cell-hover-popover keywords-hover-popover">
        <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 0.4rem;">Keywords (${arr.length})</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
          ${chipsHtml}
        </div>
      </div>
    ` : '';
    return `
      <div class="cell-wrapper keywords-cell-wrapper">
        <div class="keywords-cell-wrap">
          ${chipsHtml}
        </div>
        ${popoverHtml}
      </div>
    `;
  }
  
  let text = '';
  if (val !== null && val !== undefined) {
    if (typeof val === 'object') {
      text = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
    } else {
      const trimmed = String(val).trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            text = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join('; ');
          } else {
            text = trimmed;
          }
        } catch (_) {
          text = trimmed;
        }
      } else {
        text = trimmed;
      }
    }
  }
  if (!text) text = '-';
  const escaped = escapeHtml(text);
  
  const isTitle = fieldType === 'title';
  const titleClass = isTitle ? 'paper-title-link' : '';
  const clickHandler = (isTitle && paperId) ? `onclick="window.handlePaperTitleClick(${paperId}, event)" title="Click to open paper in split-screen review"` : '';
  
  if (isTitle && paperId) {
    const isRestrictedRole = (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole));
    const delBtnHtml = !isRestrictedRole ? `
      <button
        type="button"
        class="matrix-row-del-btn"
        onclick="window.deletePaper(${paperId}, event)"
        title="Delete paper from survey"
        aria-label="Delete paper"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    ` : '';

    if (text !== '-' && (text.length > 35 || text.includes('\n'))) {
      return `
        <div class="cell-wrapper title-cell-wrapper">
          <div class="cell-clamp-2 ${titleClass}" ${clickHandler}>${escaped}</div>
          ${delBtnHtml}
          <div class="cell-hover-popover">
            <div class="popover-text">${escaped}</div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="cell-wrapper title-cell-wrapper">
        <div class="cell-clamp-2 ${titleClass}" ${clickHandler}>${escaped}</div>
        ${delBtnHtml}
      </div>
    `;
  }
  
  if (text !== '-' && (text.length > 35 || text.includes('\n'))) {
    return `
      <div class="cell-wrapper">
        <div class="cell-clamp-2 ${titleClass}" ${clickHandler}>${escaped}</div>
        <div class="cell-hover-popover">
          <div class="popover-text">${escaped}</div>
        </div>
      </div>
    `;
  }
  
  return `<div class="cell-wrapper"><div class="cell-clamp-2 ${titleClass}" ${clickHandler}>${escaped}</div></div>`;
}

window.handlePaperTitleClick = function(paperId, event) {
  if (event) {
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA' || event.target.closest('.matrix-row-del-btn'))) return;
  }
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId)
    ? activeProjectId
    : (window.activeProjectId || (new URLSearchParams(window.location.search)).get('project') || 1);
  
  // Directly open the split-screen Review Page for this paper
  window.open(`/review?project=${pid}&paper=${paperId}`, '_blank');
};

window.deletePaper = async function(paperId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot delete papers.`, 'info');
    return;
  }

  if (!confirm('⚠️ Are you sure you want to permanently delete this research paper from the survey?')) return;

  try {
    const res = await fetch(`/api/papers/${paperId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      showToast('Paper deleted successfully', 'success');
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadStats === 'function') await loadStats();
      if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
    } else {
      let errText = 'Failed to delete paper';
      try {
        const json = await res.json();
        if (json.error) errText = json.error;
      } catch (_) {
        errText = await res.text();
      }
      throw new Error(errText);
    }
  } catch (err) {
    showToast('Failed to delete paper: ' + err.message, 'error');
  }
};

function restoreCellDisplay(cell, fieldType, val) {
  const paperId = cell.getAttribute('data-paper-id');
  cell.innerHTML = formatCellContent(val, fieldType, paperId);
  if (fieldType === 'dynamic' || fieldType === 'equation') {
    window.triggerMath(cell);
  }
}

window.cyclePaperStatus = async function(paperId, currentStat, event) {
  if (event) event.stopPropagation();
  if (typeof currentProjectRole !== 'undefined' && ['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${currentProjectRole.toUpperCase()}' cannot modify paper status.`, 'info');
    return;
  }

  const order = ['unread', 'in_progress', 'read'];
  const nextIdx = (order.indexOf(currentStat) + 1) % order.length;
  const nextStat = order[nextIdx];

  try {
    const res = await fetch(`/api/papers/${paperId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: nextStat })
    });
    if (res.ok) {
      if (typeof loadStats === 'function') await loadStats();
      if (typeof loadPapers === 'function') await loadPapers();
      if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
      showToast(`Status updated to ${nextStat.replace('_', ' ')}`, 'info');
    }
  } catch (err) {
    showToast('Failed to toggle status: ' + err.message, 'error');
  }
};
