/**
 * LITNEXIS RESEARCHER DASHBOARD CONTROLLER (COMPLETE ORIGINAL SPECIFICATION)
 * Manages survey projects, KPI telemetry, preset taxonomy seeders, recent reading queue, and fast DOI ingestion.
 */

let allSurveys = [];
let allStats = {};
let activeTabFilter = 'all';
let surveyViewMode = localStorage.getItem('litnexis_survey_view_mode') || 'cards';
let tableSortColumn = 'newest';
let tableSortAsc = false;

window.initDashboard = async function() {
  const isAuth = await initNavbarUser();
  if (!isAuth) {
    window.location.href = '/login?redirect=/dashboard';
    return;
  }

  // Update greeting with user name
  const cachedUserStr = localStorage.getItem('litnexis_user');
  if (cachedUserStr) {
    try {
      const u = JSON.parse(cachedUserStr);
      const greetingEl = document.getElementById('welcome-user-greeting');
      if (greetingEl) {
        greetingEl.textContent = `Welcome back, ${u.name ? u.name.split(' ')[0] : (u.username || 'Researcher')}`;
      }
    } catch (e) {}
  }

  // Sync initial view mode buttons
  updateViewModeToggleUI();

  // Bind Dashboard Listeners
  bindDashboardEvents();

  // Load Data
  await loadDashboardStats();
  await loadSurveys();
};

function updateViewModeToggleUI() {
  const btnCards = document.getElementById('btn-view-cards');
  const btnTable = document.getElementById('btn-view-table');

  if (btnCards && btnTable) {
    if (surveyViewMode === 'table') {
      btnCards.classList.remove('active');
      btnTable.classList.add('active');
    } else {
      btnCards.classList.add('active');
      btnTable.classList.remove('active');
    }
  }
}

window.setSurveyViewMode = function(mode) {
  surveyViewMode = mode === 'table' ? 'table' : 'cards';
  localStorage.setItem('litnexis_survey_view_mode', surveyViewMode);
  updateViewModeToggleUI();
  applySurveyFilters();
};

window.clearSurveySearch = function() {
  const searchInput = document.getElementById('survey-search-input');
  const clearBtn = document.getElementById('survey-search-clear');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  if (clearBtn) clearBtn.style.display = 'none';
  applySurveyFilters();
};

window.handleTableSort = function(col) {
  if (tableSortColumn === col) {
    tableSortAsc = !tableSortAsc;
  } else {
    tableSortColumn = col;
    tableSortAsc = false;
  }
  applySurveyFilters();
};

window.loadDashboardStats = async function() {
  try {
    const res = await fetch('/api/user/dashboard-stats', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const stats = await res.json();
    allStats = stats;

    const projEl = document.getElementById('kpi-total-surveys');
    const papersEl = document.getElementById('kpi-total-papers');
    const clustersEl = document.getElementById('kpi-clusters-count');
    const screeningsEl = document.getElementById('kpi-screenings-count');
    const compRateEl = document.getElementById('kpi-completion-rate');
    const compSubEl = document.getElementById('kpi-completion-sub');

    const totalSurveys = stats.total_surveys ?? stats.total_projects ?? 0;
    const totalPapers = stats.total_papers ?? 0;
    const read = stats.read_papers || 0;
    const inProgress = stats.in_progress_papers || 0;
    const rate = stats.completion_rate !== undefined ? stats.completion_rate : (totalPapers > 0 ? Math.round((read / totalPapers) * 100) : 0);
    const clusters = stats.clusters_count ?? stats.total_clusters ?? 0;
    const totalScreenings = (stats.screenings_count || 0) + (stats.comments_count || 0);

    if (projEl) projEl.textContent = totalSurveys;
    if (papersEl) papersEl.textContent = totalPapers;
    if (clustersEl) clustersEl.textContent = clusters;
    if (screeningsEl) screeningsEl.textContent = totalScreenings;
    if (compRateEl) compRateEl.textContent = `${rate}%`;
    if (compSubEl) compSubEl.textContent = `${read} Read • ${inProgress} In Progress`;
  } catch (err) {
    console.warn('[Dashboard] Stats error:', err);
  }
};

window.loadSurveys = async function() {
  const container = document.getElementById('surveys-grid-container');
  if (!container) return;

  try {
    const res = await fetch('/api/projects', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load surveys');
    const raw = await res.json();

    // Normalise: API returns `user_role`, frontend filter reads `current_user_role`
    allSurveys = raw.map(p => ({ ...p, current_user_role: p.user_role || p.current_user_role || 'owner' }));

    updateTabCounts();
    applySurveyFilters();
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1/-1; color: var(--accent-rose); text-align: center; padding: 2.5rem;">${err.message}</div>`;
  }
};

function updateTabCounts() {
  const total   = allSurveys.length;
  const owned   = allSurveys.filter(p => (p.current_user_role || '').toLowerCase() === 'owner').length;
  const shared  = allSurveys.filter(p => (p.current_user_role || '').toLowerCase() !== 'owner').length;

  const badge = document.getElementById('surveys-count-badge');
  if (badge) badge.textContent = `${total} Literature Survey${total !== 1 ? 's' : ''}`;

  const tabAll    = document.querySelector('.filter-tab[data-filter="all"]');
  const tabOwned  = document.querySelector('.filter-tab[data-filter="owned"]');
  const tabShared = document.querySelector('.filter-tab[data-filter="shared"]');

  if (tabAll)    tabAll.dataset.count    = total;
  if (tabOwned)  tabOwned.dataset.count  = owned;
  if (tabShared) tabShared.dataset.count = shared;

  // Update visible count chips if they exist
  [tabAll, tabOwned, tabShared].forEach(tab => {
    if (!tab) return;
    let chip = tab.querySelector('.tab-count-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'tab-count-chip';
      tab.appendChild(chip);
    }
    chip.textContent = tab.dataset.count;
  });
}

function applySurveyFilters() {
  const searchInput = document.getElementById('survey-search-input');
  const clearBtn = document.getElementById('survey-search-clear');
  const sortSelect = document.getElementById('survey-sort-select');

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (clearBtn) {
    clearBtn.style.display = query ? 'block' : 'none';
  }

  let filtered = [...allSurveys];

  // Tab filter: all, owned, shared
  if (activeTabFilter === 'owned') {
    filtered = filtered.filter(p => (p.current_user_role || 'owner').toLowerCase() === 'owner');
  } else if (activeTabFilter === 'shared') {
    filtered = filtered.filter(p => (p.current_user_role || '').toLowerCase() !== 'owner');
  }

  // Fast & efficient multi-token search filter (matches name, description, role, id)
  if (query) {
    const tokens = query.split(/\s+/).filter(Boolean);
    filtered = filtered.filter(p => {
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const role = (p.current_user_role || 'owner').toLowerCase();
      const idStr = String(p.id || '');

      return tokens.every(token => 
        name.includes(token) || 
        desc.includes(token) || 
        role.includes(token) || 
        idStr === token
      );
    });
  }

  // Sorting
  if (surveyViewMode === 'table') {
    // Sort according to table header selection or sort select
    const col = tableSortColumn;
    const asc = tableSortAsc;
    const mult = asc ? 1 : -1;

    filtered.sort((a, b) => {
      if (col === 'title') {
        return mult * (a.name || '').localeCompare(b.name || '');
      } else if (col === 'role') {
        return mult * (a.current_user_role || '').localeCompare(b.current_user_role || '');
      } else if (col === 'clusters') {
        return mult * ((a.cluster_count || 0) - (b.cluster_count || 0));
      } else if (col === 'papers') {
        return mult * ((a.paper_count || 0) - (b.paper_count || 0));
      } else if (col === 'screenings') {
        return mult * (((a.screenings_count || 0) + (a.comments_count || 0)) - ((b.screenings_count || 0) + (b.comments_count || 0)));
      } else if (col === 'progress') {
        const pA = a.paper_count > 0 ? (a.read_count || 0) / a.paper_count : 0;
        const pB = b.paper_count > 0 ? (b.read_count || 0) / b.paper_count : 0;
        return mult * (pA - pB);
      } else {
        return mult * (b.id - a.id);
      }
    });
  } else {
    // Card view sorting from dropdown
    const sortBy = sortSelect ? sortSelect.value : 'newest';
    if (sortBy === 'papers') {
      filtered.sort((a, b) => (b.paper_count || 0) - (a.paper_count || 0));
    } else if (sortBy === 'progress') {
      filtered.sort((a, b) => {
        const pA = a.paper_count > 0 ? (a.read_count || 0) / a.paper_count : 0;
        const pB = b.paper_count > 0 ? (b.read_count || 0) / b.paper_count : 0;
        return pB - pA;
      });
    } else if (sortBy === 'title') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      filtered.sort((a, b) => b.id - a.id);
    }
  }

  const container = document.getElementById('surveys-grid-container');
  if (!container) return;

  if (surveyViewMode === 'table') {
    container.className = 'surveys-table-view';
    renderSurveysTable(filtered, query);
  } else {
    container.className = 'surveys-grid';
    renderSurveysGrid(filtered, query);
  }
}

function getEmptyStateHtml(searchVal) {
  let emptyIcon, emptyTitle, emptyDesc, emptyAction = '';

  if (searchVal) {
    emptyIcon  = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    emptyTitle = 'No Search Results';
    emptyDesc  = `No literature surveys match "<strong>${escapeHtml(searchVal)}</strong>". Try searching with different terms or clear the filter.`;
    emptyAction = '<button class="btn btn-secondary" style="margin-top:0.5rem;" onclick="clearSurveySearch()">Clear Search</button>';
  } else if (activeTabFilter === 'shared') {
    emptyIcon  = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    emptyTitle = 'No Surveys Shared With You';
    emptyDesc  = 'There are currently no literature surveys or research projects shared with your account. When colleagues add you as a collaborator, their surveys will appear here.';
    emptyAction = ''; // strictly no creation button in shared tab
  } else if (activeTabFilter === 'owned') {
    emptyIcon  = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
    emptyTitle = 'No Surveys Created Yet';
    emptyDesc  = 'You haven\'t created any literature surveys yet. Start your first systematic review workspace now.';
    emptyAction = '<button class="btn btn-primary" style="margin-top:0.5rem;" onclick="openCreateSurveyModal()">+ Create New Survey</button>';
  } else {
    emptyIcon  = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';
    emptyTitle = 'No Literature Surveys';
    emptyDesc  = 'You have no surveys in your workspace yet. Start your first systematic review project below.';
    emptyAction = '<button class="btn btn-primary" style="margin-top:0.5rem;" onclick="openCreateSurveyModal()">+ Create New Survey</button>';
  }

  return `
    <div class="surveys-loading" style="border: 1.5px dashed var(--border-base); border-radius: var(--radius-lg); background: var(--bg-surface); padding: 3.5rem 2rem; width:100%; box-sizing:border-box;">
      <div style="color: var(--accent-primary); margin-bottom: 0.25rem; display: flex; justify-content: center;">${emptyIcon}</div>
      <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-primary); margin:0;">${emptyTitle}</h3>
      <p style="color:var(--text-secondary); font-size:0.92rem; max-width:440px; text-align:center; margin:0; line-height:1.65;">${emptyDesc}</p>
      ${emptyAction}
    </div>
  `;
}

function renderSurveysGrid(surveys, searchVal) {
  const container = document.getElementById('surveys-grid-container');
  if (!container) return;
  container.innerHTML = '';

  if (surveys.length === 0) {
    container.innerHTML = getEmptyStateHtml(searchVal);
    return;
  }

  surveys.forEach(p => {
    const card = document.createElement('div');
    card.className = 'survey-card';
    card.onclick = () => window.location.href = `/workspace?project=${p.id}`;

    const totalPapers = p.paper_count || 0;
    const readPapers = p.read_count || 0;
    const progressPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;
    const role = (p.current_user_role || 'owner').toLowerCase();
    const isOwner = role === 'owner';
    const isEditor = role === 'editor';
    const canModify = isOwner || isEditor;

    card.innerHTML = `
      <div>
        <div class="survey-card-top">
          <span class="role-badge-pill role-${role}">${role.toUpperCase()}</span>
          ${canModify ? `
            <div class="survey-action-group" onclick="event.stopPropagation()">
              <button class="mini-btn" onclick="openEditSurveyModal(${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.description || '')}')" title="Edit Survey">Edit</button>
              <button class="mini-btn" onclick="exportSurveyExcel(${p.id})" title="Export Master Matrix (.xlsx)">Export</button>
              ${isOwner ? `<button class="mini-btn danger" onclick="deleteSurvey(${p.id}, '${escapeHtml(p.name)}')" title="Delete Survey">Delete</button>` : ''}
            </div>
          ` : `
            <span class="shared-view-tag" style="font-size:0.75rem; color:var(--text-tertiary); font-family:'JetBrains Mono',monospace; padding:0.2rem 0.5rem; background:var(--bg-surface-raised); border-radius:4px; border:1px solid var(--border-base);">View Only</span>
          `}
        </div>

        <h3 class="survey-title">${escapeHtml(p.name)}</h3>
        <p class="survey-desc">${escapeHtml(p.description || 'Systematic literature review workspace & multi-level matrix benchmark.')}</p>

        <div class="survey-metrics-row">
          <div class="survey-metric-col">
            <span class="survey-metric-num">${totalPapers}</span>
            <span class="survey-metric-lbl">Papers</span>
          </div>
          <div class="survey-metric-col">
            <span class="survey-metric-num">${p.cluster_count || 0}</span>
            <span class="survey-metric-lbl">Clusters</span>
          </div>
          <div class="survey-metric-col">
            <span class="survey-metric-num">${readPapers}</span>
            <span class="survey-metric-lbl">Read</span>
          </div>
          <div class="survey-metric-col">
            <span class="survey-metric-num">${p.screenings_count || 0}</span>
            <span class="survey-metric-lbl">Screened</span>
          </div>
        </div>

        <div class="survey-progress-wrap">
          <div class="survey-progress-header">
            <span>Review Progress</span>
            <span style="color: var(--accent-gold); font-weight: 700;">${progressPct}% (${readPapers}/${totalPapers})</span>
          </div>
          <div class="survey-progress-bar-bg">
            <div class="survey-progress-bar-fill" style="width: ${progressPct}%;"></div>
          </div>
        </div>
      </div>

      <div class="survey-card-actions">
        <button class="btn btn-primary" style="flex: 1; padding: 0.55rem 0.85rem; font-size: 0.88rem;" onclick="event.stopPropagation(); window.location.href='/workspace?project=${p.id}'">
          Open Matrix Hub
        </button>
        ${canModify ? `
          <button class="btn btn-secondary" style="padding: 0.55rem 0.85rem; font-size: 0.88rem;" onclick="event.stopPropagation(); window.location.href='/workspace?project=${p.id}#upload'">
            Add Paper
          </button>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function renderSurveysTable(surveys, searchVal) {
  const container = document.getElementById('surveys-grid-container');
  if (!container) return;
  container.innerHTML = '';

  if (surveys.length === 0) {
    container.innerHTML = getEmptyStateHtml(searchVal);
    return;
  }

  function getSortIndicator(col) {
    if (tableSortColumn !== col) return '<span class="sort-indicator">↕</span>';
    return `<span class="sort-indicator">${tableSortAsc ? '▲' : '▼'}</span>`;
  }

  function getThClass(col) {
    return `sortable-th ${tableSortColumn === col ? 'active-sort' : ''}`;
  }

  let tableHtml = `
    <div class="surveys-table-wrapper">
      <table class="surveys-table">
        <thead>
          <tr>
            <th class="${getThClass('title')}" onclick="handleTableSort('title')">
              <span class="th-content">Survey &amp; Research Focus ${getSortIndicator('title')}</span>
            </th>
            <th class="${getThClass('role')}" onclick="handleTableSort('role')">
              <span class="th-content">Role ${getSortIndicator('role')}</span>
            </th>
            <th class="${getThClass('clusters')}" onclick="handleTableSort('clusters')">
              <span class="th-content">Clusters ${getSortIndicator('clusters')}</span>
            </th>
            <th class="${getThClass('papers')}" onclick="handleTableSort('papers')">
              <span class="th-content">Papers ${getSortIndicator('papers')}</span>
            </th>
            <th class="${getThClass('screenings')}" onclick="handleTableSort('screenings')">
              <span class="th-content">Screened ${getSortIndicator('screenings')}</span>
            </th>
            <th class="${getThClass('progress')}" onclick="handleTableSort('progress')">
              <span class="th-content">Reading Progress ${getSortIndicator('progress')}</span>
            </th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  surveys.forEach(p => {
    const totalPapers = p.paper_count || 0;
    const readPapers = p.read_count || 0;
    const progressPct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;
    const role = (p.current_user_role || 'owner').toLowerCase();
    const isOwner = role === 'owner';
    const isEditor = role === 'editor';
    const canModify = isOwner || isEditor;
    const screeningsCount = (p.screenings_count || 0) + (p.comments_count || 0);

    tableHtml += `
      <tr class="survey-table-row" onclick="window.location.href='/workspace?project=${p.id}'" title="Open workspace for ${escapeHtml(p.name)}">
        <td>
          <div class="survey-name-cell-wrap">
            <div class="survey-table-title-row">
              <a href="/workspace?project=${p.id}" class="survey-table-title" onclick="event.stopPropagation()">
                ${escapeHtml(p.name)}
              </a>
            </div>
            <p class="survey-table-desc">${escapeHtml(p.description || 'Systematic literature review & multi-level matrix benchmark.')}</p>
          </div>
        </td>
        <td>
          <span class="role-badge-pill role-${role}">${role.toUpperCase()}</span>
        </td>
        <td>
          <span class="table-metric-badge" title="${p.cluster_count || 0} Taxonomy Clusters">
            ${p.cluster_count || 0}
          </span>
        </td>
        <td>
          <span class="table-metric-badge" title="${totalPapers} Ingested Papers">
            ${totalPapers}
          </span>
        </td>
        <td>
          <span class="table-metric-badge" title="${screeningsCount} PRISMA Decisions & Annotations">
            ${screeningsCount}
          </span>
        </td>
        <td>
          <div class="table-progress-cell">
            <div class="table-progress-label">
              <span>${readPapers}/${totalPapers} Read</span>
              <span class="pct-val">${progressPct}%</span>
            </div>
            <div class="table-progress-bg">
              <div class="table-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
          </div>
        </td>
        <td class="table-actions-cell" onclick="event.stopPropagation()">
          <div class="table-actions-group">
            <button class="table-open-btn" onclick="event.stopPropagation(); window.location.href='/workspace?project=${p.id}'" title="Open Survey Workspace">
              Open Matrix
            </button>
            ${canModify ? `
              <button class="mini-btn" onclick="event.stopPropagation(); openEditSurveyModal(${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.description || '')}')" title="Edit Survey">
                Edit
              </button>
              <button class="mini-btn" onclick="event.stopPropagation(); exportSurveyExcel(${p.id})" title="Export Master Matrix (.xlsx)">
                Export
              </button>
            ` : ''}
            ${isOwner ? `
              <button class="mini-btn danger" onclick="event.stopPropagation(); deleteSurvey(${p.id}, '${escapeHtml(p.name)}')" title="Delete Survey">
                Delete
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });

  tableHtml += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = tableHtml;
}

/* =========================================================
   MODAL ACTIONS: CREATE, EDIT, DELETE & PRESET CLONING
   ========================================================= */

window.openCreateSurveyModal = function() {
  const modal = document.getElementById('modal-create-survey');
  if (modal) modal.classList.add('open');
};

window.closeCreateSurveyModal = function() {
  const modal = document.getElementById('modal-create-survey');
  if (modal) modal.classList.remove('open');
};

window.openEditSurveyModal = function(id, name, desc) {
  const survey = allSurveys.find(s => Number(s.id) === Number(id));
  const role = survey ? (survey.current_user_role || '').toLowerCase() : '';
  if (survey && role !== 'owner' && role !== 'editor') {
    showToast('Permission Denied: Only survey owners and editors can modify survey details.', 'warning');
    return;
  }

  document.getElementById('edit-survey-id').value = id;
  document.getElementById('edit-survey-name').value = name;
  document.getElementById('edit-survey-desc').value = desc || '';
  const modal = document.getElementById('modal-edit-survey');
  if (modal) modal.classList.add('open');
};

window.closeEditSurveyModal = function() {
  const modal = document.getElementById('modal-edit-survey');
  if (modal) modal.classList.remove('open');
};

window.submitNewSurvey = async function() {
  const nameInput = document.getElementById('new-survey-name');
  const descInput = document.getElementById('new-survey-desc');
  const btn = document.getElementById('btn-submit-new-survey');

  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) {
    showToast('Please enter a survey name', 'warning');
    nameInput && nameInput.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span style="opacity:.7;">Creating...</span>';
  }

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create survey');

    showToast(`Survey "${data.name}" created!`, 'success');
    closeCreateSurveyModal();
    if (nameInput) { nameInput.value = ''; document.getElementById('survey-name-count').textContent = '0/120'; }
    if (descInput) descInput.value = '';
    window.location.href = `/workspace?project=${data.id}`;
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Create Survey';
    }
  }
};

window.submitEditSurvey = async function() {
  const idInput = document.getElementById('edit-survey-id');
  const nameInput = document.getElementById('edit-survey-name');
  const descInput = document.getElementById('edit-survey-desc');

  const id = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) {
    showToast('Survey name cannot be empty', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update survey');

    showToast('Survey updated successfully!', 'success');
    closeEditSurveyModal();
    await loadSurveys();
    await loadDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteSurvey = async function(id, name) {
  const survey = allSurveys.find(s => Number(s.id) === Number(id));
  const role = survey ? (survey.current_user_role || '').toLowerCase() : '';
  if (survey && role !== 'owner') {
    showToast('Permission Denied: Only the survey owner can delete this survey.', 'warning');
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete "${name}"?\n\nThis will purge all taxonomy clusters, papers, annotations, and matrix values.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete survey');

    showToast(`Survey "${name}" deleted.`, 'success');
    await loadSurveys();
    await loadDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.exportSurveyExcel = function(projectId) {
  const survey = allSurveys.find(s => Number(s.id) === Number(projectId));
  const role = survey ? (survey.current_user_role || '').toLowerCase() : '';
  if (survey && role !== 'owner' && role !== 'editor') {
    showToast('Permission Denied: Only survey owners and editors can export the master matrix.', 'warning');
    return;
  }
  window.open(`/api/export?project_id=${projectId}&format=excel`, '_blank');
};

/* =========================================================
   PRESET TAXONOMY SEEDER & PRESET SHORTCUTS
   ========================================================= */

window.createFromPreset = async function(name, desc, presetType) {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description: desc })
    });
    const newProj = await res.json();
    if (!res.ok) throw new Error(newProj.error || 'Failed to create survey');

    // Infer preset key
    let key = presetType || 'fs';
    if (name.includes('Language') || name.includes('LLM')) key = 'llm';
    else if (name.includes('Vision')) key = 'cv';
    else if (name.includes('Bioinformatics')) key = 'bio';

    await seedPresetTaxonomy(newProj.id, key);
    showToast(`Survey blueprint "${name}" initialized!`, 'success');
    window.location.href = `/workspace?project=${newProj.id}`;
  } catch (err) {
    showToast('Preset error: ' + err.message, 'error');
  }
};

async function seedPresetTaxonomy(projectId, presetKey) {
  const presets = {
    fs: [
      { name: '01_filter_methods', description: 'Information Gain, Chi-Square, Fisher Score, ReliefF, Mutual Information', color: '#38bdf8' },
      { name: '02_wrapper_algorithms', description: 'Recursive Feature Elimination (RFE), Forward Selection, Genetic Algorithms', color: '#10b981' },
      { name: '03_embedded_sparse', description: 'LASSO L1, Ridge Regularization, ElasticNet, Tree Importance (Random Forest, XGBoost)', color: '#f59e0b' },
      { name: '04_deep_graph_selection', description: 'Feature Selection with Graph Neural Networks, Concrete Autoencoders', color: '#a855f7' }
    ],
    llm: [
      { name: '01_transformer_architectures', description: 'Decoder-Only, Mixture of Experts (MoE), State Space Models (Mamba)', color: '#38bdf8' },
      { name: '02_prompting_reasoning', description: 'Chain-of-Thought, Tree-of-Thoughts, Self-Consistency, In-Context Learning', color: '#10b981' },
      { name: '03_rag_retrieval', description: 'Vector Embeddings, Dense Retrieval, Graph-RAG, Re-ranking', color: '#f59e0b' },
      { name: '04_alignment_safety', description: 'RLHF, DPO, Constitutional AI, Red-Teaming, Jailbreak Defense', color: '#f43f5e' }
    ],
    cv: [
      { name: '01_vision_transformers', description: 'ViT, Swin Transformer, Masked Autoencoders (MAE)', color: '#38bdf8' },
      { name: '02_object_detection', description: 'YOLO Family, DETR, Faster R-CNN, Real-time Edge Models', color: '#10b981' },
      { name: '03_segmentation_foundation', description: 'Segment Anything (SAM), Mask2Former, Universal Medical Image Segmentation', color: '#f59e0b' },
      { name: '04_generative_diffusion', description: 'Latent Diffusion, ControlNet, Sora Video Generation, 3D Gaussian Splatting', color: '#a855f7' }
    ],
    bio: [
      { name: '01_variant_effect_prediction', description: 'AlphaGenome, Enformer, SpliceAI, Functional Non-Coding Variant Analysis', color: '#38bdf8' },
      { name: '02_protein_structure_folding', description: 'AlphaFold 2/3, ESMFold, Foldseek 3D Search, ProteinMPNN', color: '#10b981' },
      { name: '03_single_cell_omics', description: 'scRNA-seq, Spatial Transcriptomics, Cell Typology (CL/UBERON)', color: '#f59e0b' },
      { name: '04_crispr_gene_editing', description: 'Off-target Prediction, Guide RNA Optimization, Prime Editing Design', color: '#f43f5e' }
    ]
  };

  const clustersToSeed = presets[presetKey] || [];
  for (const c of clustersToSeed) {
    try {
      await fetch('/api/clusters', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ project_id: projectId, name: c.name, description: c.description, color: c.color })
      });
    } catch (e) {
      console.warn('Seeder cluster err:', e);
    }
  }
}

/* =========================================================
   FAST DOI INGESTION TOOL
   ========================================================= */

window.fetchQuickDoi = async function() {
  const input = document.getElementById('quick-doi-input');
  const status = document.getElementById('quick-doi-status');
  const doi = input ? input.value.trim() : '';

  if (!doi) {
    if (status) status.innerHTML = '<span style="color: var(--accent-rose);">Please enter a valid DOI.</span>';
    return;
  }

  if (!allSurveys || allSurveys.length === 0) {
    if (status) status.innerHTML = '<span style="color: var(--accent-rose);">Please create a survey first before ingesting a DOI.</span>';
    return;
  }

  if (status) status.innerHTML = '<span style="color: var(--accent-primary);">Fetching academic metadata via OpenAlex / CrossRef...</span>';

  try {
    const targetProjId = allSurveys[0].id;
    const res = await fetch('/api/doi/ingest', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ doi, project_id: targetProjId })
    });
    const data = await res.json();
    if (res.ok) {
      if (status) status.innerHTML = `<span style="color: var(--accent-emerald);">Ingested successfully into "${allSurveys[0].name}"</span>`;
      if (input) input.value = '';
      showToast('Paper ingested from DOI!', 'success');
      await loadDashboardStats();
      await loadSurveys();
    } else {
      if (status) status.innerHTML = `<span style="color: var(--accent-rose);">Lookup error: ${data.error || 'Metadata not found'}</span>`;
    }
  } catch (err) {
    if (status) status.innerHTML = `<span style="color: var(--accent-rose);">Failed: ${err.message}</span>`;
  }
};

function bindDashboardEvents() {
  // Search Box with instant filtering & escape key clearing
  const searchInput = document.getElementById('survey-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      const clearBtn = document.getElementById('survey-search-clear');
      if (clearBtn) clearBtn.style.display = searchInput.value ? 'block' : 'none';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applySurveyFilters();
      }, 150);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSurveySearch();
      }
    });
  }

  // Sort Dropdown
  const sortSelect = document.getElementById('survey-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      applySurveyFilters();
    });
  }

  // Filter Tabs
  const filterTabs = document.querySelectorAll('.filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTabFilter = tab.dataset.filter || 'all';
      applySurveyFilters();
    });
  });

  // Button Triggers
  const btnHeroNew = document.getElementById('btn-hero-new-survey');
  if (btnHeroNew) btnHeroNew.onclick = openCreateSurveyModal;

  const btnSectionNew = document.getElementById('btn-section-new-survey');
  if (btnSectionNew) btnSectionNew.onclick = openCreateSurveyModal;

  const btnSubmitCreate = document.getElementById('btn-submit-new-survey');
  if (btnSubmitCreate) btnSubmitCreate.onclick = submitNewSurvey;

  const btnSubmitEdit = document.getElementById('btn-submit-edit-survey');
  if (btnSubmitEdit) btnSubmitEdit.onclick = submitEditSurvey;
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

document.addEventListener('DOMContentLoaded', () => {
  window.initDashboard();
});
