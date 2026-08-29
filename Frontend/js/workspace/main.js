/**
 * LITNEXIS WORKSPACE MASTER CONTROLLER
 * Bootstraps workspace, loads projects, clusters, papers, dynamic columns, and manages UI filters.
 */

window.init = async function () {
  const path = window.location.pathname;
  const isSharedTokenView = path.startsWith('/shared/');
  const shareToken = isSharedTokenView ? path.replace('/shared/', '').split('/')[0].split('?')[0] : null;

  if (isSharedTokenView && shareToken) {
    // Public / Supervisor Read-Only Share Link Mode
    await window.initNavbarUser(); // Populates user info if logged in, but doesn't block if not
    bindWorkspaceEventListeners();
    await loadSharedProject(shareToken);
    return;
  }

  const isAuth = await window.initNavbarUser();
  if (!isAuth) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    return;
  }

  // Parse URL search parameters
  const params = new URLSearchParams(window.location.search);
  const projParam = params.get('project');
  const clusterParam = params.get('cluster');

  if (projParam) {
    const parsedPid = parseInt(projParam, 10);
    if (!isNaN(parsedPid)) {
      activeProjectId = parsedPid;
      window.activeProjectId = parsedPid;
    }
  }
  if (clusterParam) {
    currentClusterId = clusterParam;
    window.currentClusterId = clusterParam;
  }

  // Bind Global Event Listeners
  bindWorkspaceEventListeners();

  // Load Project Hierarchy
  await loadProjects();
  await loadClusters();
  await loadDynamicColumns();
  await loadPapers();
  await loadStats();
  await loadSynthesisInsights();

  // If cluster URL parameter was provided, activate cluster focus
  if (clusterParam && clusterParam !== 'all') {
    exploreCluster(clusterParam);
  }
};

window.loadSharedProject = async function (token) {
  try {
    const res = await fetch(`/api/public/shared/${token}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Shared research review not found or link has expired.');
    }
    const data = await res.json();
    const p = data.project;

    activeProjectId = p.id;
    window.activeProjectId = p.id;
    currentProjectRole = 'viewer';
    window.currentProjectRole = 'viewer';
    allProjects = [p];
    allClusters = data.clusters || [];
    allPapers = data.papers || [];
    activeClusterColumns = data.columns || [];

    // Render Project metadata
    const surveyTitleEl = document.getElementById('project-title') || document.getElementById('hero-survey-title');
    const surveyDescEl = document.getElementById('project-description') || document.getElementById('hero-survey-desc');
    const activeSurveyPillName = document.getElementById('active-survey-pill-name') || document.getElementById('active-survey-name');

    if (surveyTitleEl) {
      surveyTitleEl.innerHTML = p.name ? `Literature Survey on <span style="color: var(--accent-gold);">${escapeHtml(p.name)}</span>` : 'Literature Survey';
    }
    if (surveyDescEl) {
      surveyDescEl.textContent = p.description || 'Comprehensive systematic literature review, multi-level taxonomy benchmarking, and master matrix synthesis.';
    }
    if (activeSurveyPillName) activeSurveyPillName.textContent = p.name;
    document.title = p.name ? `Literature Survey on ${p.name} | LitNexis` : 'Literature Review Workspace | LitNexis';
    if (typeof window.initDescReadMore === 'function') window.initDescReadMore();

    // Show Public / Supervisor banner
    renderSharedNoticeBanner(p.name);

    // Render components
    renderClustersList();
    renderClusterFilters();

    // Check unassigned papers
    unassignedPapers = allPapers.filter(paper => !paper.cluster_id);
    renderUnassignedBox();
    populateDomainDropdown();
    applyFilters();
    await loadStats();
    await loadSynthesisInsights();
  } catch (err) {
    showToast(err.message, 'error');
    const main = document.querySelector('main');
    if (main) {
      main.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem; color: var(--accent-rose);">
          <div style="margin-bottom: 0.75rem; color: var(--accent-rose); display: flex; justify-content: center;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <h2 style="font-size: 1.5rem; color: var(--text-primary); font-weight: 800; margin-bottom: 0.5rem;">Shared Survey Unavailable</h2>
          <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto 1.5rem; font-size: 0.95rem;">${escapeHtml(err.message)}</p>
          <a href="/dashboard" class="action-btn" style="text-decoration: none;">Return to Dashboard</a>
        </div>
      `;
    }
  }
};

function renderSharedNoticeBanner(projectName) {
  const existing = document.getElementById('shared-notice-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'shared-notice-banner';
  banner.style.cssText = `
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(212, 175, 55, 0.1) 100%);
    border: 1px solid rgba(56, 189, 248, 0.35);
    padding: 0.8rem 1.4rem;
    border-radius: 10px;
    margin: 1.25rem auto 0;
    max-width: 1400px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    font-size: 0.88rem;
    color: var(--text-primary);
  `;
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.65rem;">
      <div style="color: var(--accent-primary); display: flex; align-items: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
      <div>
        <strong>Public Supervisor &amp; Reviewer View:</strong> You are viewing <em>"${escapeHtml(projectName)}"</em> in live read-only mode.
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 0.6rem;">
      <span class="role-badge-pill role-viewer">VIEWER</span>
      <a href="/login" class="mini-btn gold" style="text-decoration: none;">Sign In ↗</a>
    </div>
  `;

  const hero = document.querySelector('.hero') || document.querySelector('main');
  if (hero) hero.parentNode.insertBefore(banner, hero);

  // Hide write buttons in shared view
  const btnAddPaper = document.getElementById('btn-add-paper');
  const btnTeam = document.getElementById('btn-open-team');
  const btnShare = document.getElementById('btn-share-project');
  const btnAddCluster = document.getElementById('btn-add-cluster');
  if (btnAddPaper) btnAddPaper.style.display = 'none';
  if (btnTeam) btnTeam.style.display = 'none';
  if (btnShare) btnShare.style.display = 'none';
  if (btnAddCluster) btnAddCluster.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.loadProjects = async function () {
  try {
    const res = await fetch('/api/projects', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load surveys');
    allProjects = await res.json();

    const projSelect = document.getElementById('active-project-select');
    const surveyTitleEl = document.getElementById('project-title') || document.getElementById('hero-survey-title');
    const surveyDescEl = document.getElementById('project-description') || document.getElementById('hero-survey-desc');
    const activeSurveyPillName = document.getElementById('active-survey-pill-name') || document.getElementById('active-survey-name');

    let curProj = (Array.isArray(allProjects) && allProjects.length > 0)
      ? (allProjects.find(p => String(p.id) === String(activeProjectId)) || (activeProjectId ? null : allProjects[0]))
      : null;

    // Direct fallback fetch if specific survey not present in initial array
    if (!curProj && activeProjectId) {
      try {
        const singleRes = await fetch(`/api/projects/${activeProjectId}`, { headers: getAuthHeaders() });
        if (singleRes.ok) {
          curProj = await singleRes.json();
          if (Array.isArray(allProjects)) {
            allProjects.unshift(curProj);
          } else {
            allProjects = [curProj];
          }
        }
      } catch (_) { }
    }

    if (!curProj && Array.isArray(allProjects) && allProjects.length > 0) {
      curProj = allProjects[0];
    }

    if (curProj) {
      activeProjectId = curProj.id;
      window.activeProjectId = curProj.id;
      currentProjectRole = (curProj.current_user_role || curProj.user_role || 'owner').toLowerCase();
      window.currentProjectRole = currentProjectRole;
      if (surveyTitleEl) {
        surveyTitleEl.innerHTML = curProj.name ? `Literature Survey on <span style="color: var(--accent-gold);">${escapeHtml(curProj.name)}</span>` : 'Literature Survey';
      }
      if (surveyDescEl) {
        surveyDescEl.textContent = curProj.description || 'Comprehensive systematic literature review, multi-level taxonomy benchmarking, and master matrix synthesis.';
      }
      if (activeSurveyPillName) activeSurveyPillName.textContent = curProj.name;
      document.title = curProj.name ? `Literature Survey on ${curProj.name} | LitNexis` : 'Literature Review Workspace | LitNexis';
      // Show / hide the "Read more" button based on actual overflow
      if (typeof window.initDescReadMore === 'function') window.initDescReadMore();
    }

    if (projSelect && Array.isArray(allProjects)) {
      projSelect.innerHTML = '';
      allProjects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.style.background = '#0f172a';
        opt.style.color = '#f8fafc';
        if (String(p.id) === String(activeProjectId)) opt.selected = true;
        projSelect.appendChild(opt);
      });
      projSelect.onchange = (e) => {
        const url = new URL(window.location.href);
        url.searchParams.set('project', e.target.value);
        url.searchParams.delete('cluster');
        window.location.href = url.toString();
      };
    }

    // Try to get effective role from /api/projects/:id/my-role
    try {
      const myRoleRes = await fetch(`/api/projects/${activeProjectId}/my-role`, { headers: getAuthHeaders() });
      if (myRoleRes.ok) {
        const roleData = await myRoleRes.json();
        if (roleData.role) {
          currentProjectRole = roleData.role.toLowerCase();
          window.currentProjectRole = currentProjectRole;
        }
      }
    } catch (_) { }

    applyWorkspaceRolePermissions();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.applyWorkspaceRolePermissions = function () {
  const role = (window.currentProjectRole || 'viewer').toLowerCase();
  const isOwner = role === 'owner';
  const isEditor = role === 'editor';
  const canModify = isOwner || isEditor;

  // 1. Update Role Badge Pill in Workspace Header
  const roleBadge = document.getElementById('workspace-role-badge') || document.getElementById('active-survey-role-badge');
  if (roleBadge) {
    roleBadge.className = `role-badge-pill role-${role}`;
    roleBadge.textContent = role.toUpperCase();
    roleBadge.title = `Current Project Role: ${role.toUpperCase()}`;
  }

  // 2. Add Cluster buttons
  const addClusterBtns = document.querySelectorAll('.btn-add-cluster, #btn-new-cluster, #btn-add-cluster, [data-action="add-cluster"]');
  addClusterBtns.forEach(btn => {
    btn.style.display = canModify ? 'inline-flex' : 'none';
  });

  // 3. Add Paper buttons
  const addPaperBtns = document.querySelectorAll('.btn-add-paper, #btn-open-add-paper, #btn-add-paper, #focus-banner-add-btn, [data-action="add-paper"]');
  addPaperBtns.forEach(btn => {
    btn.style.display = canModify ? 'inline-flex' : 'none';
  });

  // 4. Edit Cluster focus banner button
  const editClusterBannerBtn = document.getElementById('focus-banner-edit-btn');
  if (editClusterBannerBtn) {
    editClusterBannerBtn.style.display = canModify ? 'inline-block' : 'none';
  }

  // 5. Add Column & Split Column buttons
  const addColBtns = document.querySelectorAll('.btn-add-column, #btn-open-add-col, #btn-add-col, [data-action="add-column"]');
  addColBtns.forEach(btn => {
    btn.style.display = canModify ? 'inline-flex' : 'none';
  });
  const splitColBtns = document.querySelectorAll('.btn-split-column, #btn-open-split-col, [data-action="split-column"]');
  splitColBtns.forEach(btn => {
    btn.style.display = canModify ? 'inline-flex' : 'none';
  });

  // 6. Team modal invite bar (Owner Only)
  const addMemberBar = document.getElementById('team-add-member-bar');
  const readOnlyNotice = document.getElementById('team-readonly-notice');
  const currentRoleLabel = document.getElementById('team-current-role-label');
  if (addMemberBar) addMemberBar.style.display = isOwner ? 'block' : 'none';
  if (readOnlyNotice) {
    readOnlyNotice.style.display = isOwner ? 'none' : 'block';
    if (currentRoleLabel) currentRoleLabel.textContent = role.toUpperCase();
  }
};

window.loadPapers = async function () {
  try {
    const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || 1);
    const res = await fetch(`/api/papers?project_id=${pid}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load papers');
    allPapers = await res.json();

    // Check unassigned papers
    unassignedPapers = allPapers.filter(p => !p.cluster_id);
    renderUnassignedBox();

    // Populate Domain filter options dynamically
    populateDomainDropdown();

    // Populate Column Search options dynamically
    if (typeof populateSearchColumnDropdown === 'function') {
      populateSearchColumnDropdown();
    }

    // Apply active filters
    applyFilters();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.registerCustomDomain = function (newDomain) {
  if (!newDomain || typeof newDomain !== 'string') return;
  const trimmed = newDomain.trim();
  if (!trimmed || trimmed.toLowerCase() === 'general') return;

  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
    ? activeProjectId
    : (new URLSearchParams(window.location.search).get('project') || 1);

  const storageKey = 'workspace_custom_domains_' + projId;
  let customDomains = [];
  try {
    customDomains = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(customDomains)) customDomains = [];
  } catch (e) {
    customDomains = [];
  }

  if (!customDomains.some(d => d.toLowerCase() === trimmed.toLowerCase())) {
    customDomains.push(trimmed);
    localStorage.setItem(storageKey, JSON.stringify(customDomains));
  }

  if (typeof window.populateDomainDropdown === 'function') {
    window.populateDomainDropdown();
  }
  if (typeof window.populateDomainSelects === 'function') {
    window.populateDomainSelects();
  }
};

window.populateDomainDropdown = function () {
  const domainFilter = document.getElementById('filter-domain');
  if (!domainFilter) return;

  const currentVal = currentDomain || domainFilter.value || 'all';
  const existingSet = new Set();

  // 1. Collect all domains from currently loaded papers in workspace
  (allPapers || []).forEach(p => {
    if (p.domain && typeof p.domain === 'string') {
      p.domain.split(/[,;/]+/).map(d => d.trim()).filter(Boolean).forEach(d => existingSet.add(d));
    }
  });

  // 2. Collect any user-created or registered custom domains
  const projId = (typeof activeProjectId !== 'undefined' && activeProjectId)
    ? activeProjectId
    : (new URLSearchParams(window.location.search).get('project') || 1);
  const storageKey = 'workspace_custom_domains_' + projId;
  try {
    const savedCustom = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(savedCustom)) {
      savedCustom.forEach(d => {
        if (d && typeof d === 'string' && d.trim()) existingSet.add(d.trim());
      });
    }
  } catch (e) { }

  // Filter out General for custom list, sort case-insensitively
  const domainList = Array.from(existingSet).filter(d => d && d.toLowerCase() !== 'general');
  domainList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const hasGeneral = Array.from(existingSet).some(d => d.toLowerCase() === 'general') || existingSet.size === 0;

  domainFilter.innerHTML = `
    <option value="all">All Domains</option>
    ${hasGeneral ? '<option value="General">General</option>' : ''}
    ${domainList.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
  `;

  // Preserve selected domain if valid
  const matchInSet = Array.from(existingSet).find(d => d.toLowerCase() === (currentVal || '').toLowerCase());
  if (currentVal && (currentVal === 'all' || matchInSet)) {
    const finalVal = matchInSet || currentVal;
    domainFilter.value = finalVal;
    currentDomain = finalVal;
  } else {
    domainFilter.value = 'all';
    currentDomain = 'all';
  }
};

window.unassignedViewMode = 'cards'; // 'cards' | 'table'

function renderUnassignedBox() {
  const section = document.getElementById('unassigned-section');
  const countBadge = document.getElementById('unassigned-count-badge');
  const modalCountBadge = document.getElementById('unassigned-modal-count-badge');

  if (!section) return;

  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'owner') || 'viewer').toLowerCase();
  const isOwnerOrEditor = role === 'owner' || role === 'editor' || role === 'admin';

  // Rule: Unassigned Papers Box is visible ONLY to Owner and Editor
  if (!isOwnerOrEditor || !unassignedPapers || unassignedPapers.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const countText = `${unassignedPapers.length} ${unassignedPapers.length === 1 ? 'Paper' : 'Papers'}`;
  if (countBadge) countBadge.textContent = countText;
  if (modalCountBadge) modalCountBadge.textContent = countText;

  // If modal is active, update its dynamic content
  const modalOverlay = document.getElementById('unassigned-modal-overlay');
  if (modalOverlay && (modalOverlay.classList.contains('active') || modalOverlay.classList.contains('open'))) {
    renderUnassignedModalContent();
  }
}

window.openUnassignedModal = function () {
  const role = (window.currentProjectRole || (typeof currentProjectRole !== 'undefined' ? currentProjectRole : 'owner') || 'viewer').toLowerCase();
  if (role !== 'owner' && role !== 'editor' && role !== 'admin') {
    showToast(`Role '${role.toUpperCase()}' cannot access the Unassigned Papers Hub.`, 'warning');
    return;
  }

  // Populate bulk cluster select
  const bulkSel = document.getElementById('unassigned-bulk-cluster-select');
  if (bulkSel) {
    bulkSel.innerHTML = '<option value="">Move selected to...</option>' +
      (allClusters || []).map(c => `<option value="${c.id}">${escapeHtml(c.name || '')}</option>`).join('');
  }

  // Reset selection
  const selectAllCb = document.getElementById('unassigned-modal-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateUnassignedSelectedCount();

  renderUnassignedModalContent();
  openModal('unassigned-modal-overlay');
};

window.unassignedSearchQuery = '';

window.handleUnassignedSearch = function (query) {
  window.unassignedSearchQuery = (query || '').toLowerCase().trim();
  renderUnassignedModalContent();
};

window.switchUnassignedView = function (mode) {
  window.unassignedViewMode = mode || 'cards';
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');

  if (btnCards) btnCards.classList.toggle('active', window.unassignedViewMode === 'cards');
  if (btnTable) btnTable.classList.toggle('active', window.unassignedViewMode === 'table');

  renderUnassignedModalContent();
};

window.renderUnassignedModalContent = function () {
  const container = document.getElementById('unassigned-modal-content');
  if (!container) return;

  if (!unassignedPapers || unassignedPapers.length === 0) {
    container.innerHTML = `
      <div class="unassigned-empty-state">
        <div class="unassigned-empty-icon">🎉</div>
        <div class="unassigned-empty-title">All Papers Assigned!</div>
        <p class="unassigned-empty-desc">
          Every research paper in this systematic review is currently organized into a taxonomy cluster.
        </p>
      </div>
    `;
    return;
  }

  // Filter papers by search query if any
  let displayList = unassignedPapers;
  const q = window.unassignedSearchQuery;
  if (q) {
    displayList = unassignedPapers.filter(p =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.authors && p.authors.toLowerCase().includes(q)) ||
      (p.pub && p.pub.toLowerCase().includes(q)) ||
      (p.domain && p.domain.toLowerCase().includes(q)) ||
      (p.year && String(p.year).includes(q))
    );
  }

  if (displayList.length === 0) {
    container.innerHTML = `
      <div class="unassigned-empty-state">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
        <div class="unassigned-empty-title">No matching unassigned papers</div>
        <p class="unassigned-empty-desc">
          No papers match your search <em>"${escapeHtml(q)}"</em>. Try a different search term.
        </p>
        <button class="action-btn" style="margin-top: 0.5rem; background: var(--bg-surface-raised); border: 1px solid var(--border-base);" onclick="document.getElementById('unassigned-filter-search').value=''; handleUnassignedSearch('');">
          Clear Search
        </button>
      </div>
    `;
    return;
  }

  if (window.unassignedViewMode === 'table') {
    // Table View: strictly contains only Paper Title, Author Name, Publisher Name, Publish Year + actions
    container.innerHTML = `
      <div class="unassigned-table-wrapper">
        <table class="unassigned-table">
          <thead>
            <tr>
              <th style="width: 44px; text-align: center;">#</th>
              <th style="width: 48px; text-align: center;">Select</th>
              <th style="min-width: 280px;">Paper Title</th>
              <th style="min-width: 180px;">Author Name</th>
              <th style="min-width: 160px;">Publisher / Venue</th>
              <th style="width: 115px; text-align: center;">Publish Year</th>
              <th style="min-width: 260px; text-align: right;">Cluster Assignment &amp; Review</th>
            </tr>
          </thead>
          <tbody>
            ${displayList.map((p, idx) => `
              <tr class="unassigned-table-row" data-paper-id="${p.id}">
                <td style="text-align: center; color: var(--text-tertiary); font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600;">${idx + 1}</td>
                <td style="text-align: center;">
                  <input type="checkbox" class="unassigned-paper-cb" value="${p.id}" onchange="updateUnassignedSelectedCount()">
                </td>
                <td>
                  <div class="unassigned-table-title" onclick="openPaperForReview(${p.id}, event)" title="Click to open paper in split-screen review mode">
                    ${escapeHtml(p.title)}
                  </div>
                  <div style="display: flex; gap: 0.4rem; align-items: center; margin-top: 5px; flex-wrap: wrap;">
                    ${p.domain ? `<span class="unassigned-tag domain">${escapeHtml(p.domain)}</span>` : ''}
                    ${p.doi ? `<span class="unassigned-tag doi" title="DOI: ${escapeHtml(p.doi)}">DOI: ${escapeHtml(p.doi.length > 25 ? p.doi.substring(0, 25) + '...' : p.doi)}</span>` : ''}
                  </div>
                </td>
                <td class="unassigned-table-text">
                  <span class="unassigned-cell-author">${escapeHtml(p.authors || 'Academic Researchers')}</span>
                </td>
                <td class="unassigned-table-text">
                  <span class="unassigned-cell-pub">${escapeHtml(p.pub || '—')}</span>
                </td>
                <td style="text-align: center;">
                  <span class="unassigned-year-badge">${p.year || '—'}</span>
                </td>
                <td style="text-align: right;">
                  <div class="unassigned-row-actions">
                    <select class="form-select unassigned-inline-select" id="assign-sel-${p.id}">
                      <option value="">-- Choose Cluster --</option>
                      ${(allClusters || []).map(c => `<option value="${c.id}">${escapeHtml(c.name || '')}</option>`).join('')}
                    </select>
                    <button class="action-btn gold mini-btn unassigned-assign-btn" onclick="assignSingleUnassignedPaper(${p.id})">
                      Assign
                    </button>
                    <button class="action-btn mini-btn unassigned-review-btn" onclick="openPaperForReview(${p.id}, event)" title="Open in Split-Screen Review Workspace">
                      📖 Review
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    // Cards View
    container.innerHTML = `
      <div class="unassigned-modal-grid">
        ${displayList.map(p => `
          <div class="unassigned-hub-card" data-paper-id="${p.id}">
            <div class="unassigned-card-top">
              <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                <span class="unassigned-tag domain">${escapeHtml(p.domain || 'General')}</span>
                ${p.year ? `<span class="unassigned-year-badge">${p.year}</span>` : ''}
                ${p.doi ? `<span class="unassigned-tag doi">DOI</span>` : ''}
              </div>
              <label class="unassigned-card-cb-label" title="Select paper">
                <input type="checkbox" class="unassigned-paper-cb" value="${p.id}" onchange="updateUnassignedSelectedCount()">
              </label>
            </div>

            <h4 class="unassigned-hub-title" onclick="openPaperForReview(${p.id}, event)" title="Click to open paper in split-screen review mode">
              ${escapeHtml(p.title)}
            </h4>

            <div class="unassigned-hub-meta">
              <div class="unassigned-meta-item">
                <span class="unassigned-meta-icon">👤</span>
                <span>${escapeHtml(p.authors || 'Academic Researchers')}</span>
              </div>
              ${p.pub ? `
                <div class="unassigned-meta-item">
                  <span class="unassigned-meta-icon">🏛️</span>
                  <span style="font-style: italic;">${escapeHtml(p.pub)}</span>
                </div>
              ` : ''}
            </div>

            <div class="unassigned-card-actions-row">
              <select class="form-select unassigned-inline-select" id="assign-sel-${p.id}" style="flex: 1;">
                <option value="">-- Choose Cluster --</option>
                ${(allClusters || []).map(c => `<option value="${c.id}">${escapeHtml(c.name || '')}</option>`).join('')}
              </select>
              <button class="action-btn gold mini-btn unassigned-assign-btn" onclick="assignSingleUnassignedPaper(${p.id})">
                Assign
              </button>
              <button class="action-btn mini-btn unassigned-review-btn" onclick="openPaperForReview(${p.id}, event)" title="Open in Split-Screen Review Workspace">
                📖 Review
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  updateUnassignedSelectedCount();
};

window.openPaperForReview = function (paperId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const pid = (typeof activeProjectId !== 'undefined' && activeProjectId)
    ? activeProjectId
    : (window.currentProjectId || (new URLSearchParams(window.location.search)).get('project') || 1);

  window.open(`/review?project=${pid}&paper=${paperId}`, '_blank');
};

window.assignSingleUnassignedPaper = async function (paperId) {
  const sel = document.getElementById(`assign-sel-${paperId}`);
  if (!sel || !sel.value) {
    showToast('Please select a target cluster', 'warning');
    return;
  }
  const clusterId = parseInt(sel.value, 10);
  const targetCluster = (allClusters || []).find(c => c.id === clusterId);
  const clusterName = targetCluster ? (targetCluster.name || 'Selected Cluster') : 'Selected Cluster';

  // 1. Trigger live visual vanish animation on the specific card and table row
  const cardElem = document.querySelector(`.unassigned-hub-card[data-paper-id="${paperId}"]`);
  const rowElem = document.querySelector(`.unassigned-table-row[data-paper-id="${paperId}"]`);
  const targetElems = [cardElem, rowElem].filter(Boolean);

  targetElems.forEach(el => {
    el.classList.add('paper-vanish-animating');
  });

  try {
    const res = await fetch(`/api/papers/${paperId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ cluster_id: clusterId })
    });
    if (res.ok) {
      targetElems.forEach(el => {
        el.classList.add('paper-vanished');
      });

      // Update in-memory state immediately
      if (window.allPapers) {
        const p = window.allPapers.find(x => x.id === paperId);
        if (p) p.cluster_id = clusterId;
      }
      window.unassignedPapers = (window.allPapers || []).filter(p => !p.cluster_id);

      showToast(`Assigned paper to "${clusterName}" successfully!`, 'success');

      // Update counter badges live
      const countBadge = document.getElementById('unassigned-count-badge');
      const modalCountBadge = document.getElementById('unassigned-modal-count-badge');
      const countText = `${window.unassignedPapers.length} ${window.unassignedPapers.length === 1 ? 'Paper' : 'Papers'}`;
      if (countBadge) countBadge.textContent = countText;
      if (modalCountBadge) modalCountBadge.textContent = countText;

      // Animate cluster highlight
      if (typeof window.highlightClusterCard === 'function') {
        window.highlightClusterCard(clusterId);
      }

      // Smooth DOM removal and live sync
      setTimeout(async () => {
        targetElems.forEach(el => el.remove());
        renderUnassignedModalContent();
        await loadPapers();
        await loadClusters();
        await loadStats();
        await loadSynthesisInsights();
        renderUnassignedBox();
        if (typeof window.highlightClusterCard === 'function') {
          window.highlightClusterCard(clusterId);
        }
      }, 320);

    } else {
      targetElems.forEach(el => el.classList.remove('paper-vanish-animating'));
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to assign paper');
    }
  } catch (err) {
    targetElems.forEach(el => el.classList.remove('paper-vanish-animating'));
    showToast('Failed to assign paper: ' + err.message, 'error');
  }
};

window.toggleAllUnassigned = function (check) {
  const cbs = document.querySelectorAll('.unassigned-paper-cb');
  cbs.forEach(cb => {
    cb.checked = check;
  });
  updateUnassignedSelectedCount();
};

window.updateUnassignedSelectedCount = function () {
  const allCbs = document.querySelectorAll('.unassigned-paper-cb');
  const checked = document.querySelectorAll('.unassigned-paper-cb:checked');
  const count = checked.length;
  const label = document.getElementById('unassigned-selected-label');
  const selectAllCb = document.getElementById('unassigned-modal-select-all');
  const bulkBtn = document.getElementById('btn-unassigned-bulk-move');

  if (label) {
    label.innerHTML = `<span class="unassigned-count-pill"><span class="unassigned-count-num">${count}</span> Selected</span>`;
    label.classList.toggle('has-selection', count > 0);
  }

  if (selectAllCb) {
    if (allCbs.length > 0 && checked.length === allCbs.length) {
      selectAllCb.checked = true;
      selectAllCb.indeterminate = false;
    } else if (checked.length > 0 && checked.length < allCbs.length) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = true;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
  }

  if (bulkBtn) {
    if (count > 0) {
      bulkBtn.classList.add('has-active-selection');
      bulkBtn.style.opacity = '1';
    } else {
      bulkBtn.classList.remove('has-active-selection');
      bulkBtn.style.opacity = '0.75';
    }
  }

  // Update card and row highlighted visual states
  document.querySelectorAll('.unassigned-hub-card').forEach(card => {
    const cb = card.querySelector('.unassigned-paper-cb');
    card.classList.toggle('is-selected', !!(cb && cb.checked));
  });

  document.querySelectorAll('.unassigned-table-row').forEach(row => {
    const cb = row.querySelector('.unassigned-paper-cb');
    row.classList.toggle('is-selected', !!(cb && cb.checked));
  });
};

window.submitBulkUnassignedMove = async function () {
  const checked = Array.from(document.querySelectorAll('.unassigned-paper-cb:checked')).map(cb => parseInt(cb.value, 10));
  const sel = document.getElementById('unassigned-bulk-cluster-select');
  const targetClusterId = sel ? sel.value : '';

  if (checked.length === 0) {
    showToast('Please select at least one unassigned paper', 'warning');
    return;
  }
  if (!targetClusterId) {
    showToast('Please choose target cluster for bulk transfer', 'warning');
    return;
  }

  const clusterId = parseInt(targetClusterId, 10);
  const targetCluster = (allClusters || []).find(c => c.id === clusterId);
  const clusterName = targetCluster ? (targetCluster.name || 'Selected Cluster') : 'Selected Cluster';

  // 1. Live vanishing animation on all checked cards & rows
  const targetElems = [];
  checked.forEach(id => {
    const card = document.querySelector(`.unassigned-hub-card[data-paper-id="${id}"]`);
    const row = document.querySelector(`.unassigned-table-row[data-paper-id="${id}"]`);
    if (card) targetElems.push(card);
    if (row) targetElems.push(row);
  });

  targetElems.forEach(el => {
    el.classList.add('paper-vanish-animating');
  });

  try {
    const res = await fetch('/api/papers/bulk-reassign', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        paper_ids: checked,
        cluster_id: clusterId
      })
    });
    if (res.ok) {
      targetElems.forEach(el => el.classList.add('paper-vanished'));

      // Update in memory
      if (window.allPapers) {
        window.allPapers.forEach(p => {
          if (checked.includes(p.id)) p.cluster_id = clusterId;
        });
      }
      window.unassignedPapers = (window.allPapers || []).filter(p => !p.cluster_id);

      showToast(`Transferred ${checked.length} papers to "${clusterName}"!`, 'success');

      // Update counts immediately
      const countBadge = document.getElementById('unassigned-count-badge');
      const modalCountBadge = document.getElementById('unassigned-modal-count-badge');
      const countText = `${window.unassignedPapers.length} ${window.unassignedPapers.length === 1 ? 'Paper' : 'Papers'}`;
      if (countBadge) countBadge.textContent = countText;
      if (modalCountBadge) modalCountBadge.textContent = countText;

      // Animate cluster highlight
      if (typeof window.highlightClusterCard === 'function') {
        window.highlightClusterCard(clusterId);
      }

      // Smooth DOM removal and live sync
      setTimeout(async () => {
        targetElems.forEach(el => el.remove());
        renderUnassignedModalContent();
        await loadPapers();
        await loadClusters();
        await loadStats();
        await loadSynthesisInsights();
        renderUnassignedBox();
        if (typeof window.highlightClusterCard === 'function') {
          window.highlightClusterCard(clusterId);
        }
      }, 320);

    } else {
      targetElems.forEach(el => el.classList.remove('paper-vanish-animating'));
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Bulk transfer failed');
    }
  } catch (err) {
    targetElems.forEach(el => el.classList.remove('paper-vanish-animating'));
    showToast('Bulk transfer failed: ' + (err.message || 'Unknown error'), 'error');
  }
};

window.applyFilters = function () {
  let filtered = [...allPapers];

  // 1. Cluster filter
  if (currentClusterId && currentClusterId !== 'all') {
    if (currentClusterId === 'unassigned') {
      filtered = filtered.filter(p => !p.cluster_id);
    } else {
      filtered = filtered.filter(p => String(p.cluster_id) === String(currentClusterId));
    }
  }

  // 2. Domain filter
  if (currentDomain && currentDomain !== 'all') {
    const targetDomain = currentDomain.toLowerCase();
    filtered = filtered.filter(p => {
      const pDomain = (p.domain || 'General').toLowerCase();
      if (pDomain === targetDomain) return true;
      const parts = pDomain.split(/[,;/]+/).map(d => d.trim().toLowerCase());
      return parts.includes(targetDomain);
    });
  }

  // 3. Status filter
  if (currentStatus && currentStatus !== 'all') {
    filtered = filtered.filter(p => (p.status || 'unread') === currentStatus);
  }

  // 4. Search query filter (Specific column or Global across all columns)
  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    const colTarget = window.searchColumnTarget || (document.getElementById('search-column-select')?.value) || 'all';

    filtered = filtered.filter(p => {
      // If user selected a specific standard column:
      if (colTarget === 'title') return (p.title || '').toLowerCase().includes(q);
      if (colTarget === 'authors') return (p.authors || '').toLowerCase().includes(q);
      if (colTarget === 'year') return String(p.year || '').toLowerCase().includes(q);
      if (colTarget === 'pub') return (p.pub || '').toLowerCase().includes(q);
      if (colTarget === 'domain') return (p.domain || '').toLowerCase().includes(q);
      if (colTarget === 'cluster') return (p.cluster_name || '').toLowerCase().includes(q);
      if (colTarget === 'status') return (p.status || '').toLowerCase().includes(q);
      if (colTarget === 'keywords') return Array.isArray(p.keywords) && p.keywords.some(k => (k || '').toLowerCase().includes(q));
      if (colTarget === 'doi') return (p.doi || '').toLowerCase().includes(q) || (p.pdf_url || '').toLowerCase().includes(q);

      // If user selected a specific custom dynamic column:
      if (colTarget.startsWith('dyn_')) {
        const dynKey = colTarget.replace(/^dyn_/, '');
        if (p.custom_columns && typeof p.custom_columns === 'object') {
          for (const [k, v] of Object.entries(p.custom_columns)) {
            if (k.toLowerCase() === dynKey.toLowerCase() || String(k) === String(dynKey)) {
              return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
            }
          }
        }
        return false;
      }

      // Default: 'all' -> Search across ALL column values and properties
      if ((p.title || '').toLowerCase().includes(q)) return true;
      if ((p.authors || '').toLowerCase().includes(q)) return true;
      if (String(p.year || '').toLowerCase().includes(q)) return true;
      if ((p.pub || '').toLowerCase().includes(q)) return true;
      if ((p.domain || '').toLowerCase().includes(q)) return true;
      if ((p.cluster_name || '').toLowerCase().includes(q)) return true;
      if ((p.status || '').toLowerCase().includes(q)) return true;
      if ((p.doi || '').toLowerCase().includes(q)) return true;
      if ((p.pdf_url || '').toLowerCase().includes(q)) return true;

      // Legacy conceptual columns
      if ((p.intuition || '').toLowerCase().includes(q)) return true;
      if ((p.equation || '').toLowerCase().includes(q)) return true;
      if ((p.strengths || '').toLowerCase().includes(q)) return true;
      if ((p.gaps || '').toLowerCase().includes(q)) return true;

      // Keywords array
      if (Array.isArray(p.keywords) && p.keywords.some(k => (k || '').toLowerCase().includes(q))) return true;

      // Dynamic custom columns
      if (p.custom_columns && typeof p.custom_columns === 'object') {
        const customValues = Object.values(p.custom_columns);
        for (const val of customValues) {
          if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
            return true;
          }
        }
      }

      // Fallback
      for (const [key, val] of Object.entries(p)) {
        if (key === 'custom_columns' || key === 'keywords') continue;
        if (typeof val === 'string' && val.toLowerCase().includes(q)) return true;
        if (typeof val === 'number' && String(val).toLowerCase().includes(q)) return true;
      }

      return false;
    });
  }

  if (typeof renderMasterMatrix === 'function') {
    renderMasterMatrix(filtered);
  }
};

window.populateSearchColumnDropdown = function () {
  const searchColSel = document.getElementById('search-column-select');
  if (!searchColSel) return;

  const dynOptGroup = document.getElementById('search-dyn-cols-group');
  if (!dynOptGroup) return;

  const currentVal = window.searchColumnTarget || searchColSel.value || 'all';

  const cols = (typeof window.getOrderedColumnsList === 'function')
    ? window.getOrderedColumnsList()
    : (window.activeDataColumns || []);

  const dynamicCols = (cols || []).filter(c => c.isDynamic || (c.key && c.key.startsWith('dyn_')));

  dynOptGroup.innerHTML = '';
  if (dynamicCols.length === 0) {
    dynOptGroup.style.display = 'none';
  } else {
    dynOptGroup.style.display = '';
    dynamicCols.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.key || `dyn_${c.name}`;
      opt.textContent = c.name || c.column_name;
      dynOptGroup.appendChild(opt);
    });
  }

  if (currentVal && searchColSel.querySelector(`option[value="${currentVal}"]`)) {
    searchColSel.value = currentVal;
    window.searchColumnTarget = currentVal;
  } else {
    searchColSel.value = 'all';
    window.searchColumnTarget = 'all';
  }
};

window.resetAllFilters = function () {
  currentClusterId = 'all';
  window.currentClusterId = 'all';
  currentDomain = 'all';
  window.currentDomain = 'all';
  currentStatus = 'all';
  window.currentStatus = 'all';
  searchQuery = '';
  window.searchQuery = '';
  window.searchColumnTarget = 'all';

  const clusterFilter = document.getElementById('filter-cluster') || document.getElementById('filter-cluster-select');
  if (clusterFilter) clusterFilter.value = 'all';

  const domainFilter = document.getElementById('filter-domain');
  if (domainFilter) domainFilter.value = 'all';

  const statusFilter = document.getElementById('filter-status');
  if (statusFilter) statusFilter.value = 'all';

  const searchColSel = document.getElementById('search-column-select');
  if (searchColSel) searchColSel.value = 'all';

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = '';
    searchInput.placeholder = 'Search papers across all columns...';
  }

  clearClusterFocus();
  applyFilters();
};

window.switchView = function () {
  const tableContainer = document.getElementById('table-container');
  if (tableContainer) tableContainer.style.display = 'block';
};

function bindWorkspaceEventListeners() {
  // Search Box with Debounce
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value.trim();
        applyFilters();
      }, 200);
    });
  }

  // Column Selector for Search
  const searchColSel = document.getElementById('search-column-select');
  if (searchColSel) {
    searchColSel.addEventListener('change', (e) => {
      window.searchColumnTarget = e.target.value;
      const selectedText = searchColSel.options[searchColSel.selectedIndex]?.text || '';
      if (searchInput) {
        if (e.target.value === 'all') {
          searchInput.placeholder = 'Search papers across all columns...';
        } else {
          searchInput.placeholder = `Search specifically by ${selectedText.replace(/^[^\w]+/, '')}...`;
        }
      }
      applyFilters();
    });
  }

  // Filter Dropdowns: Cluster
  const clusterFilter = document.getElementById('filter-cluster') || document.getElementById('filter-cluster-select');
  if (clusterFilter) {
    clusterFilter.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'all') {
        clearClusterFocus();
      } else if (val === 'unassigned') {
        currentClusterId = 'unassigned';
        window.currentClusterId = 'unassigned';
        const url = new URL(window.location.href);
        url.searchParams.delete('cluster');
        window.history.replaceState({}, '', url.toString());
        applyFilters();
      } else {
        exploreCluster(val);
      }
    });
  }

  // Filter Dropdowns: Domain
  const domainFilter = document.getElementById('filter-domain');
  if (domainFilter) {
    domainFilter.addEventListener('change', (e) => {
      currentDomain = e.target.value;
      window.currentDomain = e.target.value;
      applyFilters();
    });
  }

  // Filter Dropdowns: Reading Status
  const statusFilter = document.getElementById('filter-status');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      currentStatus = e.target.value;
      window.currentStatus = e.target.value;
      applyFilters();
    });
  }

  // View switch buttons
  const btnGrid = document.getElementById('btn-grid-view');
  const btnTable = document.getElementById('btn-table-view');
  if (btnGrid) btnGrid.onclick = () => switchView('grid');
  if (btnTable) btnTable.onclick = () => switchView('table');

  // Action toolbar buttons
  const btnAddPaper = document.getElementById('btn-add-paper') || document.getElementById('btn-open-upload');
  if (btnAddPaper) btnAddPaper.onclick = openAddPaperModal;

  const btnTeam = document.getElementById('btn-open-team');
  if (btnTeam) btnTeam.onclick = openTeamModal;

  const btnShare = document.getElementById('btn-share-project');
  if (btnShare) btnShare.onclick = openShareModal;

  const btnExport = document.getElementById('btn-open-export');
  if (btnExport) btnExport.onclick = openExportModal;

  const matrixBtnExport = document.getElementById('matrix-btn-open-export');
  if (matrixBtnExport) matrixBtnExport.onclick = openExportModal;

  const btnCloseExport = document.getElementById('btn-close-export');
  if (btnCloseExport) btnCloseExport.onclick = () => closeModal('export-modal-overlay');

  const btnCancelExport = document.getElementById('btn-cancel-export');
  if (btnCancelExport) btnCancelExport.onclick = () => closeModal('export-modal-overlay');

  const btnCreateCluster = document.getElementById('btn-open-create-cluster');
  if (btnCreateCluster) btnCreateCluster.onclick = openCreateClusterModal;

  const btnFocusAdd = document.getElementById('focus-banner-add-btn');
  if (btnFocusAdd) btnFocusAdd.onclick = openAddPaperModal;

  const btnFocusEdit = document.getElementById('focus-banner-edit-btn');
  if (btnFocusEdit) btnFocusEdit.onclick = () => {
    if (currentClusterId && currentClusterId !== 'all') {
      editCluster(parseInt(currentClusterId, 10));
    }
  };

  const btnRefreshSynth = document.getElementById('btn-refresh-synthesis');
  if (btnRefreshSynth) btnRefreshSynth.onclick = loadSynthesisInsights;

  // Add Paper inline cluster creation select handler
  const addClusterSel = document.getElementById('add-paper-cluster');
  const inlineGroup = document.getElementById('add-paper-inline-cluster-group');
  if (addClusterSel && inlineGroup) {
    addClusterSel.addEventListener('change', (e) => {
      inlineGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
      if (e.target.value === '__new__') {
        const input = inlineGroup.querySelector('input');
        if (input) setTimeout(() => input.focus(), 60);
      }
    });
  }

  const bulkClusterSel = document.getElementById('upload-target-cluster');
  const bulkInlineGroup = document.getElementById('bulk-paper-inline-cluster-group');
  if (bulkClusterSel && bulkInlineGroup) {
    bulkClusterSel.addEventListener('change', (e) => {
      bulkInlineGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
      if (e.target.value === '__new__') {
        const input = bulkInlineGroup.querySelector('input');
        if (input) setTimeout(() => input.focus(), 60);
      }
    });
  }

  const addDomainSel = document.getElementById('add-paper-domain-select');
  const inlineDomainGroup = document.getElementById('add-paper-inline-domain-group');
  if (addDomainSel && inlineDomainGroup) {
    addDomainSel.addEventListener('change', (e) => {
      inlineDomainGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
      if (e.target.value === '__new__') {
        const input = inlineDomainGroup.querySelector('input');
        if (input) setTimeout(() => input.focus(), 60);
      }
    });
  }

  const bulkDomainSel = document.getElementById('bulk-paper-domain-select');
  const bulkInlineDomainGroup = document.getElementById('bulk-paper-inline-domain-group');
  if (bulkDomainSel && bulkInlineDomainGroup) {
    bulkDomainSel.addEventListener('change', (e) => {
      bulkInlineDomainGroup.style.display = e.target.value === '__new__' ? 'block' : 'none';
      if (e.target.value === '__new__') {
        const input = bulkInlineDomainGroup.querySelector('input');
        if (input) setTimeout(() => input.focus(), 60);
      }
    });
  }

  // Cluster Color Hex syncing
  const colorPicker = document.getElementById('modal-cluster-color');
  const hexInput = document.getElementById('modal-cluster-color-hex');
  if (colorPicker && hexInput) {
    colorPicker.addEventListener('input', (e) => hexInput.value = e.target.value);
    hexInput.addEventListener('input', (e) => colorPicker.value = e.target.value);
  }

  // Dynamic Column submit
  const btnSubmitAddCol = document.getElementById('btn-submit-add-col');
  if (btnSubmitAddCol) btnSubmitAddCol.onclick = submitAddDynamicColumn;

  const btnSubmitSplitCol = document.getElementById('btn-submit-split-col');
  if (btnSubmitSplitCol) btnSubmitSplitCol.onclick = submitSplitColumn;

  // Single Paper submit
  const btnSubmitPaper = document.getElementById('btn-submit-single-paper');
  if (btnSubmitPaper) btnSubmitPaper.onclick = submitAddPaperForm;

  // Bulk PDF Upload submit
  const btnSubmitUpload = document.getElementById('btn-submit-upload');
  if (btnSubmitUpload) btnSubmitUpload.onclick = submitBulkPdfUpload;

  // Cluster submit
  const btnSubmitCluster = document.getElementById('btn-submit-cluster');
  if (btnSubmitCluster) btnSubmitCluster.onclick = submitClusterForm;

  // Export submit
  const btnSubmitExport = document.getElementById('btn-submit-export');
  if (btnSubmitExport) btnSubmitExport.onclick = submitExport;

  // Project Switcher
  const projSelect = document.getElementById('active-project-select');
  if (projSelect) {
    projSelect.addEventListener('change', (e) => {
      const url = new URL(window.location.href);
      url.searchParams.set('project', e.target.value);
      url.searchParams.delete('cluster');
      window.location.href = url.toString();
    });
  }
}

// Bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.init();
});

/* ─────────────────────────────────────────────────────────
   HERO DESCRIPTION — READ MORE / READ LESS TOGGLE
───────────────────────────────────────────────────────── */

/**
 * Call this whenever the description text is updated (e.g., after loadProjects()).
 * Shows the "Read more" button only if the text actually overflows 2 lines.
 */
window.initDescReadMore = function () {
  const desc = document.getElementById('project-description');
  const btn = document.getElementById('desc-read-more-btn');
  if (!desc || !btn) return;

  // Reset to clamped state first so we can measure overflow
  desc.classList.remove('expanded');
  btn.classList.remove('expanded');
  btn.innerHTML = 'Read more <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  btn.setAttribute('aria-expanded', 'false');

  // Use a tiny rAF to let the browser paint the clamped layout before measuring
  requestAnimationFrame(() => {
    const isOverflowing = desc.scrollHeight > desc.clientHeight + 2;
    btn.style.display = isOverflowing ? 'inline-flex' : 'none';
  });
};

window.toggleHeroDesc = function () {
  const desc = document.getElementById('project-description');
  const btn = document.getElementById('desc-read-more-btn');
  if (!desc || !btn) return;

  const isExpanded = desc.classList.toggle('expanded');
  btn.classList.toggle('expanded', isExpanded);
  btn.setAttribute('aria-expanded', String(isExpanded));
  btn.innerHTML = isExpanded
    ? 'Read less <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
    : 'Read more <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
};
