/**
 * LITNEXIS WORKSPACE STATS ENGINE
 * Dynamic telemetry counters for both Global Workspace Overview and Dedicated Cluster Pages.
 */

window.loadStats = async function() {
  try {
    const isClusterPage = window.currentClusterId && window.currentClusterId !== 'all';

    const totalEl        = document.getElementById('stat-total-papers');
    const totalLabelEl   = document.getElementById('stat-total-label');
    const totalSubEl     = document.getElementById('stat-total-sub');

    const readEl         = document.getElementById('stat-read-count') || document.getElementById('stat-read-papers');
    const readLabelEl    = document.getElementById('stat-read-label');
    const readPctEl      = document.getElementById('stat-read-pct');

    const pendingEl      = document.getElementById('stat-pending-count');
    const pendingLabelEl = document.getElementById('stat-pending-label');
    const pendingSubEl   = document.getElementById('stat-pending-sub');

    const clustersEl     = document.getElementById('stat-clusters-count');
    const clustersLabelEl= document.getElementById('stat-clusters-label');
    const clustersSubEl  = document.getElementById('stat-clusters-sub');

    const keywordsEl     = document.getElementById('stat-keywords-count');
    const keywordsLabelEl= document.getElementById('stat-keywords-label');
    const keywordsSubEl  = document.getElementById('stat-keywords-sub');

    if (isClusterPage) {
      // -------------------------------------------------------------
      // DEDICATED CLUSTER PAGE TELEMETRY
      // -------------------------------------------------------------
      const clIdStr = String(window.currentClusterId);
      const papersList = Array.isArray(window.allPapers) ? window.allPapers : [];
      const clPapers = papersList.filter(p => String(p.cluster_id) === clIdStr);

      const totalPapers = clPapers.length;
      const readPapers = clPapers.filter(p => p.status === 'read').length;
      const inProgressPapers = clPapers.filter(p => p.status === 'in_progress').length;
      const unreadPapers = clPapers.filter(p => p.status === 'unread' || !p.status).length;
      const pendingPapers = unreadPapers + inProgressPapers;
      const pct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

      // Unique keywords tagged in this cluster's papers
      const kwSet = new Set();
      clPapers.forEach(p => {
        if (Array.isArray(p.keywords)) {
          p.keywords.forEach(k => {
            if (k && typeof k === 'string') {
              const trimmed = k.trim();
              if (trimmed) kwSet.add(trimmed.toLowerCase());
            }
          });
        }
      });

      // Custom / Dynamic matrix columns for this cluster (or active data columns)
      const allCols = Array.isArray(window.activeClusterColumns) ? window.activeClusterColumns : (window.activeDataColumns || []);
      const clCols = allCols.filter(c => String(c.cluster_id) === clIdStr);
      const colsCount = clCols.length > 0 ? clCols.length : allCols.length;

      // Card 1: Total Papers
      if (totalEl) totalEl.textContent = totalPapers;
      if (totalLabelEl) totalLabelEl.textContent = 'TOTAL PAPERS';
      if (totalSubEl) totalSubEl.textContent = 'In This Cluster';

      // Card 2: Read
      if (readEl) readEl.textContent = readPapers;
      if (readLabelEl) readLabelEl.textContent = 'READ';
      if (readPctEl) readPctEl.textContent = `(${pct}% of corpus)`;

      // Card 3: Pending
      if (pendingEl) pendingEl.textContent = pendingPapers;
      if (pendingLabelEl) pendingLabelEl.textContent = 'PENDING';
      if (pendingSubEl) pendingSubEl.textContent = `${unreadPapers} unread • ${inProgressPapers} in progress`;

      // Card 4: NUMBER OF COLUMNS (Replaces Total Clusters in Cluster Page)
      if (clustersEl) clustersEl.textContent = colsCount;
      if (clustersLabelEl) clustersLabelEl.textContent = 'MATRIX COLUMNS';
      if (clustersSubEl) clustersSubEl.textContent = 'Cluster Attributes';

      // Card 5: Keywords
      if (keywordsEl) keywordsEl.textContent = kwSet.size;
      if (keywordsLabelEl) keywordsLabelEl.textContent = 'KEYWORDS';
      if (keywordsSubEl) keywordsSubEl.textContent = 'Dynamic Tags';

    } else {
      // -------------------------------------------------------------
      const pid = (typeof activeProjectId !== 'undefined' && activeProjectId) ? activeProjectId : (window.activeProjectId || (new URLSearchParams(window.location.search)).get('project') || 1);
      const res = await fetch(`/api/stats?project_id=${pid}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load workspace telemetry counters');
      const stats = await res.json();

      const totalPapers = stats.total_papers || 0;
      const readPapers = stats.read_papers || 0;
      const inProgressPapers = stats.in_progress_papers || 0;
      const unreadPapers = stats.unread_papers || 0;
      const pendingPapers = stats.pending_papers !== undefined ? stats.pending_papers : (unreadPapers + inProgressPapers);
      const totalClusters = stats.total_clusters || 0;
      const totalKeywords = stats.total_keywords !== undefined ? stats.total_keywords : (stats.total_unique_keywords || 0);
      const pct = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;

      // Card 1: Total Papers
      if (totalEl) totalEl.textContent = totalPapers;
      if (totalLabelEl) totalLabelEl.textContent = 'TOTAL PAPERS';
      if (totalSubEl) totalSubEl.textContent = 'In Active Project';

      // Card 2: Read
      if (readEl) readEl.textContent = readPapers;
      if (readLabelEl) readLabelEl.textContent = 'READ';
      if (readPctEl) readPctEl.textContent = `(${pct}% of corpus)`;

      // Card 3: Pending
      if (pendingEl) pendingEl.textContent = pendingPapers;
      if (pendingLabelEl) pendingLabelEl.textContent = 'PENDING';
      if (pendingSubEl) pendingSubEl.textContent = `${unreadPapers} unread • ${inProgressPapers} in progress`;

      // Card 4: Total Clusters
      if (clustersEl) clustersEl.textContent = totalClusters;
      if (clustersLabelEl) clustersLabelEl.textContent = 'TOTAL CLUSTERS';
      if (clustersSubEl) clustersSubEl.textContent = 'Taxonomy Categories';

      // Card 5: Keywords
      if (keywordsEl) keywordsEl.textContent = totalKeywords;
      if (keywordsLabelEl) keywordsLabelEl.textContent = 'KEYWORDS';
      if (keywordsSubEl) keywordsSubEl.textContent = 'Dynamic Tags';
    }
  } catch (err) {
    console.warn('Load stats error:', err);
  }
};

// Synthesis section removed — stub to prevent errors from remaining call sites
window.loadSynthesisInsights = async function() { /* no-op */ };
