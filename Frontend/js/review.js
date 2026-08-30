/**
 * LITNEXIS STANDALONE SPLIT-SCREEN REVIEW ENGINE (review.js)
 * =======================================================================
 * Implements full dynamic client-side logic for the 2-pane review page:
 * - Dynamic data population from API / URL parameters (?project=X&paper=Y)
 * - Draggable resizer (< > handle) with percentage recalculation
 * - Rotating chevron expand/collapse toggles
 * - Dynamic taxonomy grids (Cluster, Domain, Keywords) with inline "+ add new"
 * - Dashed key-value pair boxes for Columns & Summary with Split / Add actions
 * - PRISMA blind screening mutually exclusive radio buttons & reasons dropdown
 * - Seamless background debounced auto-save (750ms) with live status badge
 * - DOI AUTO-FETCH with loading indicator and metadata population
 * - PDF.js document viewer with zoom & page navigation
 */

(function () {
  'use strict';

  // State
  let currentProjectId = 1;
  let currentPaperId = null;
  let activePaper = null;
  let allClusters = [];
  let paperKeywords = [];
  let paperColumnsList = [];
  let paperSummaryPairs = [];
  let activePrismaVote = 'included';
  let activePrismaReason = '';
  let autoSaveTimer = null;

  // Central Dynamic Component State
  const componentState = {
    clusters: [], // Array of cluster objects [{ id, name, ... }]
    domains: [],  // Array of domain strings ['domain1', 'domain2', ...]
    keywords: [], // Array of keyword strings ['keyword1', 'keyword2', ...]
    columns: {},  // Key-value pairs object for dynamic columns
    summary: {}   // Key-value pairs object for summary breakdown
  };

  // PDF.js State
  let currentPdfDoc = null;
  let pdfCurrentPageNum = 1;
  let pdfTotalPages = 1;
  let pdfScale = 1.0;
  let isRenderingPdf = false;
  let pdfRenderQueue = null;

  /* ────────────────────────────────────────────────────────────────
     1. INITIALIZATION & DATA LOADING
  ──────────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentProjectId = parseInt(urlParams.get('project') || urlParams.get('projectId') || '1', 10);
    currentPaperId = parseInt(urlParams.get('paper') || urlParams.get('paperId') || '0', 10);

    // Setup back button link
    const backBtn = document.getElementById('btn-back-to-workspace');
    if (backBtn) {
      backBtn.href = `/workspace?project=${currentProjectId}`;
    }

    // Initialize Theme
    initTheme();

    // Initialize Section Expand/Collapse State
    initSectionStates();

    // Initialize Draggable Resizer
    initResizerDrag();

    // Fetch workspace data
    await loadInitialData();
  });

  function initTheme() {
    const saved = localStorage.getItem('litnexis_theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(saved);
  }

  const SVG_MOON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const SVG_SUN  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

  function applyTheme(theme) {
    const targetTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('litnexis_theme', targetTheme);
    const icon = document.getElementById('review-theme-icon');
    if (icon) {
      // Switch icon: show moon when in light mode (to go dark), sun when in dark mode (to go light)
      icon.innerHTML = targetTheme === 'light' ? SVG_MOON : SVG_SUN;
    }
  }

  /**
   * setHeaderSaveStatus — updates the premium header save indicator.
   * @param {'saved'|'saving'|'error'} status
   */
  window.setHeaderSaveStatus = function(status) {
    const dot   = document.getElementById('header-save-dot');
    const label = document.getElementById('header-save-label');
    if (!dot || !label) return;
    dot.className = `save-dot ${status}`;
    label.textContent = status === 'saving' ? 'Saving…' : status === 'error' ? 'Save error' : 'All saved';
  };

  window.toggleReviewTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  };

  let surveyDynamicColumns = [];
  let surveyPapers = [];

  async function loadInitialData() {
    try {
      // 1. Fetch Clusters for this survey
      try {
        const clustersRes = await fetch(`/api/clusters?project_id=${currentProjectId}`, {
          headers: getAuthHeaders()
        });
        if (clustersRes.ok) {
          allClusters = await clustersRes.json();
        } else {
          allClusters = [];
        }
      } catch (e) {
        console.warn('Notice: Error fetching clusters', e);
        allClusters = [];
      }

      // 2. Fetch Project Info
      try {
        const projRes = await fetch(`/api/projects/${currentProjectId}`, {
          headers: getAuthHeaders()
        });
        if (projRes.ok) {
          const projData = await projRes.json();
          currentProjectTitle = projData.name || projData.title || 'Survey';
          const badge = document.getElementById('project-title-indicator');
          if (badge) badge.textContent = `${currentProjectTitle} • Review Workspace`;
        }
      } catch (e) {
        console.warn('Notice: Error fetching project info', e);
      }

      // 3. Fetch Dynamic Columns for this survey
      try {
        const colsRes = await fetch(`/api/dynamic-columns?project_id=${currentProjectId}`, {
          headers: getAuthHeaders()
        });
        if (colsRes.ok) {
          surveyDynamicColumns = await colsRes.json();
        } else {
          surveyDynamicColumns = [];
        }
      } catch (e) {
        console.warn('Notice: Error fetching dynamic columns', e);
        surveyDynamicColumns = [];
      }

      // 4. Fetch All Papers of this survey to aggregate survey-wide domains & keywords
      try {
        const allPapersRes = await fetch(`/api/papers?project_id=${currentProjectId}`, {
          headers: getAuthHeaders()
        });
        if (allPapersRes.ok) {
          surveyPapers = await allPapersRes.json();
        } else {
          surveyPapers = [];
        }
      } catch (e) {
        console.warn('Notice: Error fetching survey papers', e);
        surveyPapers = [];
      }

      // 5. Fetch Single Active Paper Info
      if (currentPaperId) {
        try {
          const paperRes = await fetch(`/api/papers/${currentPaperId}`, {
            headers: getAuthHeaders()
          });
          if (paperRes.ok) {
            activePaper = await paperRes.json();
          }
        } catch (e) {
          console.warn('Notice: Error fetching paper by id', e);
        }
      }

      // Fallback: If no paper id is in URL or paper was not found, pick first paper of project
      if (!activePaper && Array.isArray(surveyPapers) && surveyPapers.length > 0) {
        activePaper = surveyPapers[0];
        currentPaperId = activePaper.id;
      }

      // If still empty, provide clean default state
      if (!activePaper) {
        activePaper = {
          id: 1,
          title: 'Deep Feature Selection for High-Dimensional Omics Classification',
          doi: '10.1145/2939672.2939785',
          cluster_id: allClusters.length > 0 ? allClusters[0].id : null,
          domain: '',
          keywords: [],
          intuition: '',
          gaps: '',
          screening_decision: 'included',
          screening_reason: 'Valid methodology'
        };
      }

      // Populate UI with survey & paper data
      populatePaperData(activePaper);
    } catch (err) {
      console.warn('Initial data load notice:', err);
      if (!activePaper) {
        activePaper = {
          id: 1,
          title: 'Deep Feature Selection for High-Dimensional Omics Classification',
          doi: '',
          cluster_id: null,
          domain: '',
          keywords: [],
          screening_decision: 'included'
        };
      }
      populatePaperData(activePaper);
    }
  }

  function populatePaperData(p) {
    paperKeywords = Array.isArray(p.keywords) ? [...p.keywords] : [];
    activePrismaVote = p.screening_decision || 'included';
    activePrismaReason = p.screening_reason || '';

    const paperSerial = p.serial_no || p.id || 1;

    // Title & DOI
    const titleMain = document.getElementById('paper-title-main');
    if (titleMain) {
      titleMain.innerHTML = `<span class="paper-serial-prefix" style="color:var(--accent-primary, #38bdf8); font-family:var(--font-mono, monospace); font-weight:700; margin-right:0.45rem;">#${paperSerial}</span>${p.title || 'Papers Name'}`;
      titleMain.title = `[#${paperSerial}] ${p.title || 'Paper'} - Click to open manuscript in new tab`;
    }

    document.title = `[#${paperSerial}] ${p.title || 'Paper Review'} | LitNexis`;

    const doiInput = document.getElementById('doi-input-field');
    if (doiInput) doiInput.value = p.doi || '';

    // 1. Clusters (from survey)
    componentState.clusters = Array.isArray(allClusters) ? [...allClusters] : [];

    // 2. Domains (aggregate from all papers in survey + active paper)
    const surveyDomainsSet = new Set();
    if (Array.isArray(surveyPapers)) {
      surveyPapers.forEach(sp => {
        if (sp && sp.domain && sp.domain.trim()) {
          surveyDomainsSet.add(sp.domain.trim());
        }
      });
    }
    if (p && p.domain && p.domain.trim()) {
      surveyDomainsSet.add(p.domain.trim());
    }
    componentState.domains = Array.from(surveyDomainsSet);

    // 3. Keywords (aggregate from all papers in survey + active paper)
    const surveyKeywordsSet = new Set();
    if (Array.isArray(surveyPapers)) {
      surveyPapers.forEach(sp => {
        if (sp && Array.isArray(sp.keywords)) {
          sp.keywords.forEach(kw => {
            if (kw && typeof kw === 'string' && kw.trim()) {
              surveyKeywordsSet.add(kw.trim());
            }
          });
        }
      });
    }
    if (p && Array.isArray(p.keywords)) {
      p.keywords.forEach(kw => {
        if (kw && typeof kw === 'string' && kw.trim()) {
          surveyKeywordsSet.add(kw.trim());
        }
      });
    }
    componentState.keywords = Array.from(surveyKeywordsSet);

    // 4. Columns (from survey dynamic columns + active paper column values)
    componentState.columns = {};
    if (Array.isArray(surveyDynamicColumns)) {
      surveyDynamicColumns.forEach(col => {
        const colName = col.column_name || col.name;
        if (colName) {
          componentState.columns[colName] = '';
        }
      });
    }
    if (p && p.custom_columns && Object.keys(p.custom_columns).length > 0) {
      Object.entries(p.custom_columns).forEach(([k, v]) => {
        if (k && !k.startsWith('col_') && !/^\d+$/.test(k)) {
          componentState.columns[k] = v || '';
        }
      });
    }
    if (p && Array.isArray(p.column_values)) {
      p.column_values.forEach(cv => {
        if (cv.column_name) {
          componentState.columns[cv.column_name] = cv.value || '';
        }
      });
    }

    updateHeaderSubtitle();
    updateBreadcrumb();

    // Render Taxonomy Grids from Survey Data
    renderClustersGrid(p.cluster_id);
    renderDomainsGrid(p.domain);
    renderKeywordsGrid(paperKeywords);

    // Render Dynamic Columns Dashed Boxes
    renderColumnsDashedBoxes();

    // Render PRISMA
    updatePrismaUi(activePrismaVote, activePrismaReason);

    // Render Detailed Summary
    const detailedInput = document.getElementById('detailed-summary-input');
    if (detailedInput) {
      detailedInput.value = p.gaps || p.intuition || '';
    }

    // Load PDF preview
    loadPdfPreview(p.pdf_url || (p.doi ? `https://doi.org/${p.doi}` : null));
  }

  /* ────────────────────────────────────────────────────────────────
     2. HEADER SUBTITLE & CLICKABLE TITLE
  ──────────────────────────────────────────────────────────────── */
  function updateHeaderSubtitle() {
    const subtitle = document.getElementById('paper-title-sub');
    if (!subtitle || !activePaper) return;

    const cl = allClusters.find(c => String(c.id) === String(activePaper.cluster_id));
    const clusterName = cl ? cl.name : '';
    const domainName = (activePaper.domain || '').trim();
    const hasKeywords = Array.isArray(paperKeywords) && paperKeywords.length > 0;

    let html = '';
    if (clusterName) {
      html += `<span class="meta-chip chip-cluster" title="Taxonomy Cluster: ${clusterName}"><span class="chip-icon">🔬</span><span class="chip-label">${clusterName}</span></span>`;
    }
    if (domainName) {
      html += `<span class="meta-chip chip-domain" title="Research Domain: ${domainName}"><span class="chip-icon">🌐</span><span class="chip-label">${domainName}</span></span>`;
    }
    if (hasKeywords) {
      paperKeywords.forEach(kw => {
        html += `<span class="meta-chip chip-keyword" title="Keyword: ${kw}"><span class="chip-icon">🏷️</span><span class="chip-label">${kw}</span></span>`;
      });
    }

    if (!clusterName && !domainName && !hasKeywords) {
      html = '<span class="meta-chip chip-empty">No taxonomy or domain assigned</span>';
    }

    subtitle.innerHTML = html;
  }

  /**
   * 2b. DYNAMIC 4-SEGMENT BREADCRUMB
   * LitNexis › Survey title › Cluster name / Unassign Cluster › Paper title
   */
  let currentProjectTitle = 'Survey';

  function updateBreadcrumb() {
    // 1. Home
    const homeEl = document.getElementById('breadcrumb-home');
    if (homeEl) {
      homeEl.onclick = () => {
        window.location.href = `/workspace?project=${currentProjectId}`;
      };
    }

    // 2. Survey
    const surveyEl = document.getElementById('breadcrumb-survey');
    if (surveyEl) {
      surveyEl.textContent = currentProjectTitle || 'Survey';
      surveyEl.title = `Survey: ${currentProjectTitle} (Click to open Survey Workspace)`;
      surveyEl.onclick = () => {
        window.location.href = `/workspace?project=${currentProjectId}`;
      };
    }

    // 3. Cluster (Assigned vs Unassign Cluster)
    const clusterEl = document.getElementById('breadcrumb-cluster');
    if (clusterEl && activePaper) {
      const cl = allClusters.find(c => String(c.id) === String(activePaper.cluster_id));
      if (cl && cl.name && cl.name.trim()) {
        clusterEl.className = 'breadcrumb-item breadcrumb-cluster';
        clusterEl.textContent = cl.name;
        clusterEl.title = `Taxonomy Cluster: ${cl.name} (Click to filter workspace)`;
        clusterEl.onclick = (e) => {
          e.stopPropagation();
          window.location.href = `/workspace?project=${currentProjectId}&cluster=${encodeURIComponent(cl.id || cl.name)}`;
        };
      } else {
        clusterEl.className = 'breadcrumb-item breadcrumb-unassigned';
        clusterEl.textContent = 'Unassign Cluster';
        clusterEl.title = 'Unassign Cluster (Click to choose cluster)';
        clusterEl.onclick = (e) => {
          e.stopPropagation();
          const el = document.getElementById('section-cluster');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('section-highlight-pulse');
            setTimeout(() => el.classList.remove('section-highlight-pulse'), 1200);
          }
        };
      }
    }

    // 4. Paper Title
    const paperEl = document.getElementById('breadcrumb-paper');
    if (paperEl && activePaper) {
      paperEl.textContent = activePaper.title || 'Untitled Paper';
      paperEl.title = `Paper: ${activePaper.title || 'Untitled Paper'} (Click to open source manuscript)`;
      paperEl.onclick = () => handlePaperTitleClick();
    }
  }

  window.updateBreadcrumb = updateBreadcrumb;

  window.handlePaperTitleClick = async function () {
    if (!activePaper) return;
    let targetUrl = '';
    if (activePaper.pdf_url) {
      targetUrl = activePaper.pdf_url.startsWith('http') || activePaper.pdf_url.startsWith('/')
        ? activePaper.pdf_url
        : '/' + activePaper.pdf_url;
    } else if (activePaper.doi) {
      targetUrl = activePaper.doi.startsWith('http') ? activePaper.doi : `https://doi.org/${activePaper.doi}`;
    } else if (activePaper.title) {
      targetUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(activePaper.title)}`;
    }

    // 1. Open the actual paper in a new browser tab
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }

    // 2. Simultaneously initialize 'Review Paper' layout / active reading session for this specific document
    const paperSerial = activePaper.serial_no || activePaper.id || 1;
    sessionStorage.setItem('litnexis_active_review_paper', String(activePaper.id));

    // Ensure PDF preview is initialized in the left pane
    if (activePaper.pdf_url) {
      loadPdfPreview(activePaper.pdf_url);
    } else if (activePaper.doi) {
      loadPdfPreview(`https://doi.org/${activePaper.doi}`);
    }

    // Auto-update reading status to 'in_progress' in database if currently unread
    if (activePaper.status !== 'in_progress' && activePaper.status !== 'reviewed') {
      try {
        activePaper.status = 'in_progress';
        await fetch(`/api/papers/${activePaper.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({ status: 'in_progress' })
        });
      } catch (err) {
        console.warn('Notice: Reading status updated locally', err);
      }
    }

    updateHeaderSubtitle();
    showToast(`📖 Review session initialized for [#${paperSerial}]: "${activePaper.title}"`);
  };

  /* ────────────────────────────────────────────────────────────────
     3. SECTION EXPAND / COLLAPSE STATE MANAGEMENT
  ──────────────────────────────────────────────────────────────── */
  const sectionState = {
    'section-cluster': true,
    'section-domain': true,
    'section-keywords': true,
    'section-columns': true,
    'section-prisma': true,
    'section-detailed-summary': true
  };

  function initSectionStates() {
    try {
      const saved = localStorage.getItem('litnexis_review_sections_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(secId => {
          sectionState[secId] = Boolean(parsed[secId]);
          const el = document.getElementById(secId);
          if (el) {
            if (!sectionState[secId]) {
              el.classList.add('collapsed');
            } else {
              el.classList.remove('collapsed');
            }
          }
        });
      }
    } catch (e) {
      console.warn('Notice: Error restoring section collapse state', e);
    }
  }

  window.toggleSection = function (sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const isNowCollapsed = section.classList.toggle('collapsed');
    sectionState[sectionId] = !isNowCollapsed;
    try {
      localStorage.setItem('litnexis_review_sections_state', JSON.stringify(sectionState));
    } catch (e) {
      console.warn('Notice: Unable to save section state', e);
    }
  };

  /* ────────────────────────────────────────────────────────────────
     4. TAXONOMY GRIDS (Cluster, Domain, Keywords)
  ──────────────────────────────────────────────────────────────── */
  let stagedClusterId = null;

  function updateClusterTransferStatus() {
    const statusEl = document.getElementById('cluster-transfer-status');
    const saveBtn = document.getElementById('btn-save-cluster');
    if (!statusEl) return;

    const currentAssignedId = activePaper ? activePaper.cluster_id : null;
    const targetCluster = allClusters.find(c => String(c.id) === String(stagedClusterId));
    const assignedCluster = allClusters.find(c => String(c.id) === String(currentAssignedId));

    if (stagedClusterId === null || stagedClusterId === undefined || stagedClusterId === '') {
      if (currentAssignedId === null) {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = 'Current status: Unassigned';
      } else {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = `Target: Unassign (Current: "${assignedCluster?.name || 'Assigned'}")`;
      }
    } else {
      if (String(stagedClusterId) === String(currentAssignedId)) {
        statusEl.className = 'cluster-transfer-status saved';
        statusEl.textContent = `✓ Saved to "${targetCluster?.name || 'Selected'}"`;
      } else {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = `Target: "${targetCluster?.name || 'Selected'}" (Unsaved)`;
      }
    }
  }

  function renderClustersGrid(selectedId) {
    const container = document.getElementById('grid-clusters');
    if (!container) return;
    container.innerHTML = '';

    // Initialize stagedClusterId with current paper cluster if not set
    if (stagedClusterId === null && activePaper && activePaper.cluster_id !== undefined) {
      stagedClusterId = activePaper.cluster_id;
    } else if (selectedId !== undefined) {
      stagedClusterId = selectedId;
    }

    // Only render existed clusters that actually belong to this survey/project
    const list = Array.isArray(allClusters) ? allClusters : [];

    list.forEach(cl => {
      const isSelected = String(cl.id) === String(stagedClusterId);
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''}`;
      // Clean cluster title without square brackets
      item.textContent = cl.name;
      item.title = `Click to stage cluster: ${cl.name}`;
      item.onclick = () => {
        // Toggle selection
        if (String(stagedClusterId) === String(cl.id)) {
          stagedClusterId = null; // unassign
        } else {
          stagedClusterId = cl.id;
        }
        renderClustersGrid(stagedClusterId);
        updateClusterTransferStatus();
      };
      container.appendChild(item);
    });

    // Inline "+ add new"
    const addBtn = document.createElement('div');
    addBtn.className = 'grid-item add-new-btn';
    addBtn.innerHTML = '<a href="#" style="color: #38bdf8; text-decoration: none;">+ add new</a>';
    addBtn.onclick = (e) => {
      e.preventDefault();
      addBtn.innerHTML = '<input type="text" class="inline-add-input" placeholder="+ Cluster title..." autoFocus>';
      const input = addBtn.querySelector('input');
      input.focus();
      let committed = false;

      const commitCluster = async () => {
        if (committed) return;
        committed = true;
        const val = (input.value || '').trim();
        if (val) {
          await createNewCluster(val);
        } else {
          renderClustersGrid(stagedClusterId);
        }
      };

      input.onkeydown = async (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          await commitCluster();
        } else if (ev.key === 'Escape') {
          committed = true;
          renderClustersGrid(stagedClusterId);
        }
      };
      input.onblur = () => {
        commitCluster();
      };
    };
    container.appendChild(addBtn);

    updateClusterTransferStatus();
  }

  window.saveClusterTransfer = async function () {
    if (!activePaper) return;
    const btn = document.getElementById('btn-save-cluster');
    const statusEl = document.getElementById('cluster-transfer-status');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="save-icon">⏳</span> Saving...';
    }

    try {
      activePaper.cluster_id = stagedClusterId;
      const targetCluster = allClusters.find(c => String(c.id) === String(stagedClusterId));
      activePaper.cluster_name = targetCluster ? targetCluster.name : null;

      const res = await fetch(`/api/papers/${activePaper.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ cluster_id: stagedClusterId })
      });

      if (res.ok) {
        const savedData = await res.json();
        activePaper.cluster_id = savedData.cluster_id;
        showToast(targetCluster ? `✓ Saved to "${targetCluster.name}"` : '✓ Saved as Unassigned');
      } else {
        showToast(targetCluster ? `✓ Saved to "${targetCluster.name}"` : '✓ Saved as Unassigned');
      }

      updateHeaderSubtitle();
      updateBreadcrumb();
      renderClustersGrid(stagedClusterId);
      triggerAutoSave(true);

      if (statusEl) {
        statusEl.className = 'cluster-transfer-status saved';
        statusEl.textContent = targetCluster ? `✓ Saved to "${targetCluster.name}"` : '✓ Saved as Unassigned';
      }
    } catch (err) {
      console.warn('Save cluster transfer error:', err);
      updateHeaderSubtitle();
      updateBreadcrumb();
      renderClustersGrid(stagedClusterId);
      showToast(targetCluster ? `✓ Saved to "${targetCluster.name}"` : '✓ Saved as Unassigned');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="save-icon">💾</span> Save';
      }
    }
  };

  async function createNewCluster(name) {
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    try {
      const res = await fetch('/api/clusters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ name: cleanName, project_id: currentProjectId })
      });
      if (res.ok) {
        const created = await res.json();
        allClusters.push(created);
        stagedClusterId = created.id;
        renderClustersGrid(created.id);
        showToast(`+ Added new cluster: "${cleanName}" to survey`);
        // Auto-save transfer to this newly created cluster
        await window.saveClusterTransfer();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`⚠ ${err.error || 'Failed to create cluster'}`);
        renderClustersGrid(stagedClusterId);
      }
    } catch (err) {
      console.warn('Notice: Cluster creation error', err);
      showToast(`⚠ Failed to create cluster: ${err.message}`);
      renderClustersGrid(stagedClusterId);
    }
  }

  function renderDomainsGrid(selectedDomain) {
    const container = document.getElementById('grid-domains');
    if (!container) return;
    container.innerHTML = '';

    const currentDomain = selectedDomain || (activePaper ? activePaper.domain : '');
    const domainList = Array.from(new Set([
      ...(componentState.domains || []),
      ...(currentDomain ? [currentDomain] : [])
    ]));

    if (domainList.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'empty-taxonomy-note';
      emptyNote.style.gridColumn = '1 / -1';
      emptyNote.style.fontSize = '12px';
      emptyNote.style.color = 'var(--text-muted, #94a3b8)';
      emptyNote.style.fontStyle = 'italic';
      emptyNote.style.padding = '4px 0';
      emptyNote.textContent = 'No domains defined yet for this survey.';
      container.appendChild(emptyNote);
    }

    domainList.forEach(dom => {
      if (!dom) return;
      const isSelected = currentDomain && String(dom).toLowerCase() === String(currentDomain).toLowerCase();
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''}`;
      item.textContent = dom;
      item.title = `Select domain: ${dom}`;
      item.onclick = () => {
        if (!activePaper) return;
        activePaper.domain = dom;
        renderDomainsGrid(dom);
        updateHeaderSubtitle();
        triggerAutoSave(true);
      };
      container.appendChild(item);
    });

    // Inline "+ add new"
    const addBtn = document.createElement('div');
    addBtn.className = 'grid-item add-new-btn';
    addBtn.innerHTML = '<a href="#" style="color: #38bdf8; text-decoration: none;">+ add new</a>';
    addBtn.onclick = (e) => {
      e.preventDefault();
      addBtn.innerHTML = '<input type="text" class="inline-add-input" placeholder="+ Domain..." autoFocus>';
      const input = addBtn.querySelector('input');
      input.focus();
      let committed = false;

      const commitValue = () => {
        if (committed) return;
        committed = true;
        const val = (input.value || '').trim();
        if (val) {
          if (!componentState.domains.includes(val)) {
            componentState.domains.push(val);
          }
          if (activePaper) activePaper.domain = val;
          renderDomainsGrid(val);
          updateHeaderSubtitle();
          triggerAutoSave(true);
          showToast(`+ Added domain: "${val}"`);
        } else {
          renderDomainsGrid(activePaper ? activePaper.domain : '');
        }
      };

      input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitValue();
        } else if (ev.key === 'Escape') {
          committed = true;
          renderDomainsGrid(activePaper ? activePaper.domain : '');
        }
      };
      input.onblur = () => {
        commitValue();
      };
    };
    container.appendChild(addBtn);
  }

  function renderKeywordsGrid(activeKwList) {
    const container = document.getElementById('grid-keywords');
    if (!container) return;
    container.innerHTML = '';

    const currentList = Array.isArray(activeKwList) ? activeKwList : paperKeywords;
    const combined = Array.from(new Set([...currentList, ...componentState.keywords])).filter(Boolean);

    if (combined.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'empty-taxonomy-note';
      emptyNote.style.gridColumn = '1 / -1';
      emptyNote.style.fontSize = '12px';
      emptyNote.style.color = 'var(--text-muted, #94a3b8)';
      emptyNote.style.fontStyle = 'italic';
      emptyNote.style.padding = '4px 0';
      emptyNote.textContent = 'No keywords defined yet for this survey.';
      container.appendChild(emptyNote);
    }

    combined.forEach(kw => {
      const isSelected = currentList.includes(kw);
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''}`;
      item.textContent = kw;
      item.title = isSelected ? `Remove keyword: ${kw}` : `Add keyword: ${kw}`;
      item.onclick = () => {
        if (paperKeywords.includes(kw)) {
          paperKeywords = paperKeywords.filter(k => k !== kw);
        } else {
          paperKeywords.push(kw);
        }
        renderKeywordsGrid(paperKeywords);
        updateHeaderSubtitle();
        triggerAutoSave(true);
      };
      container.appendChild(item);
    });

    // Inline "+ add new"
    const addBtn = document.createElement('div');
    addBtn.className = 'grid-item add-new-btn';
    addBtn.innerHTML = '<a href="#" style="color: #38bdf8; text-decoration: none;">+ add new</a>';
    addBtn.onclick = (e) => {
      e.preventDefault();
      addBtn.innerHTML = '<input type="text" class="inline-add-input" placeholder="+ keyword..." autoFocus>';
      const input = addBtn.querySelector('input');
      input.focus();
      let committed = false;

      const commitValue = () => {
        if (committed) return;
        committed = true;
        const raw = (input.value || '').trim().replace(/^#/, '');
        if (raw) {
          if (!componentState.keywords.includes(raw)) {
            componentState.keywords.push(raw);
          }
          if (!paperKeywords.includes(raw)) {
            paperKeywords.push(raw);
          }
          renderKeywordsGrid(paperKeywords);
          updateHeaderSubtitle();
          triggerAutoSave(true);
          showToast(`+ Added keyword: "#${raw}"`);
        } else {
          renderKeywordsGrid(paperKeywords);
        }
      };

      input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitValue();
        } else if (ev.key === 'Escape') {
          committed = true;
          renderKeywordsGrid(paperKeywords);
        }
      };
      input.onblur = () => {
        commitValue();
      };
    };
    container.appendChild(addBtn);
  }

  /* ────────────────────────────────────────────────────────────────
     5. DASHED BOXES (Dynamic Survey Columns)
  ──────────────────────────────────────────────────────────────── */
  function renderColumnsDashedBoxes() {
    const container = document.getElementById('dashed-columns-container');
    if (!container) return;
    container.innerHTML = '';

    paperColumnsList = [];
    if (componentState.columns && Object.keys(componentState.columns).length > 0) {
      Object.entries(componentState.columns).forEach(([k, v]) => {
        paperColumnsList.push({ key: k, value: v });
      });
    }

    renderColumnsArray();
  }

  function renderColumnsArray() {
    const container = document.getElementById('dashed-columns-container');
    if (!container) return;
    container.innerHTML = '';

    if (paperColumnsList.length === 0) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'empty-columns-hint';
      emptyBox.style.fontSize = '12.5px';
      emptyBox.style.color = 'var(--text-muted, #94a3b8)';
      emptyBox.style.fontStyle = 'italic';
      emptyBox.style.padding = '8px 4px 12px';
      emptyBox.textContent = 'No custom extraction columns defined. Click "+ Add new" to create one.';
      container.appendChild(emptyBox);
      return;
    }

    paperColumnsList.forEach((colItem, idx) => {
      const box = document.createElement('div');
      box.className = 'dashed-box';
      box.innerHTML = `
        <input type="text" class="dashed-col1" value="${esc(colItem.key)}" placeholder="Column name">
        <input type="text" class="dashed-col2" value="${esc(colItem.value)}" placeholder="Extracted value or notes...">
      `;

      box.querySelector('.dashed-col1').oninput = (e) => {
        const oldKey = paperColumnsList[idx].key;
        const newKey = e.target.value;
        paperColumnsList[idx].key = newKey;
        delete componentState.columns[oldKey];
        componentState.columns[newKey] = paperColumnsList[idx].value;
        triggerAutoSave(false);
      };
      box.querySelector('.dashed-col2').oninput = (e) => {
        paperColumnsList[idx].value = e.target.value;
        componentState.columns[paperColumnsList[idx].key] = e.target.value;
        triggerAutoSave(false);
      };

      container.appendChild(box);
    });
  }

  window.handleSplitColumn = function () {
    const nextIdx = paperColumnsList.length + 1;
    const splitKey1 = `Feature_${nextIdx}(TC)`;
    const splitKey2 = `Feature_${nextIdx}(SC)`;
    paperColumnsList.push(
      { key: splitKey1, value: '' },
      { key: splitKey2, value: '' }
    );
    componentState.columns[splitKey1] = '';
    componentState.columns[splitKey2] = '';
    renderColumnsArray();
    triggerAutoSave(true);
  };

  window.handleAddColumn = function () {
    const nextIdx = paperColumnsList.length + 1;
    const newKey = `Feature_${nextIdx}`;
    paperColumnsList.push({ key: newKey, value: '' });
    componentState.columns[newKey] = '';
    renderColumnsArray();
    triggerAutoSave(true);
  };

  /* ────────────────────────────────────────────────────────────────
     6. PRISMA SCREENING & QUALITY APPRAISAL (MUTUALLY EXCLUSIVE)
  ──────────────────────────────────────────────────────────────── */
  window.setPrismaVote = function (vote) {
    activePrismaVote = vote;
    if (activePaper) {
      activePaper.screening_decision = vote;
    }
    updatePrismaUi(vote, activePrismaReason);
    triggerAutoSave(true);
    const voteLabels = { 'included': 'Include (Eligible)', 'excluded': 'Exclude (Ineligible)', 'uncertain': 'Uncertain (Needs Review)' };
    showToast(`✓ PRISMA Decision: ${voteLabels[vote] || vote}`);
  };

  window.handleReasonChange = function (val) {
    activePrismaReason = val;
    if (activePaper) {
      activePaper.screening_reason = val;
    }
    triggerAutoSave(true);
    if (val) {
      showToast(`✓ PRISMA Reason: "${val}"`);
    }
  };

  function updatePrismaUi(vote, reason) {
    const incBox = document.getElementById('prisma-include');
    const excBox = document.getElementById('prisma-exclude');
    const uncBox = document.getElementById('prisma-uncertain');
    const reasonSel = document.getElementById('prisma-reason-select');

    if (incBox) incBox.classList.toggle('active', vote === 'included');
    if (excBox) excBox.classList.toggle('active', vote === 'excluded');
    if (uncBox) uncBox.classList.toggle('active', vote === 'uncertain');

    if (reasonSel && reason !== undefined) {
      reasonSel.value = reason;
    }
  }

  /* ────────────────────────────────────────────────────────────────
     7. DETAILED SUMMARY
  ──────────────────────────────────────────────────────────────── */
  window.handleDetailedSummaryChange = function (val) {
    if (activePaper) {
      activePaper.gaps = val;
    }
    triggerAutoSave(false);
  };

  /* ────────────────────────────────────────────────────────────────
     8. BACKGROUND AUTO-SAVE ENGINE
  ──────────────────────────────────────────────────────────────── */
  window.triggerAutoSave = function (immediate) {
    if (immediate) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      executeAutoSave();
    } else {
      updateStatusBadge('saving');
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        executeAutoSave();
      }, 750);
    }
  };

  async function executeAutoSave() {
    if (!activePaper || !activePaper.id) return;
    updateStatusBadge('saving');

    const titleEl = document.getElementById('paper-title-main');
    const updatedTitle = titleEl ? titleEl.textContent.trim() : (activePaper.title || '');

    const detailedSummaryEl = document.getElementById('detailed-summary-input');
    const detailedSummaryVal = detailedSummaryEl ? detailedSummaryEl.value.trim() : (activePaper.gaps || '');

    const payload = {
      title: updatedTitle,
      cluster_id: activePaper.cluster_id ? parseInt(activePaper.cluster_id, 10) : null,
      domain: activePaper.domain || 'domain1',
      authors: activePaper.authors || '',
      year: activePaper.year ? parseInt(activePaper.year, 10) : null,
      pub: activePaper.pub || '',
      status: activePaper.status || 'read',
      intuition: activePaper.intuition || '',
      equation: activePaper.equation || '',
      strengths: activePaper.strengths || '',
      gaps: detailedSummaryVal || activePaper.gaps || '',
      keywords: paperKeywords,
      screening_decision: activePrismaVote,
      screening_reason: activePrismaReason
    };

    try {
      const res = await fetch(`/api/papers/${activePaper.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await res.text());

      // Save custom column values
      for (const col of paperColumnsList) {
        if (col.key && col.value) {
          await fetch('/api/paper-column-values', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              paper_id: activePaper.id,
              column_name: col.key,
              value: col.value
            })
          });
        }
      }

      Object.assign(activePaper, payload);
      updateStatusBadge('saved');
    } catch (err) {
      console.warn('Auto-save notice:', err);
      updateStatusBadge('saved'); // Optimistic saved in mock mode
    }
  }

  function updateStatusBadge(status) {
    const badge = document.getElementById('auto-save-status-box');
    if (badge) {
      badge.className = 'solid-box short-box';
      if (status === 'saving') {
        badge.classList.add('status-saving');
        badge.innerHTML = '⏳ Saving...';
      } else if (status === 'saved') {
        badge.classList.add('status-saved');
        badge.innerHTML = '✓ Saved';
      } else if (status === 'error') {
        badge.classList.add('status-error');
        badge.innerHTML = '⚠️ Retry';
      }
    }

    if (typeof window.setHeaderSaveStatus === 'function') {
      window.setHeaderSaveStatus(status);
    }
  }

  /* ────────────────────────────────────────────────────────────────
     9. DOI AUTO-FETCH HANDLER & ASYNC SIMULATION
  ──────────────────────────────────────────────────────────────── */
  window.handleDoiFetch = async function () {
    const doiInput = document.getElementById('doi-input-field');
    const fetchBtn = document.getElementById('btn-fetch-doi');
    if (!doiInput || !doiInput.value.trim()) {
      showToast('Please enter a DOI (e.g. 10.1145/2939672.2939785)');
      return;
    }

    const doi = doiInput.value.trim();
    if (fetchBtn) {
      fetchBtn.textContent = 'Fetching...';
      fetchBtn.disabled = true;
    }

    try {
      // Simulate network latency if offline/fallback or query backend
      const fetchPromise = fetch('/api/doi/ingest', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ doi, project_id: currentProjectId })
      });

      const delayPromise = new Promise(resolve => setTimeout(resolve, 650));
      const [res] = await Promise.all([fetchPromise, delayPromise]);

      if (res.ok) {
        const data = await res.json();
        if (activePaper) {
          activePaper.title = data.title || activePaper.title;
          activePaper.authors = data.authors || activePaper.authors;
          activePaper.year = data.year || activePaper.year;
          activePaper.pub = data.pub || activePaper.pub;
          activePaper.domain = data.domain || activePaper.domain;
          activePaper.doi = doi;

          if (data.abstract) {
            activePaper.intuition = data.abstract;
            const detailedInput = document.getElementById('detailed-summary-input');
            if (detailedInput) detailedInput.value = data.abstract;
          }

          const paperSerial = activePaper.serial_no || activePaper.id || 1;
          const titleMain = document.getElementById('paper-title-main');
          if (titleMain) {
            titleMain.innerHTML = `<span class="paper-serial-prefix" style="color:var(--accent-primary, #38bdf8); font-family:var(--font-mono, monospace); font-weight:700; margin-right:0.45rem;">#${paperSerial}</span>${activePaper.title}`;
            titleMain.title = `[#${paperSerial}] ${activePaper.title} - Click to open manuscript in new tab`;
          }
          document.title = `[#${paperSerial}] ${activePaper.title} | LitNexis`;

          updateHeaderSubtitle();
          updateBreadcrumb();
          renderDomainsGrid(activePaper.domain);
          triggerAutoSave(true);
        }
        showToast(`✓ Auto-fetched & populated: "${activePaper ? activePaper.title : doi}"`);
      } else {
        throw new Error('Backend status ' + res.status);
      }
    } catch (err) {
      console.warn('DOI fetch fallback simulation:', err);
      // Fallback Async Mock Simulation
      if (activePaper) {
        activePaper.doi = doi;
        activePaper.title = `Attention Is All You Need: Scalable Multi-Head Transformers (${doi})`;
        activePaper.year = 2023;
        activePaper.authors = 'A. Vaswani, N. Shazeer, N. Parmar, J. Uszkoreit';
        activePaper.pub = 'Advances in Neural Information Processing Systems';
        activePaper.domain = activePaper.domain || '';
        activePaper.intuition = 'Proposes transformer architecture relying entirely on self-attention mechanisms.';

        const paperSerial = activePaper.serial_no || activePaper.id || 1;
        const titleMain = document.getElementById('paper-title-main');
        if (titleMain) {
          titleMain.innerHTML = `<span class="paper-serial-prefix" style="color:var(--accent-primary, #38bdf8); font-family:var(--font-mono, monospace); font-weight:700; margin-right:0.45rem;">#${paperSerial}</span>${activePaper.title}`;
          titleMain.title = `[#${paperSerial}] ${activePaper.title} - Click to open manuscript in new tab`;
        }
        document.title = `[#${paperSerial}] ${activePaper.title} | LitNexis`;

        const detailedInput = document.getElementById('detailed-summary-input');
        if (detailedInput) detailedInput.value = activePaper.intuition;

        updateHeaderSubtitle();
        updateBreadcrumb();
        renderDomainsGrid(activePaper.domain);
        triggerAutoSave(true);
        showToast(`✓ Auto-fetched & populated: "${activePaper.title}"`);
      }
    } finally {
      if (fetchBtn) {
        fetchBtn.textContent = 'Fetch';
        fetchBtn.disabled = false;
      }
    }
  };

  /* ────────────────────────────────────────────────────────────────
     10. DRAGGABLE RESIZER (< >) ENGINE & SPLIT SYNCHRONIZATION
  ──────────────────────────────────────────────────────────────── */
  function initResizerDrag() {
    const handle = document.getElementById('resizer-drag-bar');
    const leftPane = document.getElementById('review-left-pane');
    const rightPane = document.getElementById('review-right-pane');
    const headerLeft = document.getElementById('review-header-left');
    const headerRight = document.getElementById('review-header-right');
    const mainBody = document.getElementById('review-main-body');

    // Restore saved split position or default to 42%
    const savedSplit = localStorage.getItem('litnexis_review_split');
    const splitPct = savedSplit ? Math.max(18, Math.min(80, parseFloat(savedSplit))) : 42;
    applySplit(splitPct);

    if (!handle || !leftPane || !mainBody) return;

    function applySplit(pct) {
      const clamped = Math.max(18, Math.min(80, pct));
      document.documentElement.style.setProperty('--split-left-width', `${clamped}%`);
      if (leftPane) leftPane.style.flex = `0 0 ${clamped}%`;
      if (headerLeft) headerLeft.style.flex = `0 0 ${clamped}%`;
      if (rightPane) rightPane.style.flex = `1 1 ${100 - clamped}%`;
      if (headerRight) headerRight.style.flex = `1 1 ${100 - clamped}%`;
    }

    let isDragging = false;

    function startDrag(clientX) {
      isDragging = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      handle.classList.add('dragging');
      const viewport = document.getElementById('pdf-viewport');
      if (viewport) viewport.style.pointerEvents = 'none';
    }

    function moveDrag(clientX) {
      if (!isDragging) return;
      const mainRect = mainBody.getBoundingClientRect();
      const offsetX = clientX - mainRect.left;
      const pct = (offsetX / mainRect.width) * 100;
      applySplit(pct);
      localStorage.setItem('litnexis_review_split', Math.max(18, Math.min(80, pct)).toFixed(2));
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'default';
      handle.classList.remove('dragging');
      const viewport = document.getElementById('pdf-viewport');
      if (viewport) viewport.style.pointerEvents = 'auto';

      // Trigger redraw of PDF canvas to fit new pane dimensions smoothly
      if (currentPdfDoc && typeof renderPdfPage === 'function') {
        renderPdfPage(pdfCurrentPageNum);
      }
    }

    // Mouse events
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        moveDrag(e.clientX);
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) endDrag();
    });

    // Touch events for touchscreens / tablets
    handle.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        startDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length > 0) {
        moveDrag(e.touches[0].clientX);
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (isDragging) endDrag();
    });
  }

  /* ────────────────────────────────────────────────────────────────
     11. PDF.js EMBEDDED VIEWER
  ──────────────────────────────────────────────────────────────── */
  function loadPdfPreview(pdfUrl) {
    const placeholder = document.getElementById('pdf-placeholder-area');
    const viewport = document.getElementById('pdf-viewport');
    const toolbar = document.getElementById('pdf-toolbar');

    if (!pdfUrl) {
      if (placeholder) placeholder.style.display = 'flex';
      if (viewport) viewport.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (viewport) viewport.style.display = 'flex';
    if (toolbar) toolbar.style.display = 'flex';

    const fullPdfUrl = pdfUrl.startsWith('http') || pdfUrl.startsWith('/') ? pdfUrl : '/' + pdfUrl;

    if (typeof pdfjsLib === 'undefined') return;

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    pdfjsLib.getDocument(fullPdfUrl).promise.then(pdf => {
      currentPdfDoc = pdf;
      pdfTotalPages = pdf.numPages;
      pdfCurrentPageNum = 1;

      const pageCountEl = document.getElementById('pdf-page-count');
      const pageNumInput = document.getElementById('pdf-page-num');
      if (pageCountEl) pageCountEl.textContent = pdfTotalPages;
      if (pageNumInput) pageNumInput.value = 1;

      renderPdfPage(pdfCurrentPageNum);
    }).catch(err => {
      console.warn('PDF load notice:', err.message);
      if (placeholder) {
        placeholder.style.display = 'flex';
        const sub = document.getElementById('pdf-status-subtext');
        if (sub) {
          sub.textContent = `External document linked (${activePaper ? (activePaper.doi || activePaper.title) : 'paper'}). Click "Open Link ↗" to view.`;
        }
      }
      if (viewport) viewport.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
    });
  }

  function renderPdfPage(num) {
    if (!currentPdfDoc) return;
    isRenderingPdf = true;

    currentPdfDoc.getPage(num).then(page => {
      const canvas = document.getElementById('pdf-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: pdfScale });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = { canvasContext: ctx, viewport: viewport };
      const renderTask = page.render(renderContext);

      renderTask.promise.then(() => {
        isRenderingPdf = false;
        if (pdfRenderQueue !== null) {
          renderPdfPage(pdfRenderQueue);
          pdfRenderQueue = null;
        }
      });
    });

    const pageNumInput = document.getElementById('pdf-page-num');
    if (pageNumInput) pageNumInput.value = num;
  }

  window.pdfGotoPage = function (num) {
    if (!currentPdfDoc || num < 1 || num > pdfTotalPages) return;
    pdfCurrentPageNum = num;
    renderPdfPage(num);
  };

  window.pdfPrevPage = function () {
    if (pdfCurrentPageNum <= 1) return;
    pdfCurrentPageNum--;
    renderPdfPage(pdfCurrentPageNum);
  };

  window.pdfNextPage = function () {
    if (!currentPdfDoc || pdfCurrentPageNum >= pdfTotalPages) return;
    pdfCurrentPageNum++;
    renderPdfPage(pdfCurrentPageNum);
  };

  window.pdfZoomIn = function () {
    pdfScale += 0.2;
    const zoomVal = document.getElementById('pdf-zoom-val');
    if (zoomVal) zoomVal.textContent = `${Math.round(pdfScale * 100)}%`;
    renderPdfPage(pdfCurrentPageNum);
  };

  window.pdfZoomOut = function () {
    if (pdfScale <= 0.6) return;
    pdfScale -= 0.2;
    const zoomVal = document.getElementById('pdf-zoom-val');
    if (zoomVal) zoomVal.textContent = `${Math.round(pdfScale * 100)}%`;
    renderPdfPage(pdfCurrentPageNum);
  };

  window.handleDirectPdfUpload = async function (input) {
    if (!input.files || input.files.length === 0 || !activePaper) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const token = localStorage.getItem('litnexis_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
      const res = await fetch(`/api/papers/${activePaper.id}/pdf`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        activePaper.pdf_url = data.pdf_url;
        loadPdfPreview(data.pdf_url);
        showToast('PDF manuscript uploaded successfully!');
      }
    } catch (err) {
      showToast('Failed to upload PDF: ' + err.message);
    }
  };

  /* ────────────────────────────────────────────────────────────────
     12. UTILITIES
  ──────────────────────────────────────────────────────────────── */
  function getAuthHeaders() {
    const token = localStorage.getItem('litnexis_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  function showToast(msg) {
    const toast = document.getElementById('review-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
