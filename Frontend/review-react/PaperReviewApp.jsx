import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './Header';
import { PdfViewer } from './PdfViewer';
import { SectionWrapper } from './SectionWrapper';
import { GridList } from './GridList';
import { DashedBoxList } from './DashedBoxList';
import { PrismaScreening } from './PrismaScreening';
import { DetailedSummary } from './DetailedSummary';
import { useDebounce } from './useDebounce';
import { INITIAL_PAPER_STATE, savePaperToDb, fetchPaperByDoi } from './mockDb';
import './ReviewApp.css';

/**
 * Main PaperReviewApp Component
 * Top-level orchestrator connecting all modular sub-components,
 * local state arrays/objects, debounced background auto-save, theme toggling, and API simulation.
 */
export function PaperReviewApp() {
  // 1. Theme State (Dark / Light)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('litnexis_theme') ||
      document.documentElement.getAttribute('data-theme') ||
      'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('litnexis_theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // 2. Layout State
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('litnexis_review_split');
      if (saved) return Math.max(20, Math.min(75, parseFloat(saved)));
    } catch (e) {}
    return 42;
  });

  const handleResizeDrag = (pct) => {
    setLeftPaneWidth(pct);
    try {
      localStorage.setItem('litnexis_review_split', pct);
      document.documentElement.style.setProperty('--split-left-width', `${pct}%`);
    } catch (e) {}
  };

  // 3. Paper Metadata & Core State
  const [paper, setPaper] = useState(() => {
    try {
      const saved = localStorage.getItem('litnexis_paper_101');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading saved paper:', e);
    }
    return INITIAL_PAPER_STATE;
  });

  // 4. Status & Loading States
  const [isFetchingDoi, setIsFetchingDoi] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'
  const [toastMessage, setToastMessage] = useState(null);

  // 5. Breadcrumb: Survey Title & IDs (fetched from project API via URL param)
  const [surveyTitle, setSurveyTitle] = useState('My Survey');
  const [projectId, setProjectId] = useState(1);
  const [paperId, setPaperId] = useState(101);
  const [surveyClusters, setSurveyClusters] = useState([]);
  const [stagedCluster, setStagedCluster] = useState(() => paper.selectedCluster || '');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = parseInt(params.get('project') || params.get('projectId') || '1', 10);
    const papId = parseInt(params.get('paper') || params.get('paperId') || '101', 10);
    setProjectId(pid);
    setPaperId(papId);

    // 1. Fetch Project Info
    fetch(`/api/projects/${pid}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setSurveyTitle(data.name || data.title || 'My Survey');
        }
      })
      .catch(() => { /* keep default */ });

    // 2. Fetch Clusters for this specific survey
    fetch(`/api/clusters?project_id=${pid}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data)) {
          setSurveyClusters(data);
        }
      })
      .catch(() => setSurveyClusters([]));

    // 3. Fetch Dynamic Columns & Survey Papers to aggregate domains, keywords, and columns
    Promise.all([
      fetch(`/api/dynamic-columns?project_id=${pid}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/papers?project_id=${pid}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/papers/${papId}`).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([dynCols, allPapers, singlePaper]) => {
      const activeP = singlePaper || (allPapers.length > 0 ? allPapers[0] : null);

      // Aggregate domains across survey papers
      const domSet = new Set();
      if (Array.isArray(allPapers)) {
        allPapers.forEach(p => { if (p && p.domain && p.domain.trim()) domSet.add(p.domain.trim()); });
      }
      if (activeP && activeP.domain && activeP.domain.trim()) domSet.add(activeP.domain.trim());

      // Aggregate keywords across survey papers
      const kwSet = new Set();
      if (Array.isArray(allPapers)) {
        allPapers.forEach(p => {
          if (p && Array.isArray(p.keywords)) {
            p.keywords.forEach(k => { if (k && typeof k === 'string' && k.trim()) kwSet.add(k.trim()); });
          }
        });
      }
      if (activeP && Array.isArray(activeP.keywords)) {
        activeP.keywords.forEach(k => { if (k && typeof k === 'string' && k.trim()) kwSet.add(k.trim()); });
      }

      // Map dynamic columns
      const colMap = {};
      if (Array.isArray(dynCols)) {
        dynCols.forEach(col => {
          const colName = col.column_name || col.name;
          if (colName) colMap[colName] = '';
        });
      }
      if (activeP && activeP.custom_columns) {
        Object.entries(activeP.custom_columns).forEach(([k, v]) => {
          if (k && !k.startsWith('col_') && !/^\d+$/.test(k)) colMap[k] = v || '';
        });
      }
      if (activeP && Array.isArray(activeP.column_values)) {
        activeP.column_values.forEach(cv => {
          if (cv.column_name) colMap[cv.column_name] = cv.value || '';
        });
      }
      const colList = Object.entries(colMap).map(([key, value]) => ({ key, value }));

      if (activeP) {
        setPaper(prev => {
          const clusterTitle = activeP.cluster_name || '';
          setStagedCluster(clusterTitle);
          return {
            ...prev,
            id: activeP.id,
            title: activeP.title || prev.title,
            doi: activeP.doi || prev.doi,
            selectedCluster: clusterTitle,
            domains: Array.from(domSet),
            selectedDomain: activeP.domain || '',
            keywords: Array.from(kwSet),
            selectedKeywords: Array.isArray(activeP.keywords) ? activeP.keywords : [],
            columns: colList.length > 0 ? colList : prev.columns,
            detailedSummary: activeP.gaps || activeP.intuition || prev.detailedSummary
          };
        });
      }
    });
  }, []);

  // Debounced paper state for text inputs (750ms delay)
  const debouncedPaper = useDebounce(paper, 750);
  const isFirstRender = useRef(true);

  // Show temporary toast notification
  const showToast = useCallback((msg, duration = 3000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, duration);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // AUTO-SAVE ENGINE: Watches debounced paper changes & saves
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let isMounted = true;
    setSaveStatus('saving');

    savePaperToDb(debouncedPaper)
      .then(() => {
        if (isMounted) {
          setSaveStatus('saved');
        }
      })
      .catch((err) => {
        console.error('Auto-save failed:', err);
        if (isMounted) {
          setSaveStatus('error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedPaper]);

  // Immediate save for non-text actions (e.g. PRISMA radio clicks, CRUD additions)
  const triggerImmediateSave = useCallback((updatedPaper) => {
    setSaveStatus('saving');
    savePaperToDb(updatedPaper)
      .then(() => {
        setSaveStatus('saved');
      })
      .catch((err) => {
        console.error('Immediate auto-save error:', err);
        setSaveStatus('error');
      });
  }, []);

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: Paper Reading & Review Initializer
  // ─────────────────────────────────────────────────────────────
  const handleOpenPaperSource = () => {
    const targetUrl = paper.doi
      ? `https://doi.org/${paper.doi}`
      : (paper.pdfUrl || 'https://scholar.google.com');

    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    showToast(`📄 Initialized Review Paper session for: "${paper.title}"`);
  };

  const handleBackToWorkspace = () => {
    window.location.href = `/workspace?project=${projectId}`;
  };

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: DOI Auto-Fetch Simulation
  // ─────────────────────────────────────────────────────────────
  const handleDoiFetch = async (doiString) => {
    setIsFetchingDoi(true);
    try {
      const fetchedData = await fetchPaperByDoi(doiString);
      const updated = {
        ...paper,
        title: fetchedData.title,
        doi: fetchedData.doi,
        pdfUrl: fetchedData.pdfUrl,
        selectedCluster: fetchedData.selectedCluster,
        domains: Array.from(new Set([...paper.domains, ...fetchedData.domains])),
        selectedDomain: fetchedData.selectedDomain,
        keywords: Array.from(new Set([...paper.keywords, ...fetchedData.keywords])),
        selectedKeywords: fetchedData.selectedKeywords,
        detailedSummary: fetchedData.detailedSummary
      };
      setPaper(updated);
      setStagedCluster(fetchedData.selectedCluster);
      triggerImmediateSave(updated);
      showToast(`✓ Successfully fetched DOI metadata: ${doiString}`);
    } catch (err) {
      showToast(`⚠ ${err.message || 'DOI fetch failed'}`);
    } finally {
      setIsFetchingDoi(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: Taxonomy Grids (Cluster, Domain, Keywords)
  // ─────────────────────────────────────────────────────────────
  const handleSelectCluster = (clusterName) => {
    // Toggle staged selection
    setStagedCluster((prev) => (prev === clusterName ? '' : clusterName));
  };

  const handleSaveClusterTransfer = async (targetClusterName) => {
    const target = targetClusterName !== undefined ? targetClusterName : stagedCluster;
    const clObj = surveyClusters.find((c) => c.name === target);
    const clusterId = clObj ? clObj.id : null;

    const updated = {
      ...paper,
      selectedCluster: target || ''
    };
    setPaper(updated);
    setStagedCluster(target || '');
    triggerImmediateSave(updated);

    // Persist to backend if real paper ID exists
    try {
      if (paperId) {
        await fetch(`/api/papers/${paperId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cluster_id: clusterId })
        });
      }
    } catch (e) {
      console.warn('Backend cluster transfer save error:', e);
    }

    if (target) {
      showToast(`✓ Transferred paper to cluster: "${target}"`);
    } else {
      showToast('✓ Paper set to Unassigned cluster');
    }
  };

  const handleAddCluster = async (newClusterTitle) => {
    const cleanName = (newClusterTitle || '').trim();
    if (!cleanName) return;

    // Check if already in surveyClusters
    const exists = surveyClusters.some((c) => c.name?.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      setStagedCluster(cleanName);
      return;
    }

    try {
      const res = await fetch('/api/clusters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, project_id: projectId })
      });

      let created = null;
      if (res.ok) {
        created = await res.json();
      } else {
        created = { id: Date.now(), name: cleanName, project_id: projectId };
      }

      setSurveyClusters((prev) => [...prev, created]);
      setStagedCluster(cleanName);
      showToast(`+ Added new cluster: "${cleanName}" to survey`);
      // Automatically save and transfer to this newly added cluster
      await handleSaveClusterTransfer(cleanName);
    } catch (err) {
      const mockCl = { id: Date.now(), name: cleanName, project_id: projectId };
      setSurveyClusters((prev) => [...prev, mockCl]);
      setStagedCluster(cleanName);
      showToast(`+ Added cluster: "${cleanName}"`);
      await handleSaveClusterTransfer(cleanName);
    }
  };

  const handleSelectDomain = (domainName) => {
    const updated = {
      ...paper,
      selectedDomain: paper.selectedDomain === domainName ? '' : domainName
    };
    setPaper(updated);
    triggerImmediateSave(updated);
  };

  const handleAddDomain = (newDomain) => {
    if (paper.domains.includes(newDomain)) return;
    const updated = {
      ...paper,
      domains: [...paper.domains, newDomain],
      selectedDomain: newDomain
    };
    setPaper(updated);
    triggerImmediateSave(updated);
    showToast(`+ Added domain: [${newDomain}]`);
  };

  const handleToggleKeyword = (kw) => {
    const current = paper.selectedKeywords || [];
    const updatedKws = current.includes(kw)
      ? current.filter((k) => k !== kw)
      : [...current, kw];

    const updated = { ...paper, selectedKeywords: updatedKws };
    setPaper(updated);
    triggerImmediateSave(updated);
  };

  const handleAddKeyword = (newKw) => {
    if (paper.keywords.includes(newKw)) return;
    const updated = {
      ...paper,
      keywords: [...paper.keywords, newKw],
      selectedKeywords: [...(paper.selectedKeywords || []), newKw]
    };
    setPaper(updated);
    triggerImmediateSave(updated);
    showToast(`+ Added keyword: [${newKw}]`);
  };

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: Dashed Columns & Summary
  // ─────────────────────────────────────────────────────────────
  const handleColumnsChange = (newColumns) => {
    setPaper((prev) => ({ ...prev, columns: newColumns }));
  };

  const handleSummaryItemsChange = (newItems) => {
    setPaper((prev) => ({ ...prev, summaryItems: newItems }));
  };

  // ─────────────────────────────────────────────────────────────
  // ACTIONS: PRISMA & Detailed Summary
  // ─────────────────────────────────────────────────────────────
  const handlePrismaDecisionChange = (decision) => {
    const updated = { ...paper, prismaDecision: decision };
    setPaper(updated);
    triggerImmediateSave(updated);
  };

  const handlePrismaReasonChange = (reason) => {
    const updated = { ...paper, prismaReason: reason };
    setPaper(updated);
    triggerImmediateSave(updated);
  };

  const handleDetailedSummaryChange = (newText) => {
    setPaper((prev) => ({ ...prev, detailedSummary: newText }));
  };

  return (
    <div className="window-container">
      {/* 1. Top Header */}
      <Header
        paperTitle={paper.title}
        surveyTitle={surveyTitle}
        projectId={projectId}
        paperId={paperId}
        selectedCluster={paper.selectedCluster}
        selectedDomain={paper.selectedDomain}
        selectedKeywords={paper.selectedKeywords}
        doi={paper.doi}
        saveStatus={saveStatus}
        onDoiFetch={handleDoiFetch}
        isFetchingDoi={isFetchingDoi}
        onOpenPaperSource={handleOpenPaperSource}
        onBackToWorkspace={handleBackToWorkspace}
        onClusterClick={(cl) => {
          const el = document.getElementById('section-cluster');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('section-highlight-pulse');
            setTimeout(() => el.classList.remove('section-highlight-pulse'), 1200);
          }
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        leftPaneWidthPercent={leftPaneWidth}
      />

      {/* 2. Main Body Split-Screen */}
      <main className="main-body">
        {/* Left Pane (PDF Preview & Draggable Resizer) */}
        <PdfViewer
          leftPaneWidthPercent={leftPaneWidth}
          onResizeDrag={handleResizeDrag}
          pdfUrl={paper.pdfUrl}
          paperTitle={paper.title}
          onOpenPaperSource={handleOpenPaperSource}
        />

        {/* Right Pane (Interactive Review & Extraction Hub) */}
        <div className="right-pane">
          {/* Section 1: Research Taxonomy Clusters */}
          <SectionWrapper title="Research Taxonomy Clusters" id="section-cluster">
            <GridList
              items={surveyClusters.map(c => typeof c === 'object' ? c.name : c)}
              selectedItems={stagedCluster}
              onSelect={handleSelectCluster}
              onAddItem={handleAddCluster}
              isMultiSelect={false}
              placeholder="Add cluster..."
              emptyMessage="No clusters created yet for this survey. Click '+ add new' to create one."
            />
            <div className="cluster-action-bar" id="cluster-action-bar">
              <span className={`cluster-transfer-status ${stagedCluster === paper.selectedCluster ? 'saved' : ''}`}>
                {stagedCluster ? (stagedCluster === paper.selectedCluster ? `✓ Current cluster: "${stagedCluster}"` : `Target: "${stagedCluster}" (Unsaved)`) : (paper.selectedCluster ? `Target: Unassign (Current: "${paper.selectedCluster}")` : 'Current status: Unassigned')}
              </span>
              <button
                type="button"
                className="cluster-transfer-save-btn"
                id="btn-save-cluster"
                onClick={() => handleSaveClusterTransfer(stagedCluster)}
              >
                <span className="save-icon">💾</span> Save &amp; Transfer to Cluster
              </button>
            </div>
          </SectionWrapper>

          {/* Section 2: Domain */}
          <SectionWrapper title="Domain" id="section-domain">
            <GridList
              items={paper.domains}
              selectedItems={paper.selectedDomain}
              onSelect={handleSelectDomain}
              onAddItem={handleAddDomain}
              onSave={() => { triggerImmediateSave(paper); showToast('✓ Domain saved'); }}
              showSaveButton={true}
              saveButtonText="Save Domain"
              isMultiSelect={false}
              placeholder="Add domain..."
              emptyMessage="No domains defined yet for this survey. Click '+ add new' to create one."
            />
          </SectionWrapper>

          {/* Section 3: Keywords */}
          <SectionWrapper title="Keywords" id="section-keywords">
            <GridList
              items={paper.keywords}
              selectedItems={paper.selectedKeywords}
              isMultiSelect={true}
              onSelect={handleToggleKeyword}
              onAddItem={handleAddKeyword}
              onSave={() => { triggerImmediateSave(paper); showToast('✓ Keywords saved'); }}
              showSaveButton={true}
              saveButtonText="Save Keywords"
              placeholder="Add keyword..."
              emptyMessage="No keywords defined yet for this survey. Click '+ add new' to create one."
            />
          </SectionWrapper>

          {/* Section 4: Columns */}
          <SectionWrapper title="Columns" id="section-columns">
            <DashedBoxList
              items={paper.columns}
              onChangeItem={handleColumnsChange}
              onAddItem={handleColumnsChange}
              onSave={() => { triggerImmediateSave(paper); showToast('✓ Columns saved'); }}
              showActions={true}
              showSaveButton={true}
              addButtonText="Add new"
              splitButtonText="Split Column"
              saveButtonText="Save Columns"
              emptyMessage="No extraction columns defined yet for this survey. Click '+ Add new' to create one."
            />
          </SectionWrapper>

          {/* Section 5: PRISMA Blind Screening */}
          <SectionWrapper title="PRISMA Blind Screening & Quality Appraisal" id="section-prisma">
            <PrismaScreening
              decision={paper.prismaDecision}
              onDecisionChange={handlePrismaDecisionChange}
              reason={paper.prismaReason}
              onReasonChange={handlePrismaReasonChange}
              saveStatus={saveStatus}
            />
          </SectionWrapper>

          {/* Section 6: Detailed Summary (Formerly Section 7) */}
          <SectionWrapper title="Detailed Summary:" id="section-detailed-summary">
            <DetailedSummary
              value={paper.detailedSummary}
              onChange={handleDetailedSummaryChange}
              onSave={() => { triggerImmediateSave(paper); showToast('✓ Detailed Summary saved'); }}
              showSaveButton={true}
              saveButtonText="Save Summary"
            />
          </SectionWrapper>
        </div>
      </main>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="review-toast-popup">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default PaperReviewApp;
