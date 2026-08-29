/**
 * LITNEXIS WORKSPACE STATE STORE
 * Centralized reactive store for workspace project, clusters, filters, and papers.
 */

window.allProjects = [];
window.activeProjectId = 1;
window.allPapers = [];
window.unassignedPapers = [];
window.allClusters = [];
window.activeClusterColumns = [];
window.activeDataColumns = [];
window.globalKeywordsList = [];
window.currentClusterId = 'all';
window.currentDomain = 'all';
window.currentStatus = 'all';
window.searchQuery = '';
window.activePaper = null;
window.paperKeywords = [];
window.currentProjectRole = 'owner';
window.currentScreeningVote = null;
window.currentAttachedQuote = null;
window.currentPaperComments = [];

// PDF Viewer State
window.currentPdfDoc = null;
window.pdfCurrentPageNum = 1;
window.pdfTotalPages = 0;
window.pdfScale = 1.25;
window.isRenderingPdf = false;
window.pdfRenderQueue = null;

// Proxy object for structured namespace
window.WorkspaceState = {
  get allProjects() { return window.allProjects; },
  set allProjects(v) { window.allProjects = v; },
  get activeProjectId() { return window.activeProjectId; },
  set activeProjectId(v) { window.activeProjectId = v; },
  get allPapers() { return window.allPapers; },
  set allPapers(v) { window.allPapers = v; },
  get unassignedPapers() { return window.unassignedPapers; },
  set unassignedPapers(v) { window.unassignedPapers = v; },
  get allClusters() { return window.allClusters; },
  set allClusters(v) { window.allClusters = v; },
  get activeClusterColumns() { return window.activeClusterColumns; },
  set activeClusterColumns(v) { window.activeClusterColumns = v; },
  get activeDataColumns() { return window.activeDataColumns; },
  set activeDataColumns(v) { window.activeDataColumns = v; },
  get currentClusterId() { return window.currentClusterId; },
  set currentClusterId(v) { window.currentClusterId = v; },
  get currentDomain() { return window.currentDomain; },
  set currentDomain(v) { window.currentDomain = v; },
  get currentStatus() { return window.currentStatus; },
  set currentStatus(v) { window.currentStatus = v; },
  get searchQuery() { return window.searchQuery; },
  set searchQuery(v) { window.searchQuery = v; },
  get activePaper() { return window.activePaper; },
  set activePaper(v) { window.activePaper = v; },
  get currentProjectRole() { return window.currentProjectRole; },
  set currentProjectRole(v) { window.currentProjectRole = v; }
};

/**
 * Returns the permanent, fixed serial number (#) of a paper in the project.
 * This serial number remains static across all clusters, filters, and searches.
 */
window.getPaperSerialNo = function(paperOrId) {
  if (!paperOrId) return 1;
  const paperId = (typeof paperOrId === 'object') ? paperOrId.id : paperOrId;
  const papers = window.allPapers || [];
  if (Array.isArray(papers) && papers.length > 0) {
    const p = papers.find(item => item.id === paperId);
    if (p && p.serial_no !== undefined && p.serial_no !== null) return p.serial_no;
    // Fallback: deterministic sorted index by ID
    const sorted = [...papers].sort((a, b) => (a.id || 0) - (b.id || 0));
    const idx = sorted.findIndex(item => item.id === paperId);
    if (idx !== -1) return idx + 1;
  }
  if (typeof paperOrId === 'object' && paperOrId.serial_no !== undefined) {
    return paperOrId.serial_no;
  }
  return 1;
};
