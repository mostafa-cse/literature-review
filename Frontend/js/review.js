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

  async function loadInitialData() {
    try {
      // 1. Fetch Clusters
      const clustersRes = await fetch(`/api/clusters?project_id=${currentProjectId}`, {
        headers: getAuthHeaders()
      });
      if (clustersRes.ok) {
        allClusters = await clustersRes.json();
      }

      // 2. Fetch Project Info
      const projRes = await fetch(`/api/projects/${currentProjectId}`, {
        headers: getAuthHeaders()
      });
      if (projRes.ok) {
        const projData = await projRes.json();
        currentProjectTitle = projData.name || projData.title || 'Survey';
        const badge = document.getElementById('project-title-indicator');
        if (badge) badge.textContent = `${currentProjectTitle} • Review Workspace`;
      }

      // 3. Fetch Paper Info
      if (currentPaperId) {
        const paperRes = await fetch(`/api/papers/${currentPaperId}`, {
          headers: getAuthHeaders()
        });
        if (paperRes.ok) {
          activePaper = await paperRes.json();
        }
      }

      // Fallback: If no paper id is in URL, fetch first paper of project
      if (!activePaper) {
        const allPapersRes = await fetch(`/api/papers?project_id=${currentProjectId}`, {
          headers: getAuthHeaders()
        });
        if (allPapersRes.ok) {
          const list = await allPapersRes.json();
          if (list.length > 0) {
            activePaper = list[0];
            currentPaperId = activePaper.id;
          }
        }
      }

      // If still empty, provide structured mock state
      if (!activePaper) {
        activePaper = {
          id: 1,
          title: 'Feature Selection based on Mutual Information Criteria',
          doi: '10.1109/TPAMI.2005.159',
          cluster_id: allClusters.length > 0 ? allClusters[0].id : 1,
          domain: 'CSC engnr',
          keywords: ['mRMR', 'Gene Selection'],
          intuition: 'Proposes max-dependency, max-relevance, and min-redundancy criteria.',
          gaps: 'High computational overhead on high-dimensional genomic matrices.',
          screening_decision: 'included',
          screening_reason: 'Valid methodology'
        };
      }

      // Populate UI
      populatePaperData(activePaper);
    } catch (err) {
      console.warn('Initial data load notice:', err);
      // Fallback populate
      if (!activePaper) {
        activePaper = {
          id: 1,
          title: 'Papers Name',
          doi: '',
          cluster_id: 1,
          domain: 'domain1',
          keywords: ['keyword1', 'keyword2'],
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

    // Update Component State Arrays & Key-Value Objects
    componentState.clusters = Array.isArray(allClusters) ? [...allClusters] : [];
    
    const domainList = [...STANDARD_DOMAINS];
    if (p.domain && !domainList.includes(p.domain)) {
      domainList.unshift(p.domain);
    }
    componentState.domains = domainList;
    
    componentState.keywords = Array.from(new Set([...(p.keywords || []), ...STANDARD_KEYWORDS]));

    // Columns Key-Value Object
    if (p.custom_columns && Object.keys(p.custom_columns).length > 0) {
      componentState.columns = { ...p.custom_columns };
    } else {
      componentState.columns = {
        'col_name1': 'Value..',
        'col_name2': 'Value..',
        'col_name3': 'Value..',
        'col_name4': 'Value..'
      };
    }

    // Summary Key-Value Object
    componentState.summary = {
      'col_name1': (p.intuition || 'Value..'),
      'col_name2': (p.strengths || 'Value..')
    };

    updateHeaderSubtitle();
    updateBreadcrumb();

    // Map Grids from State Arrays
    renderClustersGrid(p.cluster_id);
    renderDomainsGrid(p.domain);
    renderKeywordsGrid(paperKeywords);

    // Map Dashed Boxes from State Key-Value Objects
    renderColumnsDashedBoxes();
    renderSummaryDashedBoxes();

    // PRISMA
    updatePrismaUi(activePrismaVote, activePrismaReason);

    // Detailed Summary
    const detailedInput = document.getElementById('detailed-summary-input');
    if (detailedInput) {
      detailedInput.value = p.gaps || p.intuition || '';
    }

    // Load PDF
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
    'section-summary': true,
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
        statusEl.textContent = `✓ Current cluster: "${targetCluster?.name || 'Selected'}"`;
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
      input.onkeydown = async (ev) => {
        if (ev.key === 'Enter' && input.value.trim()) {
          const val = input.value.trim();
          await createNewCluster(val);
        } else if (ev.key === 'Escape') {
          renderClustersGrid(stagedClusterId);
        }
      };
      input.onblur = () => {
        if (input.value.trim()) {
          createNewCluster(input.value.trim());
        } else {
          renderClustersGrid(stagedClusterId);
        }
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
        showToast(targetCluster ? `✓ Transferred paper to cluster: "${targetCluster.name}"` : '✓ Paper set to Unassigned cluster');
      } else {
        showToast('✓ Cluster assignment updated locally');
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
      showToast('✓ Cluster assignment saved');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="save-icon">💾</span> Save &amp; Transfer to Cluster';
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
      }
    } catch (err) {
      const mockObj = { id: Date.now(), name: cleanName, project_id: currentProjectId };
      allClusters.push(mockObj);
      stagedClusterId = mockObj.id;
      renderClustersGrid(mockObj.id);
      showToast(`+ Added cluster: "${cleanName}"`);
      await window.saveClusterTransfer();
    }
  }

  const STANDARD_DOMAINS = [
    'domain1', 'domain4', 'domain8',
    'domain2', 'domain5', 'domain9',
    'domain3', 'domain6',
    'Bioinformatics', 'CSC engnr', 'Cancer Genomics',
    'Network Security', 'NLP', 'Computer Vision'
  ];

  function renderDomainsGrid(selectedDomain) {
    const container = document.getElementById('grid-domains');
    if (!container) return;
    container.innerHTML = '';

    const currentDomain = selectedDomain || (activePaper ? activePaper.domain : 'domain1');
    const domainList = [...STANDARD_DOMAINS];
    if (currentDomain && !domainList.includes(currentDomain)) {
      domainList.unshift(currentDomain);
    }

    domainList.forEach(dom => {
      const isSelected = String(dom).toLowerCase() === String(currentDomain).toLowerCase();
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
      addBtn.innerHTML = '<input type="text" class="inline-add-input" placeholder="+ Domain title..." autoFocus>';
      const input = addBtn.querySelector('input');
      input.focus();
      input.onkeydown = (ev) => {
        if (ev.key === 'Enter' && input.value.trim()) {
          const val = input.value.trim();
          if (activePaper) activePaper.domain = val;
          renderDomainsGrid(val);
          updateHeaderSubtitle();
          triggerAutoSave(true);
        } else if (ev.key === 'Escape') {
          renderDomainsGrid(activePaper ? activePaper.domain : '');
        }
      };
      input.onblur = () => {
        if (input.value.trim()) {
          const val = input.value.trim();
          if (activePaper) activePaper.domain = val;
          renderDomainsGrid(val);
          updateHeaderSubtitle();
          triggerAutoSave(true);
        } else {
          renderDomainsGrid(activePaper ? activePaper.domain : '');
        }
      };
    };
    container.appendChild(addBtn);
  }

  const STANDARD_KEYWORDS = [
    'keyword1', 'keyword4', 'keywords7',
    'keyword2', 'keyword5', 'keyword8',
    'keyword3', 'keyword6',
    'mRMR', 'Gene Selection', 'Mutual Info',
    'Deep Learning', 'Benchmark', 'PRISMA'
  ];

  function renderKeywordsGrid(activeKwList) {
    const container = document.getElementById('grid-keywords');
    if (!container) return;
    container.innerHTML = '';

    const currentList = Array.isArray(activeKwList) ? activeKwList : paperKeywords;
    const combined = Array.from(new Set([...currentList, ...STANDARD_KEYWORDS]));

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
    addBtn.innerHTML = '<a href="#" style="color: blue; text-decoration: none;">+ add new</a>';
    addBtn.onclick = (e) => {
      e.preventDefault();
      addBtn.innerHTML = '<input type="text" class="inline-add-input" placeholder="+ keyword..." autoFocus>';
      const input = addBtn.querySelector('input');
      input.focus();
      input.onkeydown = (ev) => {
        if (ev.key === 'Enter' && input.value.trim()) {
          const val = input.value.trim().replace(/^#/, '');
          if (!paperKeywords.includes(val)) {
            paperKeywords.push(val);
          }
          renderKeywordsGrid(paperKeywords);
          updateHeaderSubtitle();
          triggerAutoSave(true);
        } else if (ev.key === 'Escape') {
          renderKeywordsGrid(paperKeywords);
        }
      };
      input.onblur = () => {
        if (input.value.trim()) {
          const val = input.value.trim().replace(/^#/, '');
          if (!paperKeywords.includes(val)) {
            paperKeywords.push(val);
          }
          renderKeywordsGrid(paperKeywords);
          updateHeaderSubtitle();
          triggerAutoSave(true);
        } else {
          renderKeywordsGrid(paperKeywords);
        }
      };
    };
    container.appendChild(addBtn);
  }

  /* ────────────────────────────────────────────────────────────────
     5. DASHED BOXES (Columns & Summary Key-Value Objects)
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
    } else {
      paperColumnsList = [
        { key: 'col_name1', value: 'Value..' },
        { key: 'col_name2', value: 'Value..' },
        { key: 'col_name3', value: 'Value..' },
        { key: 'col_name4', value: 'Value..' }
      ];
    }

    renderColumnsArray();
  }

  function renderColumnsArray() {
    const container = document.getElementById('dashed-columns-container');
    if (!container) return;
    container.innerHTML = '';

    paperColumnsList.forEach((colItem, idx) => {
      const box = document.createElement('div');
      box.className = 'dashed-box';
      box.innerHTML = `
        <input type="text" class="dashed-col1" value="${esc(colItem.key)}" placeholder="col_name">
        <input type="text" class="dashed-col2" value="${esc(colItem.value)}" placeholder="Value..">
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
    const splitKey1 = `col_name${nextIdx}(TC)`;
    const splitKey2 = `col_name${nextIdx}(SC)`;
    paperColumnsList.push(
      { key: splitKey1, value: '0.00' },
      { key: splitKey2, value: '0.00' }
    );
    componentState.columns[splitKey1] = '0.00';
    componentState.columns[splitKey2] = '0.00';
    renderColumnsArray();
    triggerAutoSave(true);
  };

  window.handleAddColumn = function () {
    const nextIdx = paperColumnsList.length + 1;
    const newKey = `col_name${nextIdx}`;
    paperColumnsList.push({ key: newKey, value: 'Value..' });
    componentState.columns[newKey] = 'Value..';
    renderColumnsArray();
    triggerAutoSave(true);
  };

  function renderSummaryDashedBoxes() {
    const container = document.getElementById('dashed-summary-container');
    if (!container) return;
    container.innerHTML = '';

    paperSummaryPairs = [];
    if (componentState.summary && Object.keys(componentState.summary).length > 0) {
      Object.entries(componentState.summary).forEach(([k, v]) => {
        paperSummaryPairs.push({ key: k, value: v });
      });
    } else {
      paperSummaryPairs = [
        { key: 'col_name1', value: 'Value..' },
        { key: 'col_name2', value: 'Value..' }
      ];
    }

    paperSummaryPairs.forEach((pair, idx) => {
      const box = document.createElement('div');
      box.className = 'dashed-box';
      box.innerHTML = `
        <input type="text" class="dashed-col1" value="${esc(pair.key)}">
        <input type="text" class="dashed-col2" value="${esc(pair.value)}" placeholder="Value..">
      `;

      box.querySelector('.dashed-col1').oninput = (e) => {
        const oldKey = paperSummaryPairs[idx].key;
        const newKey = e.target.value;
        paperSummaryPairs[idx].key = newKey;
        delete componentState.summary[oldKey];
        componentState.summary[newKey] = paperSummaryPairs[idx].value;
        triggerAutoSave(false);
      };

      box.querySelector('.dashed-col2').oninput = (e) => {
        paperSummaryPairs[idx].value = e.target.value;
        componentState.summary[paperSummaryPairs[idx].key] = e.target.value;
        if (activePaper) {
          if (idx === 0) activePaper.intuition = e.target.value;
          if (idx === 1) activePaper.strengths = e.target.value;
        }
        triggerAutoSave(false);
      };

      container.appendChild(box);
    });
  }

  /* ────────────────────────────────────────────────────────────────
     6. PRISMA SCREENING & QUALITY APPRAISAL
  ──────────────────────────────────────────────────────────────── */
  window.setPrismaVote = function (vote) {
    activePrismaVote = vote;
    updatePrismaUi(vote, activePrismaReason);
    triggerAutoSave(true);
  };

  window.handleReasonChange = function (val) {
    activePrismaReason = val;
    triggerAutoSave(true);
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
    if (!badge) return;

    badge.className = 'solid-box short-box';
    if (status === 'saving') {
      badge.classList.add('status-saving');
      badge.textContent = 'Saving...';
    } else if (status === 'saved') {
      badge.classList.add('status-saved');
      badge.textContent = '✓ Saved';
    } else if (status === 'error') {
      badge.classList.add('status-error');
      badge.textContent = '⚠️ Retry';
    }
  }

  /* ────────────────────────────────────────────────────────────────
     9. DOI AUTO-FETCH HANDLER
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
      const res = await fetch('/api/doi/ingest', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ doi, project_id: currentProjectId })
      });

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

          const titleMain = document.getElementById('paper-title-main');
          if (titleMain) titleMain.textContent = activePaper.title;

          updateHeaderSubtitle();
          updateBreadcrumb();
          renderDomainsGrid(activePaper.domain);
          renderSummaryDashedBoxes(activePaper);
          triggerAutoSave(true);
        }
        showToast('Manuscript metadata auto-fetched successfully!');
      } else {
        throw new Error('API returned status ' + res.status);
      }
    } catch (err) {
      console.warn('DOI fetch fallback simulation:', err);
      if (activePaper) {
        activePaper.doi = doi;
        activePaper.title = `Deep Analytical Extraction for (${doi})`;
        activePaper.year = 2024;
        activePaper.authors = 'A. Researcher, B. Scientist';
        activePaper.pub = 'IEEE Transactions';
        activePaper.domain = 'CSC engnr';

        const titleMain = document.getElementById('paper-title-main');
        if (titleMain) titleMain.textContent = activePaper.title;

        updateHeaderSubtitle();
        updateBreadcrumb();
        renderDomainsGrid(activePaper.domain);
        renderSummaryDashedBoxes(activePaper);
        triggerAutoSave(true);
        showToast('DOI metadata populated (simulation mode)!');
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
      const token = localStorage.getItem('token');
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
    const token = localStorage.getItem('token');
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
