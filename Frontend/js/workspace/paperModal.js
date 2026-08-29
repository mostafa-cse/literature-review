/**
 * LITNEXIS ADD PAPER MODAL & METADATA INGESTION ENGINE
 * Supports Single Paper Ingestion, CrossRef DOI Auto-Fetch, File Browser PDF Uploads,
 * Symmetrical Domain & Cluster creation, and Bulk PDF Batch Ingestion.
 */

window.openAddPaperModal = function(tab = 'single') {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'owner') || 'owner').toLowerCase();
  if (['reviewer', 'viewer'].includes(role)) {
    showToast(`[Read-Only] Role '${role.toUpperCase()}' cannot add papers. Ingestion requires Owner or Editor role.`, 'warning');
    return;
  }

  // Populate clusters & domains
  if (typeof populateClusterDropdowns === 'function') populateClusterDropdowns();
  populateDomainDropdowns();
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

  // Pre-select cluster if in focus
  const clusterSel = document.getElementById('add-paper-cluster');
  if (clusterSel && currentClusterId && currentClusterId !== 'all') {
    clusterSel.value = currentClusterId;
  }

  const bulkClusterSel = document.getElementById('upload-target-cluster');
  if (bulkClusterSel && currentClusterId && currentClusterId !== 'all') {
    bulkClusterSel.value = currentClusterId;
  }

  // Hide inline groups
  const inlineClusterGroup = document.getElementById('add-paper-inline-cluster-group');
  if (inlineClusterGroup) inlineClusterGroup.style.display = 'none';

  const inlineDomainGroup = document.getElementById('add-paper-inline-domain-group');
  if (inlineDomainGroup) inlineDomainGroup.style.display = 'none';

  const bulkInlineClusterGroup = document.getElementById('bulk-paper-inline-cluster-group');
  if (bulkInlineClusterGroup) bulkInlineClusterGroup.style.display = 'none';

  const bulkInlineDomainGroup = document.getElementById('bulk-paper-inline-domain-group');
  if (bulkInlineDomainGroup) bulkInlineDomainGroup.style.display = 'none';

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

  clearSelectedAddPaperFile();
  switchAddPaperTab('single');
  openModal('upload-modal-overlay');
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
    statusEl.textContent = 'Contacting CrossRef & OpenAlex metadata engines...';
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

    if (statusEl) {
      statusEl.textContent = `Auto-filled: "${data.title ? data.title.substring(0, 45) + '...' : 'Metadata loaded'}"`;
      statusEl.style.color = 'var(--accent-emerald)';
    }
    showToast('Metadata successfully fetched from CrossRef!', 'success');
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
  const title = titleEl ? titleEl.value.trim() : '';
  if (!title) {
    showToast('Paper Title is required', 'warning');
    return;
  }

  const clusterSel = document.getElementById('add-paper-cluster');
  let clusterId = clusterSel ? clusterSel.value : '';

  // Handle inline cluster creation
  if (clusterId === '__new__') {
    const newClusterInput = document.getElementById('add-paper-new-cluster-name');
    const newClusterName = newClusterInput ? newClusterInput.value.trim() : '';
    if (!newClusterName) {
      showToast('Please enter a name for the new cluster', 'warning');
      return;
    }

    try {
      const cRes = await fetch('/api/clusters', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ project_id: activeProjectId, name: newClusterName, color: '#38bdf8' })
      });
      if (cRes.ok) {
        const newC = await cRes.json();
        clusterId = newC.id;
        if (typeof loadClusters === 'function') await loadClusters();
      }
    } catch (cErr) {
      console.warn('Failed inline cluster creation:', cErr);
    }
  }

  // Handle Domain Selection & Inline Creation
  const domainSel = document.getElementById('add-paper-domain-select');
  let domain = domainSel ? domainSel.value : '';
  if (domain === '__new__' || (!domain && domainSel)) {
    const newDomainInput = document.getElementById('add-paper-new-domain-name');
    domain = (newDomainInput && newDomainInput.value.trim()) ? newDomainInput.value.trim() : '';
  }
  if (domain) {
    if (!window._customDomains) window._customDomains = [];
    if (!window._customDomains.includes(domain)) window._customDomains.push(domain);
    if (typeof window.registerCustomDomain === 'function') {
      window.registerCustomDomain(domain);
    }
  }

  const authorsEl = document.getElementById('add-paper-authors');
  const yearEl = document.getElementById('add-paper-year');
  const pubEl = document.getElementById('add-paper-pub');
  const doiEl = document.getElementById('add-paper-doi');

  const authors = authorsEl ? authorsEl.value.trim() : '';
  const year = yearEl ? yearEl.value.trim() : '';
  const pub = pubEl ? pubEl.value.trim() : '';
  const status = 'unread';
  const doi = doiEl ? doiEl.value.trim() : '';

  const fileInput = document.getElementById('add-paper-file-input');
  const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

  const btnSubmit = document.getElementById('btn-submit-single-paper');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = hasFile ? 'Uploading Paper Document...' : 'Adding Paper...';
  }

  try {
    let targetClusterNum = (clusterId && clusterId !== 'unassigned' && clusterId !== '__new__') ? parseInt(clusterId, 10) : null;

    if (hasFile) {
      const formData = new FormData();
      formData.append('pdf', fileInput.files[0]);
      formData.append('project_id', activeProjectId);
      if (targetClusterNum) formData.append('cluster_id', targetClusterNum);
      formData.append('title', title);
      formData.append('authors', authors || 'Academic Researchers');
      formData.append('year', year || new Date().getFullYear());
      formData.append('pub', pub);
      formData.append('status', 'unread');
      formData.append('domain', domain || '');
      formData.append('doi', doi);

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload paper');
      }
    } else {
      const payload = {
        project_id: activeProjectId,
        cluster_id: targetClusterNum,
        title,
        authors: authors || 'Academic Researchers',
        year: year ? parseInt(year, 10) : new Date().getFullYear(),
        pub,
        status: 'unread',
        domain: domain || '',
        doi,
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

    if (typeof populateDomainDropdowns === 'function') populateDomainDropdowns();
    if (typeof loadPapers === 'function') await loadPapers();
    if (typeof loadStats === 'function') await loadStats();
    if (typeof loadSynthesisInsights === 'function') await loadSynthesisInsights();
  } catch (err) {
    showToast('Failed to add paper: ' + err.message, 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Add Paper to Matrix';
    }
  }
};

window.submitBulkPdfUpload = async function() {
  if (['reviewer', 'viewer'].includes(currentProjectRole)) {
    showToast(`[Read-Only] Role '${(currentProjectRole || 'viewer').toUpperCase()}' cannot batch upload papers.`, 'warning');
    return;
  }

  const fileInput = document.getElementById('upload-file-input');
  const files = fileInput ? fileInput.files : [];
  if (!files || files.length === 0) {
    showToast('Please select one or more PDF files to upload', 'warning');
    return;
  }

  const clusterSel = document.getElementById('upload-target-cluster');
  let clusterId = clusterSel ? clusterSel.value : '';

  // Handle inline cluster creation for bulk
  let newClusterName = '';
  if (clusterId === '__new__') {
    const newClusterInput = document.getElementById('bulk-paper-new-cluster-name');
    newClusterName = newClusterInput ? newClusterInput.value.trim() : '';
    if (!newClusterName) {
      showToast('Please enter a name for the new target cluster', 'warning');
      return;
    }

    try {
      const cRes = await fetch('/api/clusters', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ project_id: activeProjectId, name: newClusterName, color: '#38bdf8' })
      });
      if (cRes.ok) {
        const newC = await cRes.json();
        clusterId = newC.id;
        if (typeof loadClusters === 'function') await loadClusters();
      }
    } catch (cErr) {
      console.warn('Failed inline bulk cluster creation:', cErr);
    }
  }

  // Handle Bulk Domain Selection & Inline Creation
  const domainSel = document.getElementById('bulk-paper-domain-select');
  let domain = domainSel ? domainSel.value : 'General';
  let newDomainName = '';
  if (domain === '__new__') {
    const newDomainInput = document.getElementById('bulk-paper-new-domain-name');
    newDomainName = (newDomainInput && newDomainInput.value.trim()) ? newDomainInput.value.trim() : '';
    domain = newDomainName || 'General';
  }
  if (domain && domain !== 'General' && typeof window.registerCustomDomain === 'function') {
    window.registerCustomDomain(domain);
  }

  const targetClusterNum = (clusterId && clusterId !== 'unassigned' && clusterId !== '__new__') ? parseInt(clusterId, 10) : null;

  const btnSubmit = document.getElementById('btn-submit-upload');
  const statusEl = document.getElementById('upload-status');

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = `Ingesting ${files.length} PDFs...`;
  }
  if (statusEl) {
    statusEl.innerHTML = `<span style="color: var(--accent-gold);">Ingesting and extracting metadata from ${files.length} files...</span>`;
  }

  try {
    const formData = new FormData();
    formData.append('project_id', activeProjectId);
    if (targetClusterNum) formData.append('cluster_id', targetClusterNum);
    if (newClusterName) formData.append('new_cluster_name', newClusterName);
    formData.append('domain', domain || 'General');
    if (newDomainName) formData.append('new_domain_name', newDomainName);

    for (let i = 0; i < files.length; i++) {
      formData.append('pdf', files[i]);
    }

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: formData
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to upload batch PDFs');
    }

    const resData = await res.json();
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
