import React, { useState } from 'react';

/* ─── Icon components (inline SVG, no external dependency) ─── */
const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const IconSun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const IconMoon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const IconDoi = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconExternalLink = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

/**
 * Professional Header Component
 *
 * Left pane:  breadcrumb → paper title (clickable) → taxonomy chips
 * Right pane: DOI auto-fetch search bar → icon actions (theme toggle, open source, back)
 */
export function Header({
  paperTitle,
  surveyTitle = 'My Survey',
  projectId = 1,
  paperId,
  selectedCluster,
  selectedDomain,
  selectedKeywords = [],
  doi,
  saveStatus = 'saved',
  onDoiFetch,
  isFetchingDoi,
  onOpenPaperSource,
  onBackToWorkspace,
  onClusterClick,
  theme = 'dark',
  onToggleTheme,
  leftPaneWidthPercent = 42,
}) {
  const [doiInput, setDoiInput] = useState(doi || '');
  const [doiFocused, setDoiFocused] = useState(false);

  const handleFetchClick = () => {
    if (!doiInput.trim()) return;
    onDoiFetch(doiInput.trim());
  };

  const hasAnyMetadata = Boolean(
    selectedCluster || selectedDomain || (selectedKeywords && selectedKeywords.length > 0)
  );

  /* Save indicator */
  const saveIndicator =
    saveStatus === 'saving'
      ? { cls: 'save-dot saving', label: 'Saving…' }
      : saveStatus === 'error'
      ? { cls: 'save-dot error', label: 'Save error' }
      : { cls: 'save-dot saved', label: 'All saved' };

  /* Cluster label: show assigned name or "Unassign Cluster" */
  const isClusterAssigned = Boolean(selectedCluster && selectedCluster.trim() && selectedCluster.trim() !== 'Unassigned Cluster' && selectedCluster.trim() !== 'Unassign Cluster');
  const clusterLabel = isClusterAssigned ? selectedCluster.trim() : 'Unassign Cluster';

  // Navigation handlers
  const handleHomeClick = (e) => {
    e.stopPropagation();
    if (onBackToWorkspace) {
      onBackToWorkspace();
    } else {
      window.location.href = `/workspace?project=${projectId || 1}`;
    }
  };

  const handleSurveyClick = (e) => {
    e.stopPropagation();
    window.location.href = `/workspace?project=${projectId || 1}`;
  };

  const handleClusterNavClick = (e) => {
    e.stopPropagation();
    if (onClusterClick) {
      onClusterClick(selectedCluster);
    } else {
      const clusterParam = isClusterAssigned ? encodeURIComponent(selectedCluster.trim()) : 'unassigned';
      window.location.href = `/workspace?project=${projectId || 1}&cluster=${clusterParam}`;
    }
  };

  const handlePaperNavClick = (e) => {
    e.stopPropagation();
    if (onOpenPaperSource) {
      onOpenPaperSource();
    } else if (paperId) {
      window.location.href = `/review_react.html?project=${projectId || 1}&paper=${paperId}`;
    }
  };

  return (
    <header className="header">
      {/* ── LEFT PANE: breadcrumb (row 1) + title & chips (row 2) ── */}
      <div className="header-left" style={{ flex: `0 0 ${leftPaneWidthPercent}%`, width: `${leftPaneWidthPercent}%` }}>

        {/* Row 1: Breadcrumb */}
        <div className="header-left-row1">
          <nav className="header-breadcrumb" aria-label="Breadcrumb">

            {/* Segment 1: LitSphere (clickable → Home/Matrix) */}
            <span
              className="breadcrumb-item breadcrumb-home"
              onClick={handleHomeClick}
              title="LitSphere - Return to Survey Matrix"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleHomeClick(e); }}
            >
              LitSphere
            </span>

            <span className="breadcrumb-sep" aria-hidden="true">›</span>

            {/* Segment 2: Survey / Project Title (clickable → Project Workspace) */}
            <span
              className="breadcrumb-item breadcrumb-survey"
              onClick={handleSurveyClick}
              title={`Survey: ${surveyTitle} (Click to open Survey Workspace)`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSurveyClick(e); }}
            >
              {surveyTitle}
            </span>

            <span className="breadcrumb-sep" aria-hidden="true">›</span>

            {/* Segment 3: Cluster Name or "Unassign Cluster" (clickable → Filtered Workspace / Section) */}
            <span
              className={`breadcrumb-item ${isClusterAssigned ? 'breadcrumb-cluster' : 'breadcrumb-unassigned'}`}
              onClick={handleClusterNavClick}
              title={isClusterAssigned ? `Taxonomy Cluster: ${selectedCluster} (Click to view in workspace)` : 'Unassign Cluster (Click to manage clusters)'}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClusterNavClick(e); }}
            >
              {clusterLabel}
            </span>

            <span className="breadcrumb-sep" aria-hidden="true">›</span>

            {/* Segment 4: Paper Title (clickable → Open Manuscript / Current Session) */}
            <span
              className="breadcrumb-item breadcrumb-paper breadcrumb-current"
              onClick={handlePaperNavClick}
              title={`Paper: ${paperTitle || 'Untitled Paper'} (Click to open source manuscript)`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePaperNavClick(e); }}
            >
              {paperTitle || 'Untitled Paper'}
            </span>

          </nav>
        </div>

        {/* Row 2: Title & Meta chips */}
        <div className="header-left-row2">
          <div className="header-title-row">
            <div
              className="title-main"
              onClick={onOpenPaperSource}
              title="Open source manuscript in new tab"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenPaperSource(); }}
            >
              {paperTitle || 'Untitled Paper'}
            </div>
            <span className="title-open-icon" onClick={onOpenPaperSource} title="Open source">
              <IconExternalLink />
            </span>
          </div>

          {/* Metadata chips */}
          <div className="title-sub-tags">
            {selectedCluster && (
              <span className="meta-chip chip-cluster" title={`Taxonomy Cluster: ${selectedCluster}`}>
                <span className="chip-icon">🔬</span>
                <span className="chip-label">{selectedCluster}</span>
              </span>
            )}
            {selectedDomain && (
              <span className="meta-chip chip-domain" title={`Research Domain: ${selectedDomain}`}>
                <span className="chip-icon">🌐</span>
                <span className="chip-label">{selectedDomain}</span>
              </span>
            )}
            {selectedKeywords && selectedKeywords.length > 0 && selectedKeywords.map((kw, idx) => (
              <span className="meta-chip chip-keyword" key={`kw-${idx}`} title={`Keyword: ${kw}`}>
                <span className="chip-icon">🏷️</span>
                <span className="chip-label">{kw}</span>
              </span>
            ))}
            {!hasAnyMetadata && (
              <span className="meta-chip chip-empty">No taxonomy assigned</span>
            )}
          </div>
        </div>

        {/* Accent bottom bar */}
        <div className="header-left-accent" />
      </div>

      {/* ── RIGHT PANE: actions (row 1) + DOI search (row 2) ── */}
      <div className="header-right">

        {/* Row 1: Save Status + Icon Actions */}
        <div className="header-right-row1">
          {/* Save Status */}
          <div className="header-save-status" title={saveIndicator.label}>
            <span className={saveIndicator.cls} />
            <span className="save-label">{saveIndicator.label}</span>
          </div>

          {/* Divider */}
          <div className="header-divider" />

          {/* Icon Actions */}
          <div className="header-actions">
            {/* Theme Toggle */}
            <button
              type="button"
              className="icon-action-btn"
              onClick={onToggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <IconMoon /> : <IconSun />}
            </button>

            {/* Open Source */}
            <button
              type="button"
              className="icon-action-btn"
              onClick={onOpenPaperSource}
              title="Open manuscript source in new tab"
              aria-label="Open paper source"
            >
              <IconExternalLink />
            </button>

            {/* Back to Matrix */}
            <button
              type="button"
              className="back-workspace-btn"
              onClick={onBackToWorkspace}
              title="Return to Literature Review Matrix"
            >
              <IconArrowLeft />
              <span>Matrix</span>
            </button>
          </div>
        </div>

        {/* Row 2: DOI Search Bar */}
        <div className="header-right-row2">
          <div className={`doi-search-bar${doiFocused ? ' focused' : ''}`}>
            <span className="doi-search-icon"><IconDoi /></span>
            <input
              type="text"
              className="doi-input"
              placeholder="Paste DOI to auto-fill metadata…"
              value={doiInput}
              onChange={(e) => setDoiInput(e.target.value)}
              onFocus={() => setDoiFocused(true)}
              onBlur={() => setDoiFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFetchClick(); }}
              disabled={isFetchingDoi}
              aria-label="DOI Auto-Fetch input"
            />
            <button
              type="button"
              className="fetch-btn"
              onClick={handleFetchClick}
              disabled={isFetchingDoi || !doiInput.trim()}
            >
              {isFetchingDoi ? (
                <span className="fetch-spinner" />
              ) : (
                'Fetch'
              )}
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
