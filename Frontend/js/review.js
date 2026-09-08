/**
 * LITSPHERE STANDALONE SPLIT-SCREEN REVIEW ENGINE (review.js)
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
  let currentUserRole = 'viewer';
  let allClusters = [];
  let paperKeywords = [];
  let paperColumnsList = [];
  let paperSummaryPairs = [];
  let activePrismaVote = 'included';
  let activePrismaReason = '';
  let autoSaveTimer = null;

  // Role Permissions Helpers
  function isViewerRole() { return (currentUserRole || 'viewer').toLowerCase() === 'viewer'; }
  function isReviewerRole() { return (currentUserRole || 'viewer').toLowerCase() === 'reviewer'; }
  function isEditorOrOwnerRole() {
    const token = localStorage.getItem('litsphere_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
    // If running in local/standalone mode without a token, allow full owner/editor capabilities
    if (!token && (!currentUserRole || currentUserRole === 'viewer')) {
      return true;
    }
    const r = (currentUserRole || 'viewer').toLowerCase();
    return r === 'owner' || r === 'editor' || r === 'admin';
  }
  function canEditPaperData() { return isEditorOrOwnerRole(); }
  function canScreenPaperData() {
    const token = localStorage.getItem('litsphere_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
    if (!token && (!currentUserRole || currentUserRole === 'viewer')) {
      return true;
    }
    const r = (currentUserRole || 'viewer').toLowerCase();
    return r === 'owner' || r === 'editor' || r === 'reviewer' || r === 'admin';
  }

  function broadcastSync(type, payload = {}) {
    const pid = currentProjectId || (activePaper ? activePaper.project_id : null) || 1;
    if (window.api && typeof window.api.broadcast === 'function') {
      window.api.broadcast(type, { ...payload, projectId: pid });
    } else {
      const data = { type, ...payload, projectId: pid, timestamp: Date.now() };
      try {
        const bc = new BroadcastChannel('literature_review_sync');
        bc.postMessage(data);
        bc.close();
      } catch (_) {}
      try {
        localStorage.setItem('literature_review_sync_event', JSON.stringify(data));
      } catch (_) {}
    }
  }

  // Central Dynamic Component State
  const componentState = {
    clusters: [], // Array of cluster objects [{ id, name, ... }]
    domains: [],  // Array of domain strings ['domain1', 'domain2', ...]
    keywords: [], // Array of keyword strings ['keyword1', 'keyword2', ...]
    columns: {},  // Key-value pairs object for dynamic columns
    summary: {}   // Key-value pairs object for summary breakdown
  };

  // PDF.js & Text Highlighting State
  let currentPdfDoc = null;
  let pdfCurrentPageNum = 1;
  let pdfTotalPages = 1;
  let pdfScale = 1.0;
  let isRenderingPdf = false;
  let pdfRenderQueue = null;
  let paperHighlights = [];
  let defaultHighlightColor = '#fef08a';
  let defaultHighlightLabel = 'Key Point';
  let isHighlightModeActive = true;
  let activeClickedHighlight = null;
  let activeSelectionData = null;
  let currentHighlightFilter = 'all';

  /* ────────────────────────────────────────────────────────────────
     1. INITIALIZATION & DATA LOADING
  ──────────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', async () => {
    // Show active inline paper loader immediately with file size telemetry
    showPdfLoader('Opening Manuscript...', 'Connecting to repository & preparing high-resolution layout...', false);
    updatePdfLoaderTelemetry(0, 0, 0, null);

    const urlParams = new URLSearchParams(window.location.search);
    currentProjectId = parseInt(urlParams.get('project') || urlParams.get('projectId') || '1', 10);
    currentPaperId = parseInt(urlParams.get('paper') || urlParams.get('paperId') || urlParams.get('id') || '0', 10);

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
    const saved = localStorage.getItem('litsphere_theme') || document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(saved);
  }

  const SVG_MOON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const SVG_SUN  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="21" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const SVG_SAVE_ICON = `<svg class="save-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

  function applyTheme(theme) {
    const targetTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', targetTheme);
    localStorage.setItem('litsphere_theme', targetTheme);
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
    if (isViewerRole()) {
      dot.className = 'save-dot readonly';
      label.textContent = 'Read-Only (Viewer)';
      return;
    }
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
      // 1. Fetch Single Active Paper Info FIRST (if paper ID is provided)
      if (currentPaperId) {
        try {
          activePaper = await window.api.get(`/api/papers/${currentPaperId}`, { abortKey: 'review-active-paper' });
          if (activePaper && activePaper.project_id) {
            currentProjectId = parseInt(activePaper.project_id, 10);
          }
        } catch (e) {
          if (!e?.isAborted) console.warn('Notice: Error fetching paper by id', e);
        }
      }

      // 2. Fetch Clusters for this survey/project
      try {
        allClusters = (await window.api.get(`/api/clusters?project_id=${currentProjectId}`, { abortKey: 'review-clusters' })) || [];
      } catch (e) {
        if (!e?.isAborted) console.warn('Notice: Error fetching clusters', e);
        allClusters = [];
      }

      // 3. Fetch Project Info
      try {
        const projData = await window.api.get(`/api/projects/${currentProjectId}`);
        if (projData) {
          currentProjectTitle = projData.name || projData.title || 'Survey';
          const badge = document.getElementById('project-title-indicator');
          if (badge) badge.textContent = `${currentProjectTitle} • Review Workspace`;
        }
      } catch (e) {
        if (!e?.isAborted) console.warn('Notice: Error fetching project info', e);
      }

      // 3.5 Fetch Effective User Project Role
      try {
        const roleData = await window.api.get(`/api/projects/${currentProjectId}/my-role`);
        if (roleData && roleData.role) {
          currentUserRole = roleData.role.toLowerCase();
        }
      } catch (e) {
        if (!e?.isAborted) console.warn('Notice: Error fetching user project role in review', e);
      }

      // 4. Fetch Dynamic Columns for this survey and this paper's cluster
      const fetchedColsMap = new Map();

      // A. If paper belongs to a specific cluster, fetch that cluster's specific columns
      const paperClusterId = activePaper ? activePaper.cluster_id : null;
      if (paperClusterId && paperClusterId !== 'unassigned') {
        try {
          const cCols = await window.api.get(`/api/dynamic-columns?cluster_id=${paperClusterId}`);
          if (Array.isArray(cCols)) {
            cCols.forEach(col => {
              const name = col.column_name || col.name;
              if (name && !fetchedColsMap.has(name)) {
                fetchedColsMap.set(name, col);
              }
            });
          }
        } catch (e) {
          if (!e?.isAborted) console.warn('Notice: Error fetching cluster-specific columns', e);
        }
      }

      // B. Fetch project-wide dynamic columns
      try {
        const pCols = await window.api.get(`/api/dynamic-columns?project_id=${currentProjectId}`);
        if (Array.isArray(pCols)) {
          pCols.forEach(col => {
            const name = col.column_name || col.name;
            if (name && !fetchedColsMap.has(name)) {
              fetchedColsMap.set(name, col);
            }
          });
        }
      } catch (e) {
        if (!e?.isAborted) console.warn('Notice: Error fetching dynamic columns', e);
      }

      surveyDynamicColumns = Array.from(fetchedColsMap.values());

      // 5. Fetch All Papers of this survey to aggregate survey-wide domains & keywords
      try {
        surveyPapers = (await window.api.get(`/api/papers?project_id=${currentProjectId}`, { abortKey: 'review-survey-papers' })) || [];
      } catch (e) {
        if (!e?.isAborted) console.warn('Notice: Error fetching survey papers', e);
        surveyPapers = [];
      }

      // Fallback: If no paper id was passed or paper was not found, pick first paper of project
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

  function parseKeywords(val) {
    if (!val) return [];
    if (Array.isArray(val)) {
      return val.map(k => typeof k === 'string' ? k.trim().replace(/^#/, '') : (k && k.keyword ? String(k.keyword).trim().replace(/^#/, '') : '')).filter(Boolean);
    }
    if (typeof val === 'string' && val.trim()) {
      const trimmed = val.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(k => typeof k === 'string' ? k.trim().replace(/^#/, '') : '').filter(Boolean);
          }
        } catch (e) {}
      }
      return trimmed.split(/[,;\n]+/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    }
    return [];
  }

  function populatePaperData(p) {
    paperKeywords = parseKeywords(p.keywords || p.keywords_raw);
    activePrismaVote = p.screening_decision || 'included';
    activePrismaReason = p.screening_reason || '';

    const paperSerial = p.serial_no || p.id || 1;

    // Title & DOI
    const titleMain = document.getElementById('paper-title-main');
    if (titleMain) {
      titleMain.innerHTML = `<span class="paper-serial-prefix" style="color:var(--accent-primary, #38bdf8); font-family:var(--font-mono, monospace); font-weight:700; margin-right:0.45rem;">#${paperSerial}</span>${p.title || 'Papers Name'}`;
      titleMain.title = `[#${paperSerial}] ${p.title || 'Paper'} - Click to open manuscript in new tab`;
    }

    document.title = `[#${paperSerial}] ${p.title || 'Paper Review'} | LitSphere`;

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
        if (sp) {
          parseKeywords(sp.keywords || sp.keywords_raw).forEach(kw => surveyKeywordsSet.add(kw));
        }
      });
    }
    if (p) {
      parseKeywords(p.keywords || p.keywords_raw).forEach(kw => surveyKeywordsSet.add(kw));
    }
    componentState.keywords = Array.from(surveyKeywordsSet);

    // 4. Columns (consolidate cluster columns + project columns + custom columns + paper column values)
    componentState.columns = {};

    // A. Cluster-specific columns from paper endpoint
    if (p && Array.isArray(p.cluster_columns)) {
      p.cluster_columns.forEach(col => {
        const colName = col.column_name || col.name;
        if (colName) {
          componentState.columns[colName] = '';
        }
      });
    }

    // B. Project / Survey dynamic columns
    if (Array.isArray(surveyDynamicColumns)) {
      surveyDynamicColumns.forEach(col => {
        const colName = col.column_name || col.name;
        if (colName && !(colName in componentState.columns)) {
          componentState.columns[colName] = '';
        }
      });
    }

    // C. Custom columns key-value dictionary
    if (p && p.custom_columns && typeof p.custom_columns === 'object') {
      Object.entries(p.custom_columns).forEach(([k, v]) => {
        if (k && !k.startsWith('col_') && !/^\d+$/.test(k)) {
          componentState.columns[k] = v || '';
        }
      });
    }

    // D. Explicit column values from paper_column_values table
    if (p && Array.isArray(p.column_values)) {
      p.column_values.forEach(cv => {
        if (cv.column_name) {
          componentState.columns[cv.column_name] = cv.value || '';
        }
      });
    }

    updateHeaderSubtitle();
    updateBreadcrumb();
    updateUnassignedSectionVisibility();

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

    // Apply granular role permissions to lock down UI for Viewers / Reviewers
    applyReviewRolePermissions();

    // Load PDF preview & Highlights
    loadPdfPreview(p.pdf_url);
    loadPaperHighlights(p.id);
  }

  function applyReviewRolePermissions() {
    const isViewer = isViewerRole();
    const isReviewer = isReviewerRole();
    const canModify = canEditPaperData();

    // 1. Header Save Indicator & Role Badge
    const dot = document.getElementById('header-save-dot');
    const label = document.getElementById('header-save-label');
    if (isViewer) {
      if (dot) {
        dot.className = 'save-dot readonly';
        dot.title = 'Project Role: Viewer (Read-Only)';
      }
      if (label) {
        label.textContent = 'Read-Only (Viewer)';
        label.title = 'You have read-only inspection access to this survey.';
      }
    } else if (isReviewer) {
      if (dot) {
        dot.className = 'save-dot saved';
        dot.title = 'Project Role: Reviewer (PRISMA Screening & Notes)';
      }
      if (label) {
        label.textContent = 'Reviewer Mode';
        label.title = 'You can submit PRISMA screening decisions and comments.';
      }
    } else {
      if (dot) {
        dot.className = 'save-dot saved';
        dot.title = `Project Role: ${(currentUserRole || 'Editor').toUpperCase()} • Full Editing & Auto-Save Active`;
      }
      if (label) {
        label.textContent = `${(currentUserRole || 'Editor').toUpperCase()} • Auto-Save Active`;
        label.title = `${(currentUserRole || 'Editor').toUpperCase()}: All changes are auto-saved in real-time.`;
      }
    }

    // 2. Header Action Buttons (Delete Paper)
    const headerDelBtn = document.getElementById('btn-delete-paper-header');
    if (headerDelBtn) {
      headerDelBtn.style.display = canModify ? 'inline-flex' : 'none';
    }

    // 3. DOI Search / Auto-fill Bar
    const doiWrap = document.getElementById('doi-search-bar-wrap');
    if (doiWrap) {
      doiWrap.style.display = canModify ? 'flex' : 'none';
    }

    // 4. Section Save Buttons
    const saveBtns = document.querySelectorAll('.section-save-btn, #btn-save-cluster');
    saveBtns.forEach(btn => {
      btn.style.display = canModify ? 'inline-flex' : 'none';
    });

    // 5. Column Action Buttons (Split / Add new)
    const colBtnGroup = document.querySelector('#section-columns .btn-group');
    if (colBtnGroup) {
      colBtnGroup.style.display = canModify ? 'flex' : 'none';
    }

    // 6. Detailed Summary Textarea
    const summaryInput = document.getElementById('detailed-summary-input');
    if (summaryInput) {
      if (isViewer || isReviewer) {
        summaryInput.readOnly = true;
        summaryInput.classList.add('read-only-box');
      } else {
        summaryInput.readOnly = false;
        summaryInput.classList.remove('read-only-box');
      }
    }

    // 7. Danger Zone Section
    const dangerSec = document.getElementById('section-danger-zone');
    if (dangerSec) {
      dangerSec.style.display = canModify ? 'block' : 'none';
    }

    // 8. PDF Placeholder Upload Button
    const pdfPlaceholder = document.getElementById('pdf-placeholder-area');
    if (pdfPlaceholder) {
      const uploadBtn = pdfPlaceholder.querySelector('button[onclick*="pdf-upload-input"]');
      if (uploadBtn) {
        uploadBtn.style.display = canModify ? 'inline-flex' : 'none';
      }
    }

    // 9. PRISMA UI States
    const incBox = document.getElementById('prisma-include');
    const excBox = document.getElementById('prisma-exclude');
    const uncBox = document.getElementById('prisma-uncertain');
    const reasonSel = document.getElementById('prisma-reason-select');
    const statusBox = document.getElementById('auto-save-status-box');

    if (isViewer) {
      if (incBox) { incBox.style.cursor = 'default'; incBox.style.pointerEvents = 'none'; }
      if (excBox) { excBox.style.cursor = 'default'; excBox.style.pointerEvents = 'none'; }
      if (uncBox) { uncBox.style.cursor = 'default'; uncBox.style.pointerEvents = 'none'; }
      if (reasonSel) { reasonSel.disabled = true; }
      if (statusBox) {
        statusBox.className = 'solid-box short-box';
        statusBox.textContent = 'Read-Only';
        statusBox.title = 'Viewers cannot modify screening decisions';
      }
    } else {
      if (incBox) { incBox.style.cursor = 'pointer'; incBox.style.pointerEvents = 'auto'; }
      if (excBox) { excBox.style.cursor = 'pointer'; excBox.style.pointerEvents = 'auto'; }
      if (uncBox) { uncBox.style.cursor = 'pointer'; uncBox.style.pointerEvents = 'auto'; }
      if (reasonSel) { reasonSel.disabled = false; }
    }
  }

  function updateUnassignedSectionVisibility() {
    const isUnassigned = !activePaper || !activePaper.cluster_id || activePaper.cluster_id === 'unassigned' || activePaper.cluster_id === null;
    const domainSec = document.getElementById('section-domain');
    const keywordsSec = document.getElementById('section-keywords');
    const colsSec = document.getElementById('section-columns');
    const summarySec = document.getElementById('section-detailed-summary');
    const clusterSec = document.getElementById('section-cluster');
    const prismaSec = document.getElementById('section-prisma');

    // Keep all sections visible and functional so users can inspect/extract data at any stage
    if (domainSec) domainSec.style.display = 'block';
    if (keywordsSec) keywordsSec.style.display = 'block';
    if (colsSec) colsSec.style.display = 'block';
    if (summarySec) summarySec.style.display = 'block';
    if (clusterSec) clusterSec.style.display = 'block';
    if (prismaSec) prismaSec.style.display = 'block';
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

    const role = (currentUserRole || 'viewer').toLowerCase();
    let html = `<span class="role-badge-pill role-${role}" style="font-size:0.72rem; padding:0.15rem 0.55rem; font-weight:700; letter-spacing:0.04em; border-radius:4px; display:inline-flex; align-items:center;" title="Your Project Role: ${role.toUpperCase()}">${role.toUpperCase()}</span>`;
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
   * LitSphere › Survey title › Cluster name / Unassign Cluster › Paper title
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
    sessionStorage.setItem('litsphere_active_review_paper', String(activePaper.id));

    // Ensure PDF preview is initialized in the left pane
    if (activePaper.pdf_url) {
      loadPdfPreview(activePaper.pdf_url);
    } else if (activePaper.doi) {
      loadPdfPreview(`https://doi.org/${activePaper.doi}`);
    }

    // Auto-update reading status to 'in_progress' in database if currently unread and user has edit permissions
    if (canEditPaperData() && activePaper.status !== 'in_progress' && activePaper.status !== 'reviewed') {
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
      const saved = localStorage.getItem('litsphere_review_sections_state');
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
      localStorage.setItem('litsphere_review_sections_state', JSON.stringify(sectionState));
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

    if (!canEditPaperData()) {
      if (saveBtn) saveBtn.style.display = 'none';
      const assignedCluster = allClusters.find(c => String(c.id) === String(activePaper ? activePaper.cluster_id : null));
      statusEl.className = 'cluster-transfer-status';
      statusEl.textContent = assignedCluster ? `Cluster: "${assignedCluster.name}" (Read-Only)` : 'Cluster: Unassigned (Read-Only)';
      return;
    }

    const isTransferAllowed = activePrismaVote === 'included';

    if (!isTransferAllowed) {
      statusEl.className = 'cluster-transfer-status';
      statusEl.textContent = activePrismaVote === 'excluded'
        ? 'Status: Excluded (Transfer Locked)'
        : 'Status: Uncertain (Transfer Locked)';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.45';
        saveBtn.style.cursor = 'not-allowed';
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
    }

    const currentAssignedId = activePaper ? activePaper.cluster_id : null;
    const targetCluster = allClusters.find(c => String(c.id) === String(stagedClusterId));
    const assignedCluster = allClusters.find(c => String(c.id) === String(currentAssignedId));

    if (stagedClusterId === null || stagedClusterId === undefined || stagedClusterId === '') {
      if (currentAssignedId === null) {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = 'Status: Included (Choose cluster to transfer)';
      } else {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = `Target: Unassign (Current: "${assignedCluster?.name || 'Assigned'}")`;
      }
    } else {
      if (String(stagedClusterId) === String(currentAssignedId)) {
        statusEl.className = 'cluster-transfer-status saved';
        statusEl.textContent = `✓ Linked to "${targetCluster?.name || 'Selected'}" (Included)`;
      } else {
        statusEl.className = 'cluster-transfer-status';
        statusEl.textContent = `Target: "${targetCluster?.name || 'Selected'}" (Click Save to Transfer)`;
      }
    }
  }

  function renderClustersGrid(selectedId) {
    const container = document.getElementById('grid-clusters');
    if (!container) return;
    container.innerHTML = '';

    const isTransferAllowed = canEditPaperData() && activePrismaVote === 'included';

    // If transfer not allowed (excluded or uncertain), render a clear status notice (only for editors/reviewers)
    if (canEditPaperData() && !isTransferAllowed) {
      const lockNotice = document.createElement('div');
      lockNotice.className = 'prisma-transfer-locked-notice';
      lockNotice.style.cssText = 'padding: 0.65rem 0.85rem; background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.35); border-radius: 8px; color: #f87171; font-size: 0.82rem; margin-bottom: 0.75rem; width: 100%; grid-column: 1 / -1; display: flex; align-items: center; gap: 0.5rem;';
      
      if (activePrismaVote === 'excluded') {
        lockNotice.innerHTML = `<span>🚫</span><span><strong>Paper Excluded:</strong> Linked into Excluded only. Cannot transfer to a cluster unless marked as <strong>Include</strong>.</span>`;
      } else {
        lockNotice.innerHTML = `<span>⚠️</span><span><strong>Paper Uncertain:</strong> In review queue. Select <strong>Include</strong> to enable transferring to a taxonomy cluster.</span>`;
      }
      container.appendChild(lockNotice);
    }

    // Initialize stagedClusterId with current paper cluster if not set
    if (stagedClusterId === null && activePaper && activePaper.cluster_id !== undefined && isTransferAllowed) {
      stagedClusterId = activePaper.cluster_id;
    } else if (selectedId !== undefined && isTransferAllowed) {
      stagedClusterId = selectedId;
    } else if (!isTransferAllowed) {
      stagedClusterId = activePaper ? activePaper.cluster_id : null;
    }

    // Only render existed clusters that actually belong to this survey/project
    const list = Array.isArray(allClusters) ? allClusters : [];

    list.forEach(cl => {
      const isSelected = String(cl.id) === String(activePaper ? activePaper.cluster_id : stagedClusterId);
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''} ${!canEditPaperData() ? 'read-only-item' : (!isTransferAllowed ? 'disabled-locked' : '')}`;
      item.textContent = cl.name;

      if (!canEditPaperData()) {
        item.title = `Cluster: ${cl.name} (Read-Only)`;
        item.onclick = () => {
          showToast('View-only access: You cannot reassign clusters.', 'info');
        };
      } else {
        item.title = isTransferAllowed ? `Click to assign cluster: ${cl.name}` : `Transfer disabled while paper is ${activePrismaVote}`;
        
        if (!isTransferAllowed) {
          item.style.opacity = '0.45';
          item.style.cursor = 'not-allowed';
        }

        item.onclick = () => {
          if (!isTransferAllowed) {
            showToast(`Cannot assign cluster while paper is ${activePrismaVote === 'excluded' ? 'Excluded' : 'Uncertain'}. Select 'Include' first to transfer.`, 'warning');
            return;
          }
          // Toggle selection
          if (String(stagedClusterId) === String(cl.id)) {
            stagedClusterId = null; // unassign
          } else {
            stagedClusterId = cl.id;
          }
          renderClustersGrid(stagedClusterId);
          updateClusterTransferStatus();
        };
      }
      container.appendChild(item);
    });

    if (isTransferAllowed) {
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
    }

    updateClusterTransferStatus();
  }

  window.saveClusterTransfer = async function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot transfer clusters.', 'warning');
      return;
    }
    if (!activePaper) return;
    if (activePrismaVote !== 'included') {
      showToast(`Cannot transfer to cluster while paper is ${activePrismaVote === 'excluded' ? 'Excluded' : 'Uncertain'}. Mark as 'Include' first.`, 'warning');
      return;
    }

    const btn = document.getElementById('btn-save-cluster');
    const statusEl = document.getElementById('cluster-transfer-status');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="save-spinner"></span> Saving...';
    }

    try {
      activePaper.cluster_id = stagedClusterId;
      const targetCluster = allClusters.find(c => String(c.id) === String(stagedClusterId));
      activePaper.cluster_name = targetCluster ? targetCluster.name : null;
      activePaper.screening_decision = 'included';

      const savedData = await window.api.put(`/api/papers/${activePaper.id}`, {
        cluster_id: stagedClusterId,
        screening_decision: 'included',
        screening_reason: activePrismaReason
      });

      if (savedData) {
        activePaper.cluster_id = savedData.cluster_id;
        showToast(targetCluster ? `✓ Transferred to "${targetCluster.name}" and linked to Included` : 'Saved as Unassigned');
      }

      // Broadcast transfer to parent workspace tabs/windows so they update live without reload
      try {
        broadcastSync('paper_transferred', {
          paperId: activePaper.id,
          clusterId: stagedClusterId,
          clusterName: targetCluster ? targetCluster.name : null,
          screeningDecision: 'included'
        });
      } catch (_) {}

      // Fetch and merge new cluster's dynamic columns if transferred
      if (stagedClusterId && stagedClusterId !== 'unassigned') {
        try {
          const clusterColsRes = await fetch(`/api/dynamic-columns?cluster_id=${stagedClusterId}`, {
            headers: getAuthHeaders()
          });
          if (clusterColsRes.ok) {
            const newCols = await clusterColsRes.json();
            if (Array.isArray(newCols)) {
              newCols.forEach(col => {
                const colName = col.column_name || col.name;
                if (colName && !(colName in componentState.columns)) {
                  componentState.columns[colName] = '';
                }
              });
              renderColumnsDashedBoxes();
            }
          }
        } catch (e) {
          console.warn('Notice: Error fetching new cluster dynamic columns', e);
        }
      }

      updateHeaderSubtitle();
      updateBreadcrumb();
      updateUnassignedSectionVisibility();
      renderClustersGrid(stagedClusterId);
      triggerAutoSave(true);

      if (statusEl) {
        statusEl.className = 'cluster-transfer-status saved';
        statusEl.textContent = targetCluster ? `✓ Transferred to "${targetCluster.name}" (Included)` : 'Saved as Unassigned';
      }
    } catch (err) {
      console.warn('Save cluster transfer error:', err);
      updateHeaderSubtitle();
      updateBreadcrumb();
      updateUnassignedSectionVisibility();
      renderClustersGrid(stagedClusterId);
      showToast(targetCluster ? `✓ Transferred to "${targetCluster.name}" and linked to Included` : 'Saved as Unassigned');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${SVG_SAVE_ICON} Save`;
      }
    }
  };

  async function createNewCluster(name) {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot create clusters.', 'warning');
      return;
    }
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    try {
      const created = await window.api.post('/api/clusters', { name: cleanName, project_id: currentProjectId });
      allClusters.push(created);
      stagedClusterId = created.id;
      renderClustersGrid(created.id);
      showToast(`+ Added new cluster: "${cleanName}" to survey`);
      // Auto-save transfer to this newly created cluster
      await window.saveClusterTransfer();
    } catch (err) {
      console.warn('Notice: Cluster creation error', err);
      showToast(`⚠ Failed to create cluster: ${err.message}`);
      renderClustersGrid(stagedClusterId);
    }
  }

  /* ────────────────────────────────────────────────────────────────
     3. DOMAIN GRID & Instant Search Filter
  ──────────────────────────────────────────────────────────────── */
  let domainSearchQuery = '';

  window.handleDomainSearch = function (query) {
    domainSearchQuery = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('btn-clear-domain-search');
    if (clearBtn) {
      clearBtn.style.display = domainSearchQuery ? 'flex' : 'none';
    }
    renderDomainsGrid();
  };

  window.clearDomainSearch = function () {
    const input = document.getElementById('domain-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('btn-clear-domain-search');
    if (clearBtn) clearBtn.style.display = 'none';
    domainSearchQuery = '';
    renderDomainsGrid();
  };

  window.handleDomainSearchFocus = function () {
    const sec = document.getElementById('section-domain');
    if (sec && sec.classList.contains('collapsed')) {
      window.toggleSection('section-domain');
    }
  };

  function updateDomainCounterBadge(totalCount, filteredCount) {
    const badge = document.getElementById('domain-count-badge');
    if (!badge) return;
    if (totalCount === 0) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-flex';
    if (domainSearchQuery) {
      badge.textContent = `${filteredCount} / ${totalCount}`;
      badge.classList.add('filtered');
      badge.title = `Showing ${filteredCount} of ${totalCount} domains matching "${domainSearchQuery}"`;
    } else {
      badge.textContent = `${totalCount}`;
      badge.classList.remove('filtered');
      badge.title = `Total domains: ${totalCount}`;
    }
  }

  function renderDomainsGrid(selectedDomain) {
    const container = document.getElementById('grid-domains');
    if (!container) return;
    container.innerHTML = '';

    const currentDomain = selectedDomain !== undefined ? selectedDomain : (activePaper ? activePaper.domain : '');
    const domainList = Array.from(new Set([
      ...(componentState.domains || []),
      ...(currentDomain ? [currentDomain] : [])
    ])).filter(Boolean);

    const totalCount = domainList.length;

    // Filter items according to search query
    const filteredList = domainSearchQuery
      ? domainList.filter(dom => String(dom).toLowerCase().includes(domainSearchQuery))
      : domainList;

    updateDomainCounterBadge(totalCount, filteredList.length);

    if (totalCount === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'empty-taxonomy-note';
      emptyNote.style.gridColumn = '1 / -1';
      emptyNote.style.fontSize = '12px';
      emptyNote.style.color = 'var(--text-muted, #94a3b8)';
      emptyNote.style.fontStyle = 'italic';
      emptyNote.style.padding = '4px 0';
      emptyNote.textContent = 'No domains defined yet for this survey.';
      container.appendChild(emptyNote);
    } else if (filteredList.length === 0 && domainSearchQuery) {
      const noMatchBox = document.createElement('div');
      noMatchBox.className = 'no-column-matches';
      noMatchBox.style.gridColumn = '1 / -1';
      noMatchBox.style.padding = '8px 4px 12px';
      noMatchBox.style.fontSize = '12px';
      noMatchBox.style.color = 'var(--text-muted, #94a3b8)';
      noMatchBox.innerHTML = `
        <div>No domains matching "<strong style="color:var(--text-main); font-weight:600;">${esc(domainSearchQuery)}</strong>"</div>
        <button type="button" class="clear-search-pill-btn" onclick="clearDomainSearch()">
          ✕ Clear search
        </button>
      `;
      container.appendChild(noMatchBox);
    }

    filteredList.forEach(dom => {
      if (!dom) return;
      const isSelected = currentDomain && String(dom).toLowerCase() === String(currentDomain).toLowerCase();
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''} ${!canEditPaperData() ? 'read-only-item' : ''}`;
      item.textContent = dom;
      if (!canEditPaperData()) {
        item.title = `Domain: ${dom} (Read-Only)`;
        item.onclick = () => {
          showToast('View-only access: You cannot change domains.', 'info');
        };
      } else {
        item.title = `Select domain: ${dom}`;
        item.onclick = () => {
          if (!activePaper) return;
          activePaper.domain = dom;
          renderDomainsGrid(dom);
          updateHeaderSubtitle();
          triggerAutoSave(true);
        };
      }
      container.appendChild(item);
    });

    if (canEditPaperData()) {
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
  }

  /* ────────────────────────────────────────────────────────────────
     4. KEYWORDS GRID & Instant Search Filter
  ──────────────────────────────────────────────────────────────── */
  let keywordsSearchQuery = '';

  window.handleKeywordsSearch = function (query) {
    keywordsSearchQuery = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('btn-clear-keywords-search');
    if (clearBtn) {
      clearBtn.style.display = keywordsSearchQuery ? 'flex' : 'none';
    }
    renderKeywordsGrid();
  };

  window.clearKeywordsSearch = function () {
    const input = document.getElementById('keywords-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('btn-clear-keywords-search');
    if (clearBtn) clearBtn.style.display = 'none';
    keywordsSearchQuery = '';
    renderKeywordsGrid();
  };

  window.handleKeywordsSearchFocus = function () {
    const sec = document.getElementById('section-keywords');
    if (sec && sec.classList.contains('collapsed')) {
      window.toggleSection('section-keywords');
    }
  };

  function updateKeywordsCounterBadge(totalCount, filteredCount, selectedCount = 0) {
    const badge = document.getElementById('keywords-count-badge');
    if (!badge) return;

    badge.style.display = 'inline-flex';

    if (keywordsSearchQuery) {
      badge.textContent = `${filteredCount} / ${totalCount}`;
      badge.classList.add('filtered');
      badge.title = `Showing ${filteredCount} of ${totalCount} keywords matching "${keywordsSearchQuery}" (${selectedCount} selected for this paper)`;
    } else {
      badge.classList.remove('filtered');
      if (totalCount === 0) {
        badge.textContent = '0';
        badge.title = '0 keywords assigned to this paper';
      } else if (selectedCount !== totalCount) {
        badge.textContent = `${selectedCount} / ${totalCount}`;
        badge.title = `${selectedCount} of ${totalCount} keywords selected for this paper`;
      } else {
        badge.textContent = `${totalCount}`;
        badge.title = `All ${totalCount} keywords selected for this paper`;
      }
    }
  }

  function renderKeywordsGrid(activeKwList) {
    const container = document.getElementById('grid-keywords');
    if (!container) return;
    container.innerHTML = '';

    const currentList = Array.isArray(activeKwList) ? activeKwList : paperKeywords;
    const combined = Array.from(new Set([...currentList, ...componentState.keywords])).filter(Boolean);

    const totalCount = combined.length;
    const selectedCount = currentList.length;

    // Filter items according to search query
    const filteredList = keywordsSearchQuery
      ? combined.filter(kw => String(kw).toLowerCase().includes(keywordsSearchQuery))
      : combined;

    updateKeywordsCounterBadge(totalCount, filteredList.length, selectedCount);

    if (totalCount === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'empty-taxonomy-note';
      emptyNote.style.gridColumn = '1 / -1';
      emptyNote.style.fontSize = '12px';
      emptyNote.style.color = 'var(--text-muted, #94a3b8)';
      emptyNote.style.fontStyle = 'italic';
      emptyNote.style.padding = '4px 0';
      emptyNote.textContent = 'No keywords defined yet for this survey.';
      container.appendChild(emptyNote);
    } else if (filteredList.length === 0 && keywordsSearchQuery) {
      const noMatchBox = document.createElement('div');
      noMatchBox.className = 'no-column-matches';
      noMatchBox.style.gridColumn = '1 / -1';
      noMatchBox.style.padding = '8px 4px 12px';
      noMatchBox.style.fontSize = '12px';
      noMatchBox.style.color = 'var(--text-muted, #94a3b8)';
      noMatchBox.innerHTML = `
        <div>No keywords matching "<strong style="color:var(--text-main); font-weight:600;">${esc(keywordsSearchQuery)}</strong>"</div>
        <button type="button" class="clear-search-pill-btn" onclick="clearKeywordsSearch()">
          ✕ Clear search
        </button>
      `;
      container.appendChild(noMatchBox);
    }

    filteredList.forEach(kw => {
      const isSelected = currentList.includes(kw);
      const item = document.createElement('div');
      item.className = `grid-item ${isSelected ? 'selected' : ''} ${!canEditPaperData() ? 'read-only-item' : ''}`;
      item.textContent = kw;

      if (!canEditPaperData()) {
        item.title = `Keyword: #${kw} (Read-Only)`;
        item.onclick = () => {
          showToast('View-only access: You cannot modify keywords.', 'info');
        };
      } else {
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
      }
      container.appendChild(item);
    });

    if (canEditPaperData()) {
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
          const parts = (input.value || '')
            .split(/[,;\n]+/)
            .map(s => s.trim().replace(/^#/, ''))
            .filter(Boolean);
          if (parts.length > 0) {
            parts.forEach(raw => {
              if (!componentState.keywords.includes(raw)) {
                componentState.keywords.push(raw);
              }
              if (!paperKeywords.includes(raw)) {
                paperKeywords.push(raw);
              }
            });
            renderKeywordsGrid(paperKeywords);
            updateHeaderSubtitle();
            triggerAutoSave(true);
            showToast(parts.length === 1 ? `+ Added keyword: "#${parts[0]}"` : `+ Added ${parts.length} keywords`);
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
  }

  /* ────────────────────────────────────────────────────────────────
     5. DASHED BOXES (Dynamic Survey Columns & Instant Search Filter)
  ──────────────────────────────────────────────────────────────── */
  let columnSearchQuery = '';

  window.handleColumnSearch = function (query) {
    columnSearchQuery = (query || '').trim().toLowerCase();
    const clearBtn = document.getElementById('btn-clear-column-search');
    if (clearBtn) {
      clearBtn.style.display = columnSearchQuery ? 'flex' : 'none';
    }
    renderColumnsArray();
  };

  window.clearColumnSearch = function () {
    const input = document.getElementById('column-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('btn-clear-column-search');
    if (clearBtn) clearBtn.style.display = 'none';
    columnSearchQuery = '';
    renderColumnsArray();
  };

  window.handleColumnSearchFocus = function () {
    const sec = document.getElementById('section-columns');
    if (sec && sec.classList.contains('collapsed')) {
      window.toggleSection('section-columns');
    }
  };

  function updateColumnsCounterBadge(totalCount, filteredCount) {
    const badge = document.getElementById('columns-count-badge');
    if (!badge) return;
    if (totalCount === 0) {
      badge.style.display = 'none';
      return;
    }
    badge.style.display = 'inline-flex';
    if (columnSearchQuery) {
      badge.textContent = `${filteredCount} / ${totalCount}`;
      badge.classList.add('filtered');
      badge.title = `Showing ${filteredCount} of ${totalCount} columns matching "${columnSearchQuery}"`;
    } else {
      badge.textContent = `${totalCount}`;
      badge.classList.remove('filtered');
      badge.title = `Total columns: ${totalCount}`;
    }
  }

  function renderColumnsDashedBoxes() {
    const container = document.getElementById('dashed-columns-container');
    if (!container) return;
    container.innerHTML = '';

    paperColumnsList = [];
    if (componentState.columns && Object.keys(componentState.columns).length > 0) {
      Object.entries(componentState.columns).forEach(([k, v]) => {
        if (!k) return;
        const dyn = Array.isArray(surveyDynamicColumns) ? surveyDynamicColumns.find(dc => dc.column_name === k || dc.name === k) : null;
        paperColumnsList.push({
          id: dyn ? dyn.id : null,
          key: k,
          original_key: k,
          value: v !== undefined && v !== null ? String(v) : ''
        });
      });
    }

    renderColumnsArray();
  }

  function renderColumnsArray() {
    const container = document.getElementById('dashed-columns-container');
    if (!container) return;
    container.innerHTML = '';

    const totalCount = paperColumnsList.length;

    // 1. If no columns defined at all in the paper
    if (totalCount === 0) {
      updateColumnsCounterBadge(0, 0);
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

    // 2. Filter items according to search query
    const filteredEntries = columnSearchQuery
      ? paperColumnsList
          .map((item, originalIdx) => ({ item, originalIdx }))
          .filter(({ item }) => {
            const k = (item.key || '').toLowerCase();
            const v = (item.value || '').toLowerCase();
            return k.includes(columnSearchQuery) || v.includes(columnSearchQuery);
          })
      : paperColumnsList.map((item, originalIdx) => ({ item, originalIdx }));

    updateColumnsCounterBadge(totalCount, filteredEntries.length);

    // 3. If searching and no matches found
    if (filteredEntries.length === 0) {
      const noMatchBox = document.createElement('div');
      noMatchBox.className = 'no-column-matches';
      noMatchBox.style.padding = '12px 8px 16px';
      noMatchBox.style.fontSize = '12.5px';
      noMatchBox.style.color = 'var(--text-muted, #94a3b8)';
      noMatchBox.innerHTML = `
        <div>No columns matching "<strong style="color:var(--text-main); font-weight:600;">${esc(columnSearchQuery)}</strong>"</div>
        <button type="button" class="clear-search-pill-btn" onclick="clearColumnSearch()">
          ✕ Clear search
        </button>
      `;
      container.appendChild(noMatchBox);
      return;
    }

    // 4. Render matched dashed boxes with direct editable column name and delete action
    filteredEntries.forEach(({ item: colItem, originalIdx }) => {
      const box = document.createElement('div');
      box.className = 'dashed-box';
      box.setAttribute('data-col-idx', originalIdx);
      box.innerHTML = `
        <div class="dashed-col1-wrapper">
          <input type="text" class="dashed-col1 ${!canEditPaperData() ? 'read-only-box' : ''}" value="${esc(colItem.key)}" placeholder="Column name" title="${canEditPaperData() ? `Click to rename column: ${esc(colItem.key)}` : `Column: ${esc(colItem.key)} (Read-Only)`}" ${!canEditPaperData() ? 'readonly' : ''}>
          <span class="col-rename-icon" title="Edit column name" style="${!canEditPaperData() ? 'display:none;' : ''}">✎</span>
        </div>
        <input type="text" class="dashed-col2 ${!canEditPaperData() ? 'read-only-box' : ''}" value="${esc(colItem.value)}" placeholder="${canEditPaperData() ? 'Extracted value or notes...' : 'No value'}" ${!canEditPaperData() ? 'readonly' : ''}>
        <button type="button" class="dashed-col-del-btn" title="Delete column '${esc(colItem.key)}'" onclick="handleDeleteColumn(${originalIdx})" style="${!canEditPaperData() ? 'display:none;' : ''}">
          ✕
        </button>
      `;

      const inputCol1 = box.querySelector('.dashed-col1');
      const inputCol2 = box.querySelector('.dashed-col2');

      if (canEditPaperData()) {
        inputCol1.oninput = (e) => {
          const newKey = e.target.value;
          const oldKey = paperColumnsList[originalIdx].key;
          paperColumnsList[originalIdx].key = newKey;
          delete componentState.columns[oldKey];
          componentState.columns[newKey] = paperColumnsList[originalIdx].value;
          triggerAutoSave(false);
        };

        inputCol1.onblur = async (e) => {
          const newKey = (e.target.value || '').trim();
          const origKey = paperColumnsList[originalIdx].original_key;
          if (!newKey) {
            e.target.value = origKey;
            paperColumnsList[originalIdx].key = origKey;
            componentState.columns[origKey] = paperColumnsList[originalIdx].value;
            showToast('Column name cannot be empty');
            return;
          }
          if (newKey !== origKey) {
            await renameColumnDirect(origKey, newKey, paperColumnsList[originalIdx].id, originalIdx);
          }
        };

        inputCol1.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputCol1.blur();
          }
        };

        inputCol2.oninput = (e) => {
          paperColumnsList[originalIdx].value = e.target.value;
          componentState.columns[paperColumnsList[originalIdx].key] = e.target.value;
          triggerAutoSave(false);
        };
      }

      container.appendChild(box);
    });
  }

  window.renameColumnDirect = async function (oldKey, newKey, colId, originalIdx) {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot rename columns.', 'warning');
      return;
    }
    if (!oldKey || !newKey || oldKey === newKey) return;
    try {
      const payload = {
        old_column_name: oldKey,
        new_column_name: newKey,
        column_id: colId || null,
        project_id: currentProjectId,
        cluster_id: activePaper ? activePaper.cluster_id : null
      };

      const res = await fetch('/api/dynamic-columns/rename-by-name', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn('Rename column notice:', errText);
      }

      if (originalIdx !== undefined && paperColumnsList[originalIdx]) {
        paperColumnsList[originalIdx].key = newKey;
        paperColumnsList[originalIdx].original_key = newKey;
      }

      delete componentState.columns[oldKey];
      componentState.columns[newKey] = (paperColumnsList[originalIdx] ? paperColumnsList[originalIdx].value : (componentState.columns[oldKey] || ''));

      if (activePaper && activePaper.custom_columns) {
        delete activePaper.custom_columns[oldKey];
        activePaper.custom_columns[newKey] = componentState.columns[newKey];
      }

      // Update in surveyDynamicColumns cache
      if (Array.isArray(surveyDynamicColumns)) {
        const dyn = surveyDynamicColumns.find(dc => dc.column_name === oldKey || dc.name === oldKey || (colId && dc.id === colId));
        if (dyn) {
          dyn.column_name = newKey;
          dyn.name = newKey;
        }
      }

      showToast(`✓ Renamed column: "${oldKey}" → "${newKey}"`);

      // Broadcast rename to Workspace
      broadcastSync('column_renamed', {
        oldName: oldKey,
        newName: newKey,
        columnId: colId,
        projectId: currentProjectId,
        clusterId: activePaper ? activePaper.cluster_id : null
      });
    } catch (err) {
      console.warn('Rename column notice:', err);
    }
  };

  window.handleDeleteColumn = async function (originalIdx) {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot delete columns.', 'warning');
      return;
    }
    const colItem = paperColumnsList[originalIdx];
    if (!colItem || !colItem.key) return;

    const colName = colItem.key;
    const colId = colItem.id;

    if (!confirm(`Are you sure you want to delete column "${colName}"?`)) {
      return;
    }

    try {
      const payload = {
        column_name: colName,
        column_id: colId || null,
        project_id: currentProjectId,
        cluster_id: activePaper ? activePaper.cluster_id : null
      };

      await fetch('/api/dynamic-columns/delete-by-name', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      paperColumnsList.splice(originalIdx, 1);
      delete componentState.columns[colName];
      if (activePaper && activePaper.custom_columns) {
        delete activePaper.custom_columns[colName];
      }

      if (Array.isArray(surveyDynamicColumns)) {
        surveyDynamicColumns = surveyDynamicColumns.filter(dc => dc.column_name !== colName && dc.name !== colName && (!colId || dc.id !== colId));
      }

      renderColumnsArray();
      showToast(`✓ Deleted column "${colName}"`);

      // Broadcast delete to Workspace
      broadcastSync('column_deleted', {
        columnName: colName,
        columnId: colId,
        clusterId: activePaper ? activePaper.cluster_id : null
      });
    } catch (err) {
      console.warn('Delete column error:', err);
    }
  };

  window.handleSplitColumn = async function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot split columns.', 'warning');
      return;
    }
    const nextIdx = paperColumnsList.length + 1;
    const parentName = `Feature_${nextIdx}`;
    const splitKey1 = `Feature_${nextIdx}(TC)`;
    const splitKey2 = `Feature_${nextIdx}(SC)`;

    try {
      await fetch('/api/dynamic-columns/split', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          parent_column_name: parentName,
          sub_columns: [splitKey1, splitKey2],
          project_id: currentProjectId,
          cluster_id: activePaper ? activePaper.cluster_id : null
        })
      });
    } catch (e) {
      console.warn('Split column error:', e);
    }

    paperColumnsList.push(
      { id: null, key: splitKey1, original_key: splitKey1, value: '' },
      { id: null, key: splitKey2, original_key: splitKey2, value: '' }
    );
    componentState.columns[splitKey1] = '';
    componentState.columns[splitKey2] = '';

    if (columnSearchQuery) {
      window.clearColumnSearch();
    } else {
      renderColumnsArray();
    }
    triggerAutoSave(true);
    showToast(`✓ Created split columns: "${splitKey1}" & "${splitKey2}"`);

    broadcastSync('column_added', {
      columnName: splitKey1,
      clusterId: activePaper ? activePaper.cluster_id : null
    });
  };

  window.handleAddColumn = async function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot add columns.', 'warning');
      return;
    }
    const nextIdx = paperColumnsList.length + 1;
    const newKey = `Feature_${nextIdx}`;

    let createdId = null;
    try {
      const res = await fetch('/api/dynamic-columns', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          column_name: newKey,
          project_id: currentProjectId,
          cluster_id: activePaper ? activePaper.cluster_id : null,
          col_type: 'text'
        })
      });
      if (res.ok) {
        const data = await res.json();
        createdId = data.id || null;
      }
    } catch (e) {
      console.warn('Create dynamic column warning:', e);
    }

    paperColumnsList.push({
      id: createdId,
      key: newKey,
      original_key: newKey,
      value: ''
    });
    componentState.columns[newKey] = '';

    if (columnSearchQuery) {
      window.clearColumnSearch();
    } else {
      renderColumnsArray();
    }

    // Auto-focus the newly created column input so the user can immediately rename it
    setTimeout(() => {
      const container = document.getElementById('dashed-columns-container');
      if (container) {
        const boxes = container.querySelectorAll('.dashed-box');
        if (boxes.length > 0) {
          const lastBox = boxes[boxes.length - 1];
          const col1Input = lastBox.querySelector('.dashed-col1');
          if (col1Input) {
            col1Input.focus();
            col1Input.select();
          }
        }
      }
    }, 60);

    triggerAutoSave(true);
    showToast(`✓ Added column "${newKey}". Edit name directly.`);

    // Broadcast column added
    broadcastSync('column_added', {
      columnName: newKey,
      columnId: createdId,
      clusterId: activePaper ? activePaper.cluster_id : null
    });
  };

  /* ────────────────────────────────────────────────────────────────
     6. PRISMA SCREENING & QUALITY APPRAISAL (MUTUALLY EXCLUSIVE)
  ──────────────────────────────────────────────────────────────── */
  window.setPrismaVote = function (vote) {
    if (isViewerRole()) {
      showToast('View-only access: You cannot modify screening decisions.', 'warning');
      return;
    }
    activePrismaVote = vote;
    if (activePaper) {
      activePaper.screening_decision = vote;
      if (vote === 'excluded' || vote === 'uncertain') {
        // Excluded and uncertain papers cannot be assigned/transferred to clusters
        stagedClusterId = null;
        activePaper.cluster_id = null;
      }
    }
    updatePrismaUi(vote, activePrismaReason);
    renderClustersGrid(stagedClusterId);
    updateClusterTransferStatus();
    updateUnassignedSectionVisibility();
    triggerAutoSave(true);
    const voteLabels = {
      'included': 'Include (Eligible) — Cluster Transfer Enabled',
      'excluded': 'Exclude (Ineligible) — Linked into Excluded (Transfer Locked)',
      'uncertain': 'Uncertain (Needs Review) — Linked into Review Queue (Transfer Locked)'
    };
    showToast(`✓ PRISMA Decision: ${voteLabels[vote] || vote}`);
  };

  window.handleReasonChange = function (val) {
    if (isViewerRole()) {
      showToast('View-only access: You cannot modify screening reason.', 'warning');
      return;
    }
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
    if (!canEditPaperData()) return;
    if (activePaper) {
      activePaper.gaps = val;
    }
    triggerAutoSave(false);
  };

  /* ────────────────────────────────────────────────────────────────
     8. SECTION DIRECT SAVE HANDLER & BACKGROUND AUTO-SAVE ENGINE
  ──────────────────────────────────────────────────────────────── */
  window.saveSectionDirect = async function (sectionType, btn) {
    if (!canEditPaperData()) {
      showToast('View-only access: Changes cannot be saved.', 'warning');
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="save-spinner"></span> Saving...';
    }

    try {
      await executeAutoSave();
      const labels = {
        domain: 'Domain',
        keywords: 'Keywords',
        columns: 'Columns',
        summary: 'Detailed Summary'
      };
      const label = labels[sectionType] || 'Changes';
      showToast(`✓ ${label} saved`);
    } catch (err) {
      console.warn(`Save ${sectionType} error:`, err);
      showToast(`✓ Saved`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `${SVG_SAVE_ICON} Save`;
      }
    }
  };

  window.triggerAutoSave = function (immediate) {
    if (!canEditPaperData()) return;
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
    if (!canEditPaperData()) return;
    if (!activePaper || !activePaper.id) return;
    updateStatusBadge('saving');

    const titleEl = document.getElementById('paper-title-main');
    const updatedTitle = titleEl ? titleEl.textContent.trim() : (activePaper.title || '');

    const detailedSummaryEl = document.getElementById('detailed-summary-input');
    const detailedSummaryVal = detailedSummaryEl ? detailedSummaryEl.value : (activePaper.gaps || '');

    // Sync any pending renamed columns to dynamic_columns definition
    if (Array.isArray(paperColumnsList)) {
      for (const col of paperColumnsList) {
        if (col && col.original_key && col.key && col.key.trim() && col.key.trim() !== col.original_key.trim()) {
          try {
            await fetch('/api/dynamic-columns/rename-by-name', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                old_column_name: col.original_key.trim(),
                new_column_name: col.key.trim(),
                column_id: col.id || null,
                project_id: currentProjectId,
                cluster_id: activePaper ? activePaper.cluster_id : null
              })
            });
            col.original_key = col.key.trim();
          } catch (rErr) {
            console.warn('Auto-save rename sync notice:', rErr);
          }
        }
      }
    }

    // Consolidate custom columns from paperColumnsList & componentState.columns
    const columnUpdates = [];
    const customColsDict = {};

    if (Array.isArray(paperColumnsList) && paperColumnsList.length > 0) {
      paperColumnsList.forEach(col => {
        if (col && col.key && typeof col.key === 'string' && col.key.trim()) {
          const colKey = col.key.trim();
          const colVal = col.value !== undefined && col.value !== null ? String(col.value) : '';
          customColsDict[colKey] = colVal;
          columnUpdates.push({
            paper_id: activePaper.id,
            column_name: colKey,
            value: colVal
          });
        }
      });
    } else if (componentState.columns && typeof componentState.columns === 'object') {
      Object.entries(componentState.columns).forEach(([k, v]) => {
        if (k && typeof k === 'string' && k.trim()) {
          const colKey = k.trim();
          const colVal = v !== undefined && v !== null ? String(v) : '';
          customColsDict[colKey] = colVal;
          columnUpdates.push({
            paper_id: activePaper.id,
            column_name: colKey,
            value: colVal
          });
        }
      });
    }

    componentState.columns = Object.assign({}, componentState.columns || {}, customColsDict);

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
      screening_reason: activePrismaReason,
      custom_columns: customColsDict
    };

    try {
      await window.api.put(`/api/papers/${activePaper.id}`, payload);

      // Batch save custom column values directly to guarantee persistence
      if (columnUpdates.length > 0) {
        try {
          await window.api.post('/api/paper-column-values/batch', {
            paper_id: activePaper.id,
            updates: columnUpdates
          });
        } catch (batchErr) {
          console.warn('Batch column values save warning:', batchErr);
        }
      }

      Object.assign(activePaper, payload);
      activePaper.custom_columns = Object.assign({}, activePaper.custom_columns || {}, customColsDict);
      updateStatusBadge('saved');

      // Broadcast live sync to all Workspace matrix tabs
      const pid = (new URLSearchParams(window.location.search)).get('project') || activePaper.project_id || 1;
      broadcastSync('paper_updated', {
        paperId: activePaper.id,
        paperIds: [activePaper.id],
        clusterId: activePaper.cluster_id,
        clusterName: activePaper.cluster_name,
        title: updatedTitle,
        domain: activePaper.domain,
        keywords: paperKeywords,
        screeningDecision: activePrismaVote,
        screeningReason: activePrismaReason,
        custom_columns: customColsDict,
        projectId: pid
      });
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
        badge.innerHTML = '<span class="save-spinner"></span> Saving...';
      } else if (status === 'saved') {
        badge.classList.add('status-saved');
        badge.innerHTML = 'Saved';
      } else if (status === 'error') {
        badge.classList.add('status-error');
        badge.innerHTML = 'Retry';
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
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot fetch DOI metadata.', 'warning');
      return;
    }
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
          document.title = `[#${paperSerial}] ${activePaper.title} | LitSphere`;

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
        document.title = `[#${paperSerial}] ${activePaper.title} | LitSphere`;

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
    const savedSplit = localStorage.getItem('litsphere_review_split');
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
      localStorage.setItem('litsphere_review_split', Math.max(18, Math.min(80, pct)).toFixed(2));
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
     11. PDF.js EMBEDDED VIEWER, TEXT SELECTION & MULTI-COLOR HIGHLIGHTS
  ──────────────────────────────────────────────────────────────── */
  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 KB';
    const k = 1024;
    if (bytes < k) return `${bytes} B`;
    if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
    return `${(bytes / (k * k)).toFixed(2)} MB`;
  }

  function updatePdfLoaderTelemetry(speedBps, loadedBytes, totalBytes, etaSec) {
    const telemetry = document.getElementById('pdf-loader-telemetry');
    const speedEl = document.getElementById('pdf-loader-speed');
    const bytesEl = document.getElementById('pdf-loader-bytes');
    const etaEl = document.getElementById('pdf-loader-eta');
    const pillLabel = document.getElementById('pdf-loader-filesize-label');

    if (telemetry) telemetry.style.display = 'flex';

    if (speedEl) {
      if (speedBps && speedBps > 0) {
        speedEl.textContent = `⚡ ${formatBytes(speedBps)}/s`;
      } else {
        speedEl.textContent = '⚡ Connecting...';
      }
    }

    if (bytesEl) {
      if (totalBytes && totalBytes > 0) {
        bytesEl.textContent = `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
      } else if (loadedBytes && loadedBytes > 0) {
        bytesEl.textContent = `${formatBytes(loadedBytes)} loaded`;
      } else {
        bytesEl.textContent = '0.0 MB / -- MB';
      }
    }

    if (etaEl) {
      if (etaSec !== null && etaSec !== undefined && !isNaN(etaSec)) {
        etaEl.textContent = `⏱ ETA: ${etaSec}s`;
      } else {
        etaEl.textContent = '⏱ ETA: --';
      }
    }

    if (pillLabel) {
      if (totalBytes && totalBytes > 0) {
        pillLabel.textContent = `File size: ${formatBytes(loadedBytes)} of ${formatBytes(totalBytes)}`;
      } else if (loadedBytes && loadedBytes > 0) {
        pillLabel.textContent = `File size: ${formatBytes(loadedBytes)} loaded`;
      } else {
        pillLabel.textContent = 'File size: Resolving stream...';
      }
    }
  }

  function showPdfLoader(title = 'Opening Manuscript...', subtitle = 'Streaming PDF & preparing high-resolution layout', isUploading = false) {
    const overlay = document.getElementById('pdf-loader');
    const titleEl = document.getElementById('pdf-loader-title');
    const subEl = document.getElementById('pdf-loader-subtitle');
    const bar = document.getElementById('pdf-loader-bar');
    const pct = document.getElementById('pdf-loader-pct');
    const telemetry = document.getElementById('pdf-loader-telemetry');
    const pillLabel = document.getElementById('pdf-loader-filesize-label');

    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitle;
    if (bar) bar.style.width = isUploading ? '0%' : '12%';
    if (pct) pct.textContent = isUploading ? '0%' : '12%';
    if (telemetry) telemetry.style.display = 'flex';
    if (pillLabel) pillLabel.textContent = isUploading ? 'Upload size: Initializing...' : 'File size: Connecting...';

    if (overlay) {
      overlay.style.display = 'flex';
      void overlay.offsetWidth;
      overlay.classList.add('active');
    }
  }

  function updatePdfLoaderProgress(percent, statusText) {
    const bar = document.getElementById('pdf-loader-bar');
    const pct = document.getElementById('pdf-loader-pct');
    const subEl = document.getElementById('pdf-loader-subtitle');

    const clamped = Math.min(Math.max(Math.round(percent), 0), 100);
    if (bar) bar.style.width = `${clamped}%`;
    if (pct) pct.textContent = `${clamped}%`;
    if (statusText && subEl) subEl.textContent = statusText;
  }

  function hidePdfLoader() {
    const overlay = document.getElementById('pdf-loader');
    const telemetry = document.getElementById('pdf-loader-telemetry');
    if (!overlay) return;
    updatePdfLoaderProgress(100, 'Manuscript ready');
    overlay.classList.remove('active');
    setTimeout(() => {
      if (!overlay.classList.contains('active')) {
        overlay.style.display = 'none';
        if (telemetry) telemetry.style.display = 'none';
      }
    }, 280);
  }

  function showPageTransitionPill(text = 'Rendering Page...') {
    const pill = document.getElementById('pdf-page-transition-pill');
    const textEl = document.getElementById('pdf-pill-text');
    if (textEl) textEl.textContent = text;
    if (pill) {
      pill.style.display = 'flex';
      void pill.offsetWidth;
      pill.classList.add('active');
    }
  }

  function hidePageTransitionPill() {
    const pill = document.getElementById('pdf-page-transition-pill');
    if (!pill) return;
    pill.classList.remove('active');
    setTimeout(() => {
      if (!pill.classList.contains('active')) {
        pill.style.display = 'none';
      }
    }, 240);
  }

  let activePdfLoadId = 0;

  async function loadPdfPreview(pdfUrl) {
    const thisLoadId = ++activePdfLoadId;
    const placeholder = document.getElementById('pdf-placeholder-area');
    const viewport = document.getElementById('pdf-viewport');
    const toolbar = document.getElementById('pdf-toolbar');

    // Immediately present the inline paper loader with file size telemetry
    showPdfLoader('Opening Manuscript...', 'Connecting to repository & preparing high-resolution layout...', false);
    updatePdfLoaderTelemetry(0, 0, 0, null);

    if (placeholder) placeholder.style.display = 'none';
    if (viewport) viewport.style.display = 'flex';
    if (toolbar) toolbar.style.display = 'flex';

    if (typeof pdfjsLib === 'undefined') {
      hidePdfLoader();
      return;
    }

    // Configure same-origin Blob Worker wrapper for cross-browser safety (Firefox, Chrome, Safari)
    try {
      if (!window._pdfWorkerBlobUrl) {
        const workerBlob = new Blob(
          [`importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');`],
          { type: 'application/javascript' }
        );
        window._pdfWorkerBlobUrl = URL.createObjectURL(workerBlob);
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = window._pdfWorkerBlobUrl;
    } catch (_) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    if (pdfjsLib.VerbosityLevel) {
      pdfjsLib.GlobalWorkerOptions.verbosity = pdfjsLib.VerbosityLevel.ERRORS;
    }

    // Determine target stream URL (prioritize backend proxy endpoint which caches & auto-resolves OA DOIs)
    let streamUrl = null;
    if (activePaper && activePaper.id) {
      streamUrl = `/api/papers/${activePaper.id}/pdf`;
    } else if (typeof pdfUrl === 'string' && pdfUrl.trim()) {
      streamUrl = pdfUrl.startsWith('http') || pdfUrl.startsWith('/') || pdfUrl.startsWith('blob:') || pdfUrl.startsWith('data:')
        ? pdfUrl
        : '/' + pdfUrl;
    }

    function showExternalPlaceholder() {
      hidePdfLoader();
      if (placeholder) {
        placeholder.style.display = 'flex';
        const sub = document.getElementById('pdf-status-subtext');
        if (sub) {
          const docId = (activePaper && (activePaper.doi || activePaper.title)) ? (activePaper.doi || activePaper.title) : 'External Manuscript';
          sub.textContent = `External manuscript linked (${docId}). Click "Open Link ↗" to view on publisher site or upload a local copy.`;
        }
      }
      if (viewport) viewport.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
    }

    if (!streamUrl) {
      showExternalPlaceholder();
      return;
    }

    try {
      // Stream PDF directly from server with live loaded bytes vs total bytes tracking
      const response = await fetch(streamUrl, {
        headers: {
          'Accept': 'application/pdf,*/*',
          ...getAuthHeaders()
        }
      });

      if (thisLoadId !== activePdfLoadId) return;

      if (!response.ok) {
        // If 404, check if direct pdfUrl can be loaded or show external placeholder
        if (pdfUrl && pdfUrl !== streamUrl && (pdfUrl.startsWith('http') || pdfUrl.toLowerCase().includes('.pdf'))) {
          loadPdfFromUrlFallback(pdfUrl, thisLoadId);
          return;
        }
        showExternalPlaceholder();
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        showExternalPlaceholder();
        return;
      }

      const contentLengthHeader = response.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      let loadedBytes = 0;
      const chunks = [];
      const startTime = performance.now();
      let lastTelemetryUpdate = 0;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (thisLoadId !== activePdfLoadId) return;

          chunks.push(value);
          loadedBytes += value.length;

          const now = performance.now();
          if (now - lastTelemetryUpdate > 75 || (totalBytes > 0 && loadedBytes >= totalBytes)) {
            lastTelemetryUpdate = now;
            const elapsedSec = Math.max((now - startTime) / 1000, 0.05);
            const speedBps = loadedBytes / elapsedSec;
            const pct = totalBytes > 0 ? Math.min(Math.round((loadedBytes / totalBytes) * 85), 85) : 40;
            const etaSec = (totalBytes > 0 && speedBps > 0) ? Math.max(Math.round((totalBytes - loadedBytes) / speedBps), 0) : null;

            updatePdfLoaderProgress(pct, `Streaming ${formatBytes(loadedBytes)} ${totalBytes > 0 ? 'of ' + formatBytes(totalBytes) : ''}...`);
            updatePdfLoaderTelemetry(speedBps, loadedBytes, totalBytes, etaSec);
          }
        }
      } else {
        const arrayBuf = await response.arrayBuffer();
        chunks.push(new Uint8Array(arrayBuf));
        loadedBytes = arrayBuf.byteLength;
      }

      if (thisLoadId !== activePdfLoadId) return;

      // Concatenate all chunks into a contiguous Uint8Array
      const allBytes = new Uint8Array(loadedBytes);
      let byteOffset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, byteOffset);
        byteOffset += chunk.length;
      }

      updatePdfLoaderProgress(88, `Downloaded ${formatBytes(loadedBytes)}. Initializing layout...`);
      updatePdfLoaderTelemetry(0, loadedBytes, totalBytes || loadedBytes, 0);

      // Feed binary in-memory data directly to PDF.js
      const loadingTask = pdfjsLib.getDocument({
        data: allBytes,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
        verbosity: 0
      });

      const pdf = await loadingTask.promise;
      if (thisLoadId !== activePdfLoadId) return;

      currentPdfDoc = pdf;
      pdfTotalPages = pdf.numPages;
      pdfCurrentPageNum = 1;

      updatePdfLoaderProgress(94, `Rendering Page 1 of ${pdfTotalPages}...`);

      const pageCountEl = document.getElementById('pdf-page-count');
      const pageNumInput = document.getElementById('pdf-page-num');
      if (pageCountEl) pageCountEl.textContent = pdfTotalPages;
      if (pageNumInput) pageNumInput.value = 1;

      renderPdfPage(1);
    } catch (err) {
      if (thisLoadId !== activePdfLoadId) return;
      console.warn('PDF stream loading notice:', err.message);
      showExternalPlaceholder();
    }
  }

  function loadPdfFromUrlFallback(fullPdfUrl, loadId) {
    const placeholder = document.getElementById('pdf-placeholder-area');
    const viewport = document.getElementById('pdf-viewport');
    const toolbar = document.getElementById('pdf-toolbar');

    const loadingTask = pdfjsLib.getDocument({
      url: fullPdfUrl,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
      verbosity: 0
    });

    loadingTask.onProgress = function (progress) {
      if (progress.total > 0) {
        const percent = Math.round((progress.loaded / progress.total) * 85);
        updatePdfLoaderProgress(percent, `Streaming ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}...`);
        updatePdfLoaderTelemetry(0, progress.loaded, progress.total, null);
      } else if (progress.loaded > 0) {
        updatePdfLoaderProgress(45, `Streaming ${formatBytes(progress.loaded)}...`);
        updatePdfLoaderTelemetry(0, progress.loaded, 0, null);
      }
    };

    loadingTask.promise.then(pdf => {
      if (loadId && loadId !== activePdfLoadId) return;
      currentPdfDoc = pdf;
      pdfTotalPages = pdf.numPages;
      pdfCurrentPageNum = 1;

      updatePdfLoaderProgress(92, `Rendering Page 1 of ${pdfTotalPages}...`);
      const pageCountEl = document.getElementById('pdf-page-count');
      const pageNumInput = document.getElementById('pdf-page-num');
      if (pageCountEl) pageCountEl.textContent = pdfTotalPages;
      if (pageNumInput) pageNumInput.value = 1;

      renderPdfPage(1);
    }).catch(err => {
      if (loadId && loadId !== activePdfLoadId) return;
      console.warn('Fallback PDF load notice:', err.message);
      hidePdfLoader();
      if (placeholder) {
        placeholder.style.display = 'flex';
        const sub = document.getElementById('pdf-status-subtext');
        if (sub) {
          sub.textContent = `External document linked (${activePaper ? (activePaper.doi || activePaper.title) : 'document'}). Click "Open Link ↗" to view.`;
        }
      }
      if (viewport) viewport.style.display = 'none';
      if (toolbar) toolbar.style.display = 'none';
    });
  }

  function renderPdfPage(num) {
    if (!currentPdfDoc) return;
    isRenderingPdf = true;

    const overlay = document.getElementById('pdf-loader');
    const isInitialLoad = overlay && overlay.classList.contains('active');
    if (isInitialLoad) {
      updatePdfLoaderProgress(95, `Rendering high-res Page ${num}...`);
    } else {
      showPageTransitionPill(`Rendering Page ${num}...`);
    }

    currentPdfDoc.getPage(num).then(page => {
      const canvas = document.getElementById('pdf-canvas');
      const textLayer = document.getElementById('pdf-text-layer');
      const highlightLayer = document.getElementById('pdf-highlight-layer');
      const container = document.getElementById('pdf-page-container');
      if (!canvas || !container) {
        isRenderingPdf = false;
        hidePdfLoader();
        hidePageTransitionPill();
        return;
      }

      const ctx = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: pdfScale });

      // Synchronize container and canvas dimensions & PDF.js scale factor
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      container.style.width = `${viewport.width}px`;
      container.style.height = `${viewport.height}px`;
      container.style.setProperty('--scale-factor', viewport.scale);

      if (highlightLayer) {
        highlightLayer.style.width = `${viewport.width}px`;
        highlightLayer.style.height = `${viewport.height}px`;
        highlightLayer.style.setProperty('--scale-factor', viewport.scale);
        highlightLayer.innerHTML = '';
      }

      if (textLayer) {
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.style.setProperty('--scale-factor', viewport.scale);
        textLayer.innerHTML = '';
      }

      // 1. Render canvas
      const renderContext = { canvasContext: ctx, viewport: viewport };
      const renderTask = page.render(renderContext);

      renderTask.promise.then(() => {
        isRenderingPdf = false;
        hidePdfLoader();
        hidePageTransitionPill();

        // 2. Render TextLayer for Selection & Copying
        page.getTextContent().then(textContent => {
          if (textLayer && typeof pdfjsLib.renderTextLayer === 'function') {
            const textLayerRenderTask = pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayer,
              viewport: viewport,
              textDivs: []
            });
            if (textLayerRenderTask && textLayerRenderTask.promise) {
              textLayerRenderTask.promise.then(() => {
                setupPdfSelectionHandlers();
              });
            } else {
              setupPdfSelectionHandlers();
            }
          }
        }).catch(err => console.warn('TextLayer fetch notice:', err));

        // 3. Render Multi-Color Highlight Marks on this page
        renderPageHighlights(num, viewport);

        if (pdfRenderQueue !== null) {
          renderPdfPage(pdfRenderQueue);
          pdfRenderQueue = null;
        }
      }).catch(err => {
        isRenderingPdf = false;
        hidePdfLoader();
        hidePageTransitionPill();
        console.warn('Canvas render notice:', err);
      });
    }).catch(err => {
      isRenderingPdf = false;
      hidePdfLoader();
      hidePageTransitionPill();
      console.warn('Page fetch notice:', err);
    });

    const pageNumInput = document.getElementById('pdf-page-num');
    if (pageNumInput) pageNumInput.value = num;
  }

  // --- HIGHLIGHTS API & PERSISTENCE ---
  async function loadPaperHighlights(paperId) {
    if (!paperId) return;
    try {
      const res = await fetch(`/api/papers/${paperId}/highlights`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        paperHighlights = Array.isArray(data.highlights) ? data.highlights : [];
      } else {
        const cached = localStorage.getItem(`litsphere_hl_${paperId}`);
        paperHighlights = cached ? JSON.parse(cached) : [];
      }
    } catch (e) {
      console.warn('Failed to fetch highlights from API, loading local cache:', e);
      const cached = localStorage.getItem(`litsphere_hl_${paperId}`);
      paperHighlights = cached ? JSON.parse(cached) : [];
    }

    updateHighlightsUi();
    if (currentPdfDoc) {
      currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
        const viewport = page.getViewport({ scale: pdfScale });
        renderPageHighlights(pdfCurrentPageNum, viewport);
      }).catch(() => {});
    }
  }

  function updateHighlightsUi() {
    const count = paperHighlights.length;
    const sidebarBadge = document.getElementById('highlights-section-count');
    const toolbarBadge = document.getElementById('pdf-toolbar-hl-count');
    if (sidebarBadge) sidebarBadge.textContent = count;
    if (toolbarBadge) toolbarBadge.textContent = count;

    renderHighlightsList(currentHighlightFilter);
  }

  function getDarkerBorderColor(hex) {
    const map = {
      '#fef08a': '#eab308',
      '#bbf7d0': '#22c55e',
      '#bfdbfe': '#3b82f6',
      '#e9d5ff': '#a855f7',
      '#fbcfe8': '#ec4899',
      '#fed7aa': '#f97316'
    };
    return map[hex] || '#d4af37';
  }

  function renderPageHighlights(pageNum, viewport) {
    const highlightLayer = document.getElementById('pdf-highlight-layer');
    if (!highlightLayer) return;
    highlightLayer.innerHTML = '';

    const pageHls = paperHighlights.filter(h => Number(h.page_number) === Number(pageNum));

    pageHls.forEach(hl => {
      const color = hl.color || '#fef08a';
      const rects = Array.isArray(hl.rects) ? hl.rects : [];

      if (rects.length > 0) {
        rects.forEach((r, idx) => {
          const mark = document.createElement('div');
          mark.className = 'pdf-highlight-mark';
          mark.dataset.hlId = hl.id;
          mark.style.left = `${r.x * viewport.width}px`;
          mark.style.top = `${r.y * viewport.height}px`;
          mark.style.width = `${r.w * viewport.width}px`;
          mark.style.height = `${r.h * viewport.height}px`;
          mark.style.backgroundColor = color;
          mark.style.borderBottom = `2px solid ${getDarkerBorderColor(color)}`;
          mark.title = `[${hl.color_label || 'Highlight'}] ${hl.selected_text || ''}`;

          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            showHighlightPopover(hl, e.pageX, e.pageY);
          });

          highlightLayer.appendChild(mark);
        });
      }
    });
  }

  // --- TEXT SELECTION & FLOATING TOOLBAR LOGIC ---
  let selectionHandlerBound = false;

  function getSafeElement(target) {
    if (!target) return null;
    return target instanceof Element ? target : (target.parentElement instanceof Element ? target.parentElement : null);
  }

  function setupPdfSelectionHandlers() {
    if (selectionHandlerBound) return;
    selectionHandlerBound = true;

    document.addEventListener('selectionchange', handlePdfSelection);
    document.addEventListener('mouseup', handlePdfSelectionEnd);
    document.addEventListener('click', handleOutsideClicks);
  }

  function handlePdfSelection() {
    // Selection live tracking
  }

  function handlePdfSelectionEnd(e) {
    const targetEl = e ? getSafeElement(e.target) : null;
    // Don't close floating toolbar if user is clicking buttons on the toolbar itself
    if (targetEl && (targetEl.closest('#pdf-floating-toolbar') || targetEl.closest('#pdf-highlight-popover') || targetEl.closest('.pdf-color-picker-dropdown'))) {
      return;
    }

    const selection = window.getSelection();
    const toolbar = document.getElementById('pdf-floating-toolbar');
    const container = document.getElementById('pdf-page-container');
    const textLayer = document.getElementById('pdf-text-layer');

    if (!selection || selection.isCollapsed || !container || !textLayer) {
      if (toolbar && targetEl && !targetEl.closest('#pdf-floating-toolbar')) {
        toolbar.style.display = 'none';
      }
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      if (toolbar) toolbar.style.display = 'none';
      return;
    }

    // Check if selection is inside our PDF container
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    if (!container.contains(commonAncestor) && !textLayer.contains(commonAncestor)) {
      if (toolbar) toolbar.style.display = 'none';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rangeRect = range.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());

    if (clientRects.length === 0 || containerRect.width === 0 || containerRect.height === 0) {
      return;
    }

    // Compute normalized coordinates (0.0 to 1.0) so zoom invariance works perfectly
    const normalizedRects = clientRects.map(r => ({
      x: Math.max(0, (r.left - containerRect.left) / containerRect.width),
      y: Math.max(0, (r.top - containerRect.top) / containerRect.height),
      w: Math.min(1, r.width / containerRect.width),
      h: Math.min(1, r.height / containerRect.height)
    })).filter(r => r.w > 0.005 && r.h > 0.005);

    activeSelectionData = {
      text: selectedText,
      rects: normalizedRects,
      page_number: pdfCurrentPageNum
    };

    if (toolbar) {
      toolbar.style.display = 'flex';
      const toolbarX = Math.max(120, Math.min(window.innerWidth - 160, rangeRect.left + (rangeRect.width / 2)));
      const toolbarY = Math.max(10, rangeRect.top + window.scrollY - 12);
      toolbar.style.left = `${toolbarX}px`;
      toolbar.style.top = `${toolbarY}px`;
    }
  }

  function handleOutsideClicks(e) {
    const targetEl = getSafeElement(e.target);
    if (!targetEl) return;
    if (!targetEl.closest('#pdf-highlight-popover') && !targetEl.closest('.pdf-highlight-mark')) {
      const pop = document.getElementById('pdf-highlight-popover');
      if (pop) pop.style.display = 'none';
    }
    if (!targetEl.closest('.pdf-color-picker-dropdown')) {
      const menu = document.getElementById('pdf-color-picker-menu');
      if (menu) menu.style.display = 'none';
    }
  }

  // --- FLOATING TOOLBAR ACTIONS ---
  window.copySelectionText = async function () {
    if (!activeSelectionData || !activeSelectionData.text) return;
    try {
      await navigator.clipboard.writeText(activeSelectionData.text);
      showToast(`✓ Copied "${activeSelectionData.text.slice(0, 30)}..." to clipboard!`);
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = activeSelectionData.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('✓ Text copied to clipboard!');
    }
    const toolbar = document.getElementById('pdf-floating-toolbar');
    if (toolbar) toolbar.style.display = 'none';
  };

  window.applyHighlightFromToolbar = async function (color, label) {
    if (isViewerRole()) {
      showToast('View-only access: Highlighting is disabled in viewer mode.', 'info');
      return;
    }
    if (!activeSelectionData || !activeSelectionData.text) {
      handlePdfSelectionEnd({ target: document.getElementById('pdf-page-container') });
    }
    if (!activeSelectionData || !activeSelectionData.text || !activePaper) return;

    const newHighlight = {
      id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      paper_id: activePaper.id,
      page_number: activeSelectionData.page_number,
      color: color || defaultHighlightColor,
      color_label: label || defaultHighlightLabel,
      selected_text: activeSelectionData.text,
      rects: activeSelectionData.rects,
      created_at: new Date().toISOString()
    };

    // Optimistic UI update
    paperHighlights.push(newHighlight);
    localStorage.setItem(`litsphere_hl_${activePaper.id}`, JSON.stringify(paperHighlights));
    updateHighlightsUi();

    if (currentPdfDoc) {
      currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
        const viewport = page.getViewport({ scale: pdfScale });
        renderPageHighlights(pdfCurrentPageNum, viewport);
      });
    }

    // Dismiss selection & floating toolbar
    window.getSelection().removeAllRanges();
    const toolbar = document.getElementById('pdf-floating-toolbar');
    if (toolbar) toolbar.style.display = 'none';

    showToast(`✓ Marked in ${label || 'Highlight'} (Page ${activeSelectionData.page_number})`);

    // Persist to Backend API
    try {
      const res = await fetch(`/api/papers/${activePaper.id}/highlights`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          page_number: newHighlight.page_number,
          color: newHighlight.color,
          color_label: newHighlight.color_label,
          selected_text: newHighlight.selected_text,
          rects: newHighlight.rects
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.highlight && data.highlight.id) {
          newHighlight.id = data.highlight.id;
          localStorage.setItem(`litsphere_hl_${activePaper.id}`, JSON.stringify(paperHighlights));
        }
      }
    } catch (err) {
      console.warn('Notice: Background highlight sync', err.message);
    }
  };

  window.addSelectionToDetailedSummary = function () {
    if (!canEditPaperData()) {
      showToast('View-only access: Cannot modify detailed summary.', 'warning');
      return;
    }
    if (!activeSelectionData || !activeSelectionData.text) return;
    const summaryInput = document.getElementById('detailed-summary-input');
    if (summaryInput) {
      const excerpt = `[Page ${activeSelectionData.page_number}] "${activeSelectionData.text}"`;
      summaryInput.value = summaryInput.value ? `${summaryInput.value}\n\n${excerpt}` : excerpt;
      handleDetailedSummaryChange(summaryInput.value);
      showToast('✓ Added quote excerpt to Detailed Summary!');
      applyHighlightFromToolbar(defaultHighlightColor, defaultHighlightLabel);
    }
  };

  // --- CLICKED HIGHLIGHT POPOVER LOGIC ---
  function showHighlightPopover(hl, clientX, clientY) {
    activeClickedHighlight = hl;
    const popover = document.getElementById('pdf-highlight-popover');
    if (!popover) return;

    const tagEl = document.getElementById('popover-color-tag');
    const pageEl = document.getElementById('popover-page-badge');
    const quoteEl = document.getElementById('popover-quote-box');

    if (tagEl) {
      tagEl.textContent = hl.color_label || 'Key Point';
      tagEl.style.color = hl.color || '#38bdf8';
    }
    if (pageEl) pageEl.textContent = `Page ${hl.page_number}`;
    if (quoteEl) quoteEl.textContent = hl.selected_text || '';

    const swatchPicker = popover.querySelector('.popover-swatch-picker');
    const deleteBtn = popover.querySelector('.popover-btn.danger');
    if (swatchPicker) swatchPicker.style.display = isViewerRole() ? 'none' : 'block';
    if (deleteBtn) deleteBtn.style.display = isViewerRole() ? 'none' : 'inline-block';

    popover.style.display = 'block';
    const popX = Math.max(10, Math.min(window.innerWidth - 280, clientX - 130));
    const popY = Math.max(10, clientY - 140);
    popover.style.left = `${popX}px`;
    popover.style.top = `${popY}px`;
  }

  window.updateActiveHighlightColor = async function (newColor, newLabel) {
    if (isViewerRole()) {
      showToast('View-only access: Cannot change highlight color.', 'info');
      return;
    }
    if (!activeClickedHighlight) return;
    activeClickedHighlight.color = newColor;
    activeClickedHighlight.color_label = newLabel;

    if (activePaper) {
      localStorage.setItem(`litsphere_hl_${activePaper.id}`, JSON.stringify(paperHighlights));
    }
    updateHighlightsUi();

    if (currentPdfDoc) {
      currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
        const viewport = page.getViewport({ scale: pdfScale });
        renderPageHighlights(pdfCurrentPageNum, viewport);
      });
    }

    const popover = document.getElementById('pdf-highlight-popover');
    if (popover) popover.style.display = 'none';

    showToast(`✓ Color updated to ${newLabel}`);

    if (typeof activeClickedHighlight.id === 'number' || !String(activeClickedHighlight.id).startsWith('hl_')) {
      try {
        await fetch(`/api/papers/highlights/${activeClickedHighlight.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ color: newColor, color_label: newLabel })
        });
      } catch (e) {}
    }
  };

  window.copyActiveHighlightQuote = async function () {
    if (!activeClickedHighlight) return;
    const text = activeClickedHighlight.selected_text || '';
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ Quote copied to clipboard!');
    } catch (e) {
      showToast('✓ Quote copied!');
    }
    const popover = document.getElementById('pdf-highlight-popover');
    if (popover) popover.style.display = 'none';
  };

  window.deleteActiveHighlight = async function () {
    if (isViewerRole()) {
      showToast('View-only access: Cannot delete highlight.', 'info');
      return;
    }
    if (!activeClickedHighlight) return;
    const hlId = activeClickedHighlight.id;
    paperHighlights = paperHighlights.filter(h => h.id !== hlId);

    if (activePaper) {
      localStorage.setItem(`litsphere_hl_${activePaper.id}`, JSON.stringify(paperHighlights));
    }
    updateHighlightsUi();

    if (currentPdfDoc) {
      currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
        const viewport = page.getViewport({ scale: pdfScale });
        renderPageHighlights(pdfCurrentPageNum, viewport);
      });
    }

    const popover = document.getElementById('pdf-highlight-popover');
    if (popover) popover.style.display = 'none';

    showToast('Highlight deleted.');

    if (typeof hlId === 'number' || !String(hlId).startsWith('hl_')) {
      try {
        await fetch(`/api/papers/highlights/${hlId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      } catch (e) {}
    }
  };

  // --- TOOLBAR CONTROLS ---
  window.toggleHighlightMode = function () {
    if (isViewerRole()) {
      showToast('View-only access: Marker tool is disabled.', 'info');
      return;
    }
    isHighlightModeActive = !isHighlightModeActive;
    const btn = document.getElementById('btn-highlight-mode-toggle');
    if (btn) {
      btn.classList.toggle('active', isHighlightModeActive);
    }
    showToast(isHighlightModeActive ? 'Marker mode enabled: Select text on PDF to highlight' : 'Marker mode disabled');
  };

  window.toggleColorPickerMenu = function () {
    if (isViewerRole()) return;
    const menu = document.getElementById('pdf-color-picker-menu');
    if (menu) {
      menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
  };

  window.setDefaultHighlightColor = function (color, label) {
    defaultHighlightColor = color;
    defaultHighlightLabel = label;
    const swatch = document.getElementById('pdf-current-color-swatch');
    if (swatch) swatch.style.backgroundColor = color;
    const menu = document.getElementById('pdf-color-picker-menu');
    if (menu) menu.style.display = 'none';
    showToast(`Default highlight color: ${label}`);
  };

  window.pdfFitWidth = function () {
    if (!currentPdfDoc) return;
    const leftPane = document.getElementById('review-left-pane');
    if (!leftPane) return;
    currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
      const baseViewport = page.getViewport({ scale: 1.0 });
      const availableWidth = Math.max(300, leftPane.clientWidth - 48);
      pdfScale = Math.max(0.5, Math.min(2.5, availableWidth / baseViewport.width));
      const zoomVal = document.getElementById('pdf-zoom-val');
      if (zoomVal) zoomVal.textContent = `${Math.round(pdfScale * 100)}%`;
      renderPdfPage(pdfCurrentPageNum);
    });
  };

  // --- RIGHT-PANE HIGHLIGHTS SECTION RENDERING ---
  window.renderHighlightsList = function (filterColor = 'all') {
    const container = document.getElementById('highlights-list-container');
    if (!container) return;

    let items = [...paperHighlights];
    if (filterColor && filterColor !== 'all') {
      items = items.filter(h => h.color === filterColor);
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="highlights-empty-state">
          <span>No highlights in this filter.</span><br>
          <small style="color:var(--text-tertiary); font-size:10.5px;">Select any text in the PDF reader to highlight in Yellow, Green, Blue, Purple, Pink, or Orange.</small>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(hl => {
      const color = hl.color || '#fef08a';
      const label = hl.color_label || 'Key Point';
      const page = hl.page_number || 1;
      const quote = esc(hl.selected_text || '');
      const deleteBtnHtml = isViewerRole() ? '' : `<button type="button" class="hl-action-mini-btn danger" onclick="deleteHighlightFromList('${hl.id}', event)" title="Delete highlight">Delete</button>`;
      return `
        <div class="highlight-card" style="--hl-color:${color};" onclick="jumpToHighlightPage(${page}, '${hl.id}')">
          <div class="highlight-card-header">
            <span class="hl-tag-badge">${esc(label)}</span>
            <span class="hl-page-tag">Page ${page}</span>
          </div>
          <div class="highlight-card-quote">"${quote}"</div>
          <div class="highlight-card-actions" onclick="event.stopPropagation();">
            <button type="button" class="hl-action-mini-btn" onclick="copyHighlightQuoteFromList('${encodeURIComponent(hl.selected_text || '')}', event)" title="Copy excerpt">Copy</button>
            ${deleteBtnHtml}
          </div>
        </div>
      `;
    }).join('');
  };

  window.filterHighlightsByColor = function (color) {
    currentHighlightFilter = color;
    renderHighlightsList(color);
  };

  window.jumpToHighlightPage = function (pageNum, hlId) {
    if (!currentPdfDoc || pageNum < 1 || pageNum > pdfTotalPages) return;
    pdfCurrentPageNum = pageNum;
    renderPdfPage(pageNum);

    const viewportEl = document.getElementById('pdf-viewport');
    if (viewportEl) {
      viewportEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setTimeout(() => {
      const marks = document.querySelectorAll(`[data-hl-id="${hlId}"]`);
      marks.forEach(m => {
        m.classList.add('pulse-highlight');
        setTimeout(() => m.classList.remove('pulse-highlight'), 2400);
      });
    }, 350);
  };

  window.copyHighlightQuoteFromList = async function (encodedQuote, e) {
    if (e) e.stopPropagation();
    const text = decodeURIComponent(encodedQuote || '');
    try {
      await navigator.clipboard.writeText(text);
      showToast('✓ Quote excerpt copied to clipboard!');
    } catch (err) {
      showToast('✓ Excerpt copied!');
    }
  };

  window.deleteHighlightFromList = async function (hlId, e) {
    if (isViewerRole()) {
      showToast('View-only access: Cannot delete highlight.', 'info');
      return;
    }
    if (e) e.stopPropagation();
    paperHighlights = paperHighlights.filter(h => String(h.id) !== String(hlId));

    if (activePaper) {
      localStorage.setItem(`litsphere_hl_${activePaper.id}`, JSON.stringify(paperHighlights));
    }
    updateHighlightsUi();

    if (currentPdfDoc) {
      currentPdfDoc.getPage(pdfCurrentPageNum).then(page => {
        const viewport = page.getViewport({ scale: pdfScale });
        renderPageHighlights(pdfCurrentPageNum, viewport);
      });
    }

    showToast('Highlight deleted');

    if (typeof hlId === 'number' || !String(hlId).startsWith('hl_')) {
      try {
        await fetch(`/api/papers/highlights/${hlId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      } catch (err) {}
    }
  };

  window.exportHighlightsAsNotes = async function () {
    if (paperHighlights.length === 0) {
      showToast('No highlights yet to export for this paper.');
      return;
    }

    const title = activePaper ? (activePaper.title || 'Paper Review') : 'Paper Review';
    const doi = activePaper && activePaper.doi ? ` (DOI: ${activePaper.doi})` : '';

    let markdown = `# Literature Synthesis & Highlights: ${title}${doi}\n\n`;

    const grouped = {};
    paperHighlights.forEach(h => {
      const p = h.page_number || 1;
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(h);
    });

    Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).forEach(p => {
      markdown += `### Page ${p}\n`;
      grouped[p].forEach(h => {
        markdown += `- **[${h.color_label || 'Highlight'}]**: "${h.selected_text || ''}"\n`;
      });
      markdown += '\n';
    });

    try {
      await navigator.clipboard.writeText(markdown);
      showToast('✓ All paper highlights & synthesis notes copied as Markdown!');
    } catch (err) {
      showToast('✓ Highlights formatted & copied!');
    }
  };

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
    if (!canEditPaperData()) {
      showToast('View-only access: Cannot upload PDF manuscript.', 'warning');
      return;
    }
    if (!input.files || input.files.length === 0 || !activePaper) return;
    const file = input.files[0];
    try { input.value = ''; } catch (_) {}
    const formData = new FormData();
    formData.append('pdf', file);

    showPdfLoader('Uploading Manuscript...', `Uploading ${file.name}...`, true);

    const speedEl = document.getElementById('pdf-loader-speed');
    const bytesEl = document.getElementById('pdf-loader-bytes');
    const etaEl = document.getElementById('pdf-loader-eta');
    const pillLabel = document.getElementById('pdf-loader-filesize-label');
    const initialMb = (file.size / (1024 * 1024)).toFixed(1);
    if (speedEl) speedEl.textContent = '⚡ Starting...';
    if (bytesEl) bytesEl.textContent = `0 MB / ${initialMb} MB`;
    if (etaEl) etaEl.textContent = '⏱ ETA: --';
    if (pillLabel) pillLabel.textContent = `Uploading: 0 MB / ${initialMb} MB`;

    try {
      let data;
      if (typeof window.uploadWithProgress === 'function') {
        data = await window.uploadWithProgress({
          url: `/api/papers/${activePaper.id}/pdf`,
          method: 'POST',
          formData,
          onProgress: ({ percent, rateStr, bytesStr, etaStr, isComplete }) => {
            updatePdfLoaderProgress(percent, isComplete ? 'Saving manuscript on server...' : `Uploading ${file.name}...`);
            if (speedEl) speedEl.textContent = isComplete ? '⚡ Complete' : rateStr;
            if (bytesEl) bytesEl.textContent = bytesStr;
            if (etaEl) etaEl.textContent = etaStr;
            if (pillLabel) pillLabel.textContent = isComplete ? `Uploaded: ${bytesStr}` : `Uploading: ${bytesStr}`;
          }
        });
      } else {
        const token = localStorage.getItem('litsphere_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
        const res = await fetch(`/api/papers/${activePaper.id}/pdf`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData
        });
        if (!res.ok) throw new Error('Failed to upload PDF manuscript.');
        data = await res.json();
      }

      if (data && data.pdf_url) {
        activePaper.pdf_url = data.pdf_url;
        showPdfLoader('Opening Manuscript...', 'Parsing uploaded manuscript...', false);
        loadPdfPreview(data.pdf_url);
        showToast('PDF manuscript uploaded successfully!');
      } else {
        hidePdfLoader();
        showToast('Failed to upload PDF manuscript.', 'error');
      }
    } catch (err) {
      hidePdfLoader();
      showToast('Failed to upload PDF: ' + err.message, 'error');
    }
  };

  /* ────────────────────────────────────────────────────────────────
     12. UTILITIES
  ──────────────────────────────────────────────────────────────── */
  function getAuthHeaders() {
    const token = localStorage.getItem('litsphere_auth_token') || localStorage.getItem('token') || localStorage.getItem('jwt');
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

  /* ────────────────────────────────────────────────────────────────
     13. DELETE / REMOVE ACTIVE PAPER FROM SURVEY (MODAL ENGINE)
  ──────────────────────────────────────────────────────────────── */
  window.openDeleteModal = function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot delete papers.', 'warning');
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const paperIdFromUrl = parseInt(urlParams.get('paper') || urlParams.get('paperId') || '0', 10);
    const paperIdToDelete = currentPaperId || paperIdFromUrl || (activePaper && activePaper.id);

    const modal = document.getElementById('delete-paper-modal');
    if (!modal) {
      // Fallback if modal DOM element is missing
      return window.executePaperDelete();
    }

    const targetBox = document.getElementById('delete-paper-target-box');
    const titleText = (activePaper && activePaper.title) ? activePaper.title : `Paper #${paperIdToDelete || ''}`;
    const serialText = (activePaper && activePaper.serial_no) ? `[#${activePaper.serial_no}] ` : '';
    if (targetBox) {
      targetBox.textContent = `📄 ${serialText}${titleText}`;
    }

    const confirmBtn = document.getElementById('btn-confirm-delete-paper');
    const confirmText = document.getElementById('confirm-delete-text');
    if (confirmBtn) confirmBtn.disabled = false;
    if (confirmText) confirmText.textContent = 'Yes, Delete Paper';

    modal.style.display = 'flex';
  };

  window.closeDeleteModal = function () {
    const modal = document.getElementById('delete-paper-modal');
    if (modal) modal.style.display = 'none';
  };

  window.handleDeletePaper = function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot delete papers.', 'warning');
      return;
    }
    window.openDeleteModal();
  };

  window.executePaperDelete = async function () {
    if (!canEditPaperData()) {
      showToast('View-only access: You cannot delete papers.', 'warning');
      window.closeDeleteModal();
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const paperIdFromUrl = parseInt(urlParams.get('paper') || urlParams.get('paperId') || '0', 10);
    const projectIdFromUrl = parseInt(urlParams.get('project') || urlParams.get('projectId') || '1', 10);
    const paperIdToDelete = currentPaperId || paperIdFromUrl || (activePaper && activePaper.id);
    const targetProjectId = currentProjectId || projectIdFromUrl || (activePaper && activePaper.project_id) || 1;

    if (!paperIdToDelete) {
      showToast('No active paper found to delete.');
      window.closeDeleteModal();
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-delete-paper');
    const confirmText = document.getElementById('confirm-delete-text');
    const headerBtn = document.getElementById('btn-delete-paper-header');
    const paneBtn = document.getElementById('btn-remove-paper-pane');

    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmText) confirmText.textContent = 'Deleting Paper...';
    if (headerBtn) headerBtn.disabled = true;
    if (paneBtn) paneBtn.disabled = true;

    setHeaderSaveStatus('saving');
    showToast('Deleting paper from survey...');

    try {
      await window.api.delete(`/api/papers/${paperIdToDelete}`);
      setHeaderSaveStatus('saved');
      showToast('Paper deleted successfully! Returning to workspace...');
      window.closeDeleteModal();
      setTimeout(() => {
        window.location.href = `/workspace?project=${targetProjectId}`;
      }, 600);
    } catch (err) {
      setHeaderSaveStatus('error');
      showToast(`Deletion failed: ${err.message}`);
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmText) confirmText.textContent = 'Yes, Delete Paper';
      if (headerBtn) headerBtn.disabled = false;
      if (paneBtn) paneBtn.disabled = false;
    }
  };

  // Close modal on escape key or backdrop click
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeDeleteModal();
    }
  });

  document.addEventListener('click', (e) => {
    const modal = document.getElementById('delete-paper-modal');
    if (modal && e.target === modal) {
      window.closeDeleteModal();
    }
  });

})();

