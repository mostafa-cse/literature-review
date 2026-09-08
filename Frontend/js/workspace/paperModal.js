/**
 * LITSPHERE ADD PAPER MODAL & METADATA INGESTION ENGINE
 * Supports Single Paper Ingestion, CrossRef DOI Auto-Fetch, File Browser PDF Uploads,
 * Symmetrical Domain & Cluster creation, and Bulk PDF Batch Ingestion.
 */

window.openAddPaperModal = function(tab = 'single') {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'viewer') || 'viewer').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot add papers. Ingestion requires Owner or Editor role.`, 'warning');
    return;
  }

  initPaperModalDropzones();

  // Reset Single Form
  const form = document.getElementById('form-add-paper') || document.getElementById('add-paper-form');
  if (form) form.reset();

  // Reset DOI status
  const doiStatus = document.getElementById('doi-fetch-status');
  if (doiStatus) {
    doiStatus.textContent = '';
    doiStatus.style.display = 'none';
  }

  const doiInput = document.getElementById('add-paper-doi');
  if (doiInput) doiInput.value = '';

  // Reset input fields
  const titleEl = document.getElementById('add-paper-title');
  const authorsEl = document.getElementById('add-paper-authors');
  const yearEl = document.getElementById('add-paper-year');
  const pubEl = document.getElementById('add-paper-pub');
  if (titleEl) titleEl.value = '';
  if (authorsEl) authorsEl.value = '';
  if (yearEl) yearEl.value = '';
  if (pubEl) pubEl.value = '';

  // Reset bulk list
  const bulkInput = document.getElementById('upload-file-input');
  if (bulkInput) bulkInput.value = '';
  const bulkList = document.getElementById('selected-files-list');
  if (bulkList) {
    bulkList.innerHTML = '';
    bulkList.style.display = 'none';
  }
  const bulkStatus = document.getElementById('upload-status');
  if (bulkStatus) bulkStatus.innerHTML = '';

  // Reset upload trackers
  const singleTracker = document.getElementById('single-upload-tracker');
  if (singleTracker) singleTracker.style.display = 'none';
  const bulkTracker = document.getElementById('bulk-upload-tracker');
  if (bulkTracker) bulkTracker.style.display = 'none';

  // Reset staged column values and abstract
  window._stagedColumnValues = {};
  window._stagedAbstract = '';
  const colBadge = document.getElementById('add-paper-columns-badge');
  if (colBadge) {
    colBadge.textContent = 'Auto-populated from DOI';
    colBadge.style.color = 'var(--text-tertiary)';
  }

  clearSelectedAddPaperFile();
  renderAddPaperDynamicColumns();
  switchAddPaperTab('single');
  openModal('upload-modal-overlay');
};

window.renderAddPaperDynamicColumns = function() {
  const section = document.getElementById('add-paper-columns-section');
  const fields = document.getElementById('add-paper-columns-fields');
  if (!section || !fields) return;

  const rawCols = window.activeDataColumns || window.activeClusterColumns || [];
  const seen = new Set();
  const eligibleCols = [];

  rawCols.forEach(col => {
    if (col.parent_column_id) return;
    const name = (col.column_name || col.name || '').trim();
    if (!name || seen.has(name.toLowerCase())) return;
    const lower = name.toLowerCase();
    if (['title', 'authors', 'year', 'pub', 'publication', 'doi'].includes(lower)) return;
    seen.add(lower);
    eligibleCols.push(col);
  });

  if (eligibleCols.length === 0) {
    section.style.display = 'none';
    fields.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  fields.innerHTML = eligibleCols.map(col => {
    const colName = col.column_name || col.name;
    const staged = (window._stagedColumnValues && (window._stagedColumnValues[col.id] || window._stagedColumnValues[colName])) || '';
    return `
      <div class="form-group" style="margin-bottom: 0;">
        <label class="form-label" style="font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.25rem;">
          ${escapeHtml(colName)}
        </label>
        <input type="text" class="form-input custom-col-input" 
          data-col-id="${col.id}" 
          data-col-name="${escapeHtml(colName)}"
          id="custom-col-${col.id}" 
          placeholder="Enter ${escapeHtml(colName)}..."
          style="font-size: 0.82rem; padding: 0.35rem 0.65rem;"
          value="${escapeHtml(staged)}">
      </div>
    `;
  }).join('');
};

let _doiDebounceTimer = null;
window.handleDoiInputDebounced = function(val) {
  clearTimeout(_doiDebounceTimer);
  if (!val || typeof val !== 'string') return;
  const clean = val.trim();
  if (clean.includes('10.') || /^\d{4}\.\d{4,5}/.test(clean) || clean.toLowerCase().startsWith('arxiv:')) {
    _doiDebounceTimer = setTimeout(() => {
      window.fetchPaperDoiMetadata();
    }, 700);
  }
};

window.handleDoiPaste = function(e) {
  setTimeout(() => {
    const input = document.getElementById('add-paper-doi');
    if (input && input.value.trim()) {
      window.fetchPaperDoiMetadata();
    }
  }, 60);
};

window.populateDomainDropdowns = function() {
  const selects = [
    document.getElementById('add-paper-domain-select'),
    document.getElementById('bulk-paper-domain-select')
  ];

  // Extract from loaded papers and registered custom domains
  const existingSet = new Set();
  if (Array.isArray(allPapers)) {
    allPapers.forEach(p => {
      if (p.domain && typeof p.domain === 'string') {
        const d = p.domain.trim();
        if (d && d !== '__new__') {
          existingSet.add(d);
        }
      }
    });
  }

  if (Array.isArray(window._customDomains)) {
    window._customDomains.forEach(d => {
      if (d && d.trim()) existingSet.add(d.trim());
    });
  }

  const domainList = Array.from(existingSet);
  domainList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  selects.forEach(sel => {
    if (!sel) return;
    const curVal = sel.value;
    const isBulk = sel.id.includes('bulk');
    
    if (domainList.length === 0) {
      sel.innerHTML = `
        <option value="">-- No Domains Created Yet --</option>
        <option value="__new__" selected>+ Create &amp; Assign New Domain...</option>
      `;
      sel.value = '__new__';
      const targetGroupId = isBulk ? 'bulk-paper-inline-domain-group' : 'add-paper-inline-domain-group';
      const group = document.getElementById(targetGroupId);
      if (group) group.style.display = 'block';
    } else {
      sel.innerHTML = `
        <option value="">-- Select Existing Domain --</option>
        ${domainList.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
        <option value="__new__">+ Create &amp; Assign New Domain...</option>
      `;
      if (curVal && domainList.includes(curVal)) {
        sel.value = curVal;
      } else {
        sel.value = domainList[0];
      }
    }
  });
};

window.handleClusterSelectChange = function(selectEl, mode) {
  const isBulk = mode === 'bulk' || selectEl.id === 'upload-target-cluster';
  const targetGroupId = isBulk ? 'bulk-paper-inline-cluster-group' : 'add-paper-inline-cluster-group';
  const group = document.getElementById(targetGroupId);
  if (group) {
    group.style.display = selectEl.value === '__new__' ? 'block' : 'none';
    if (selectEl.value === '__new__') {
      const input = group.querySelector('input');
      if (input) setTimeout(() => input.focus(), 60);
    }
  }
};

window.handleDomainSelectChange = function(selectEl, mode) {
  const isBulk = mode === 'bulk' || selectEl.id === 'bulk-paper-domain-select';
  const targetGroupId = isBulk ? 'bulk-paper-inline-domain-group' : 'add-paper-inline-domain-group';
  const group = document.getElementById(targetGroupId);
  if (group) {
    group.style.display = selectEl.value === '__new__' ? 'block' : 'none';
    if (selectEl.value === '__new__') {
      const input = group.querySelector('input');
      if (input) setTimeout(() => input.focus(), 60);
    }
  }
};

window.switchAddPaperTab = function(tab) {
  const singleTab = document.getElementById('add-paper-tab-single');
  const bulkTab = document.getElementById('add-paper-tab-bulk');
  const singleBtn = document.getElementById('tab-btn-add-single');
  const bulkBtn = document.getElementById('tab-btn-add-bulk');

  if (tab === 'single' || tab === 'manual') {
    if (singleTab) singleTab.style.display = 'block';
    if (bulkTab) bulkTab.style.display = 'none';
    if (singleBtn) {
      singleBtn.classList.add('gold', 'active');
      singleBtn.style.color = '#0a0e1a';
    }
    if (bulkBtn) {
      bulkBtn.classList.remove('gold', 'active');
      bulkBtn.style.color = '';
    }
  } else {
    if (bulkTab) bulkTab.style.display = 'block';
    if (singleTab) singleTab.style.display = 'none';
    if (bulkBtn) {
      bulkBtn.classList.add('gold', 'active');
      bulkBtn.style.color = '#0a0e1a';
    }
    if (singleBtn) {
      singleBtn.classList.remove('gold', 'active');
      singleBtn.style.color = '';
    }
  }
};

window.fetchPaperDoiMetadata = async function() {
  const doiInput = document.getElementById('add-paper-doi');
  if (!doiInput) return;
  const doi = doiInput.value.trim();
  if (!doi) {
    showToast('Please enter a DOI identifier (e.g. 10.1016/j.knosys.2021.107455)', 'warning');
    return;
  }

  const btnText = document.getElementById('doi-fetch-btn-text');
  const statusEl = document.getElementById('doi-fetch-status');
  if (btnText) btnText.textContent = 'Fetching...';
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = 'Contacting CrossRef & Semantic Scholar engines...';
    statusEl.style.color = 'var(--accent-gold)';
  }

  try {
    const res = await fetch(`/api/doi/lookup?doi=${encodeURIComponent(doi)}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('DOI metadata lookup returned no results.');
    const data = await res.json();

    const titleEl = document.getElementById('add-paper-title');
    const authorsEl = document.getElementById('add-paper-authors');
    const yearEl = document.getElementById('add-paper-year');
    const pubEl = document.getElementById('add-paper-pub');

    if (data.title && titleEl) titleEl.value = data.title;
    if (data.authors && authorsEl) authorsEl.value = data.authors;
    if (data.year && yearEl) yearEl.value = data.year;
    if (data.pub && pubEl) pubEl.value = data.pub;

    // Cache abstract/intuition
    window._stagedAbstract = data.abstract || '';

    // Auto-fill and map into survey dynamic columns
    if (!window._stagedColumnValues) window._stagedColumnValues = {};
    const cols = window.activeDataColumns || window.activeClusterColumns || [];

    cols.forEach(col => {
      const cLower = (col.column_name || col.name || '').toLowerCase().trim();
      const colId = col.id;
      let matchedVal = null;
      if (cLower === 'doi') matchedVal = data.doi;
      else if (cLower === 'year' || cLower === 'publication year') matchedVal = data.year;
      else if (cLower === 'authors' || cLower === 'author') matchedVal = data.authors;
      else if (['pub', 'publisher', 'venue', 'journal', 'conference'].includes(cLower)) matchedVal = data.pub;
      else if (['abstract', 'intuition', 'summary', 'overview'].includes(cLower)) matchedVal = data.abstract;
      else if (['url', 'link'].includes(cLower)) matchedVal = data.url || `https://doi.org/${data.doi}`;

      if (matchedVal) {
        window._stagedColumnValues[colId] = matchedVal;
        window._stagedColumnValues[col.column_name || col.name] = matchedVal;
        const inputEl = document.getElementById(`custom-col-${colId}`);
        if (inputEl) {
          inputEl.value = matchedVal;
          inputEl.style.borderColor = 'var(--accent-emerald)';
        }
      }
    });

    // Re-render columns to display newly filled values
    window.renderAddPaperDynamicColumns();

    const colBadge = document.getElementById('add-paper-columns-badge');
    if (colBadge) {
      colBadge.textContent = '✅ Metadata & columns auto-populated';
      colBadge.style.color = 'var(--accent-emerald)';
    }

    if (statusEl) {
      statusEl.textContent = `Auto-filled: "${data.title ? data.title.substring(0, 45) + '...' : 'Metadata loaded'}"`;
      statusEl.style.color = 'var(--accent-emerald)';
    }
    showToast('Metadata & column values successfully fetched from CrossRef & Semantic Scholar!', 'success');
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Failed: ' + err.message;
      statusEl.style.color = 'var(--accent-rose)';
    }
    showToast(err.message, 'error');
  } finally {
    if (btnText) btnText.textContent = 'Auto-Fetch';
  }
};

window.handleAddPaperFileSelected = function(input) {
  const file = input.files && input.files[0];
  const preview = document.getElementById('add-paper-file-preview');
  const nameEl = document.getElementById('selected-file-display-name');
  const sizeEl = document.getElementById('selected-file-display-size');
  const dropLabel = document.getElementById('add-paper-dropzone-label');

  if (file) {
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    if (preview) preview.style.display = 'flex';
    if (dropLabel) dropLabel.textContent = `Attached: ${file.name}`;

    // Autofill title from filename if title is empty
    const titleInput = document.getElementById('add-paper-title');
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    }
  } else {
    clearSelectedAddPaperFile();
  }
};

window.clearSelectedAddPaperFile = function(e) {
  if (e) e.stopPropagation();
  const fileInput = document.getElementById('add-paper-file-input');
  const preview = document.getElementById('add-paper-file-preview');
  const dropLabel = document.getElementById('add-paper-dropzone-label');
  if (fileInput) fileInput.value = '';
  if (preview) preview.style.display = 'none';
  if (dropLabel) dropLabel.textContent = 'Click to Browse PDF or Drag & Drop File Here';
};

window.clearBulkFilesSelection = function(e) {
  if (e) e.stopPropagation();
  const fileInput = document.getElementById('upload-file-input');
  const listEl = document.getElementById('selected-files-list');
  const submitBtn = document.getElementById('btn-submit-upload');
  if (fileInput) fileInput.value = '';
  if (listEl) {
    listEl.innerHTML = '';
    listEl.style.display = 'none';
  }
  if (submitBtn) submitBtn.textContent = 'Batch Add PDFs';
};

window.handleBulkFilesSelected = function(input) {
  const files = input.files || [];
  const listEl = document.getElementById('selected-files-list');
  const submitBtn = document.getElementById('btn-submit-upload');

  if (files.length === 0) {
    window.clearBulkFilesSelection();
    return;
  }

  if (listEl) {
    listEl.style.display = 'block';
    listEl.innerHTML = `
      <div style="font-weight: 700; font-size: 0.84rem; color: var(--accent-gold); margin-bottom: 0.45rem; display: flex; justify-content: space-between; align-items: center;">
        <span>Selected Files (${files.length} PDFs)</span>
        <button type="button" class="mini-btn danger" style="padding: 0.18rem 0.5rem; font-size: 0.74rem;" onclick="clearBulkFilesSelection(event)">Clear All</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.35rem;">
        ${Array.from(files).map((f, i) => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface-raised); padding: 0.35rem 0.6rem; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border-base);">
            <div style="display: flex; align-items: center; gap: 0.45rem; overflow: hidden;">
              <span style="color: var(--accent-gold); font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.74rem;">#${i + 1}</span>
              <span style="color: var(--text-primary); font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(f.name)}</span>
            </div>
            <span style="color: var(--text-tertiary); font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; flex-shrink: 0;">${(f.size / (1024 * 1024)).toFixed(2)} MB</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (submitBtn) {
    submitBtn.textContent = `Batch Add ${files.length} PDFs to Matrix`;
  }
};

window.initPaperModalDropzones = function() {
  const singleDropzone = document.getElementById('add-paper-dropzone');
  const singleInput = document.getElementById('add-paper-file-input');
  if (singleDropzone && singleInput) {
    ['dragenter', 'dragover'].forEach(name => {
      singleDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        singleDropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      singleDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        singleDropzone.classList.remove('drag-over');
      });
    });
    singleDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        singleInput.files = e.dataTransfer.files;
        handleAddPaperFileSelected(singleInput);
      }
    });
  }

  const bulkDropzone = document.getElementById('pdf-dropzone');
  const bulkInput = document.getElementById('upload-file-input');
  if (bulkDropzone && bulkInput) {
    ['dragenter', 'dragover'].forEach(name => {
      bulkDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        bulkDropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      bulkDropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        bulkDropzone.classList.remove('drag-over');
      });
    });
    bulkDropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        bulkInput.files = e.dataTransfer.files;
        handleBulkFilesSelected(bulkInput);
      }
    });
  }
};

window.submitAddPaperForm = async function(e) {
  if (e) e.preventDefault();

  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${(currentProjectRole || 'viewer').toUpperCase()}' cannot add papers.`, 'warning');
    return;
  }

  const titleEl = document.getElementById('add-paper-title');
  const authorsEl = document.getElementById('add-paper-authors');
  const yearEl = document.getElementById('add-paper-year');
  const pubEl = document.getElementById('add-paper-pub');
  const doiEl = document.getElementById('add-paper-doi');

  // If DOI is provided, but Title or Authors is empty or '-', automatically fetch metadata first!
  if (doiEl && doiEl.value.trim() && doiEl.value.trim() !== '-') {
    const rawTitle = titleEl ? titleEl.value.trim() : '';
    const rawAuthors = authorsEl ? authorsEl.value.trim() : '';
    if (!rawTitle || rawTitle === '-' || !rawAuthors || rawAuthors === '-') {
      try {
        await window.fetchPaperDoiMetadata();
      } catch (autoErr) {
        console.warn('Auto DOI fetch before submit notice:', autoErr.message);
      }
    }
  }

  // If user doesn't fill any default text box, fill it up with '-'
  if (titleEl && !titleEl.value.trim()) titleEl.value = '-';
  if (authorsEl && !authorsEl.value.trim()) authorsEl.value = '-';
  if (yearEl && !yearEl.value.trim()) yearEl.value = '-';
  if (pubEl && !pubEl.value.trim()) pubEl.value = '-';
  if (doiEl && !doiEl.value.trim()) doiEl.value = '-';

  const title = (titleEl && titleEl.value.trim()) ? titleEl.value.trim() : '-';
  const authors = (authorsEl && authorsEl.value.trim()) ? authorsEl.value.trim() : '-';
  const year = (yearEl && yearEl.value.trim()) ? yearEl.value.trim() : '-';
  const pub = (pubEl && pubEl.value.trim()) ? pubEl.value.trim() : '-';
  const doi = (doiEl && doiEl.value.trim()) ? doiEl.value.trim() : '-';
  const domain = '-';
  const status = 'unread';

  // Gather dynamic column inputs
  const customCols = {};
  const customInputs = document.querySelectorAll('#add-paper-columns-fields .custom-col-input');
  customInputs.forEach(inp => {
    const colId = inp.dataset.colId;
    const val = inp.value.trim();
    if (colId && val) {
      customCols[colId] = val;
    }
  });
  if (window._stagedColumnValues) {
    for (const [k, v] of Object.entries(window._stagedColumnValues)) {
      if (!customCols[k] && v) customCols[k] = v;
    }
  }

  const fileInput = document.getElementById('add-paper-file-input');
  const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

  const btnSubmit = document.getElementById('btn-submit-single-paper');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = hasFile ? 'Uploading Research Paper...' : 'Adding Research Paper...';
  }

  const singleTracker = document.getElementById('single-upload-tracker');
  const singleNameEl = document.getElementById('single-tracker-name');
  const singleFillEl = document.getElementById('single-tracker-fill');
  const singlePctEl = document.getElementById('single-tracker-pct');
  const singleRateEl = document.getElementById('single-tracker-rate');
  const singleBytesEl = document.getElementById('single-tracker-bytes');
  const singleEtaEl = document.getElementById('single-tracker-eta');

  try {
    if (hasFile) {
      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('project_id', activeProjectId);
      formData.append('title', title);
      formData.append('authors', authors);
      formData.append('year', year);
      formData.append('pub', pub);
      formData.append('status', 'unread');
      formData.append('domain', domain);
      formData.append('doi', doi);
      formData.append('skip_extraction', 'true');
      if (window._stagedAbstract) formData.append('intuition', window._stagedAbstract);
      if (Object.keys(customCols).length > 0) formData.append('custom_columns', JSON.stringify(customCols));

      if (singleTracker) {
        singleTracker.style.display = 'block';
        if (singleNameEl) singleNameEl.textContent = file.name;
        if (singleFillEl) singleFillEl.style.width = '0%';
        if (singlePctEl) singlePctEl.textContent = '0%';
        if (singleRateEl) singleRateEl.textContent = '⚡ Starting...';
        const fileMb = (file.size / (1024 * 1024)).toFixed(1);
        if (singleBytesEl) singleBytesEl.textContent = `0 MB / ${fileMb} MB`;
        if (singleEtaEl) singleEtaEl.textContent = '⏱ ETA: --';
      }

      if (typeof window.uploadWithProgress === 'function') {
        await window.uploadWithProgress({
          url: '/api/upload',
          method: 'POST',
          formData,
          onProgress: ({ percent, rateStr, bytesStr, etaStr, isComplete }) => {
            if (singleFillEl) singleFillEl.style.width = `${percent}%`;
            if (singlePctEl) singlePctEl.textContent = `${percent}%`;
            if (singleRateEl) singleRateEl.textContent = isComplete ? '⚡ Complete' : rateStr;
            if (singleBytesEl) singleBytesEl.textContent = bytesStr;
            if (singleEtaEl) singleEtaEl.textContent = isComplete ? '⚡ Saving paper...' : etaStr;
          }
        });
      } else {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: getAuthHeaders(false),
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to upload paper');
        }
      }
    } else {
      const payload = {
        project_id: activeProjectId,
        cluster_id: null,
        title,
        authors,
        year,
        pub,
        status: 'unread',
        domain,
        doi,
        intuition: window._stagedAbstract || '-',
        custom_columns: customCols,
        keywords: []
      };

      const res = await fetch('/api/papers', {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create paper');
      }
    }

    closeModal('upload-modal-overlay');
    showToast(hasFile ? 'Research Paper & PDF Document uploaded successfully!' : 'Research Paper added successfully!', 'success');

    if (typeof loadPapers === 'function') await loadPapers();
    if (typeof loadClusters === 'function') await loadClusters();
    if (typeof loadStats === 'function') await loadStats();
    if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
  } catch (err) {
    showToast('Failed to add paper: ' + err.message, 'error');
  } finally {
    if (singleTracker) singleTracker.style.display = 'none';
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Add Research Paper to Matrix';
    }
  }
};

window.submitBulkPdfUpload = async function() {
  const userRole = (typeof currentProjectRole !== 'undefined' && currentProjectRole) ? currentProjectRole : (window.currentProjectRole || 'viewer');
  if (['reviewer', 'viewer'].includes(userRole.toLowerCase())) {
    showToast(`[Read-Only] Role '${userRole.toUpperCase()}' cannot batch upload papers.`, 'warning');
    return;
  }

  const fileInput = document.getElementById('upload-file-input');
  const files = fileInput ? fileInput.files : [];
  if (!files || files.length === 0) {
    showToast('Please select one or more PDF files to upload', 'warning');
    return;
  }

  // Target cluster (if selector exists)
  const clusterSel = document.getElementById('upload-target-cluster');
  let clusterId = clusterSel ? clusterSel.value : '';
  let newClusterName = '';
  if (clusterId === '__new__') {
    const newClusterInput = document.getElementById('bulk-paper-new-cluster-name');
    newClusterName = (newClusterInput && newClusterInput.value.trim()) ? newClusterInput.value.trim() : '';
  }
  const targetClusterNum = (clusterId && clusterId !== 'unassigned' && clusterId !== '__new__') ? parseInt(clusterId, 10) : null;

  // Target Domain (if selector exists)
  const domainSel = document.getElementById('bulk-paper-domain-select');
  let domain = domainSel ? domainSel.value : 'General';
  let newDomainName = '';
  if (domain === '__new__') {
    const newDomainInput = document.getElementById('bulk-paper-new-domain-name');
    newDomainName = (newDomainInput && newDomainInput.value.trim()) ? newDomainInput.value.trim() : '';
    domain = newDomainName || 'General';
  }

  const btnSubmit = document.getElementById('btn-submit-upload');
  const statusEl = document.getElementById('upload-status');
  const bulkTracker = document.getElementById('bulk-upload-tracker');
  const bulkNameEl = document.getElementById('bulk-tracker-name');
  const bulkFillEl = document.getElementById('bulk-tracker-fill');
  const bulkPctEl = document.getElementById('bulk-tracker-pct');
  const bulkRateEl = document.getElementById('bulk-tracker-rate');
  const bulkBytesEl = document.getElementById('bulk-tracker-bytes');
  const bulkEtaEl = document.getElementById('bulk-tracker-eta');

  let totalBatchBytes = 0;
  for (let i = 0; i < files.length; i++) {
    totalBatchBytes += files[i].size || 0;
  }
  const totalBatchMb = (totalBatchBytes / (1024 * 1024)).toFixed(1);

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = `Ingesting ${files.length} Research PDFs...`;
  }
  if (statusEl) {
    statusEl.innerHTML = `<span style="color: var(--accent-gold);">Starting upload of ${files.length} files (${totalBatchMb} MB)...</span>`;
  }
  if (bulkTracker) {
    bulkTracker.style.display = 'block';
    if (bulkNameEl) bulkNameEl.textContent = `${files.length} Manuscript PDFs (${totalBatchMb} MB)`;
    if (bulkFillEl) bulkFillEl.style.width = '0%';
    if (bulkPctEl) bulkPctEl.textContent = '0%';
    if (bulkRateEl) bulkRateEl.textContent = '⚡ Starting...';
    if (bulkBytesEl) bulkBytesEl.textContent = `0 MB / ${totalBatchMb} MB`;
    if (bulkEtaEl) bulkEtaEl.textContent = '⏱ ETA: --';
  }

  try {
    const formData = new FormData();
    const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
    formData.append('project_id', pid);
    if (targetClusterNum) formData.append('cluster_id', targetClusterNum);
    if (newClusterName) formData.append('new_cluster_name', newClusterName);
    formData.append('domain', domain || 'General');
    if (newDomainName) formData.append('new_domain_name', newDomainName);
    formData.append('skip_extraction', 'true');

    for (let i = 0; i < files.length; i++) {
      formData.append('pdf', files[i]);
    }

    let resData;
    if (typeof window.uploadWithProgress === 'function') {
      resData = await window.uploadWithProgress({
        url: '/api/upload',
        method: 'POST',
        formData,
        onProgress: ({ percent, rateStr, bytesStr, etaStr, isComplete }) => {
          if (bulkFillEl) bulkFillEl.style.width = `${percent}%`;
          if (bulkPctEl) bulkPctEl.textContent = `${percent}%`;
          if (bulkRateEl) bulkRateEl.textContent = isComplete ? '⚡ Complete' : rateStr;
          if (bulkBytesEl) bulkBytesEl.textContent = bytesStr;
          if (bulkEtaEl) bulkEtaEl.textContent = isComplete ? '⚡ Saving papers...' : etaStr;
          if (statusEl) {
            statusEl.innerHTML = isComplete
              ? `<span style="color: var(--accent-gold);">⚡ Saving batch papers to database...</span>`
              : `<span style="color: var(--accent-primary);">Uploading ${files.length} PDFs (${percent}% at ${rateStr})...</span>`;
          }
        }
      });
    } else {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload batch PDFs');
      }

      resData = await res.json();
    }

    closeModal('upload-modal-overlay');
    showToast(`Successfully ingested ${resData.ingested_count || files.length} PDF papers into the Master Matrix!`, 'success');

    if (typeof loadPapers === 'function') await loadPapers();
    if (typeof loadStats === 'function') await loadStats();
    if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: var(--accent-rose);">Upload failed: ${escapeHtml(err.message)}</span>`;
    }
    showToast('Batch ingestion failed: ' + err.message, 'error');
  } finally {
    if (bulkTracker) bulkTracker.style.display = 'none';
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Batch Add PDFs';
    }
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
