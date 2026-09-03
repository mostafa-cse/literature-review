/**
 * LITSPHERE ABOUT PAGE INTERACTIVE ENGINE (aboutInteractive.js)
 * Powers:
 * 1. Interactive Multi-Tool Comparison Matrix & Category Filtering
 * 2. Research ROI & Time-Saved Calculator (dynamic paper & team slider)
 * 3. 5-Stage Systematic Literature Review Lifecycle Flow
 * 4. Interactive Architecture Visualizer Demos (KaTeX renderer, Column Splitter, SQLite WAL simulator)
 */

(function() {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     1. COMPARISON MATRIX CONTROLLER
  ───────────────────────────────────────────────────────────── */
  window.filterComparisonCategory = function(category, btn) {
    document.querySelectorAll('.matrix-filter-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const rows = document.querySelectorAll('#comparison-matrix-tbody tr');
    let visibleCount = 0;

    rows.forEach(row => {
      const rowCat = row.getAttribute('data-category');
      if (category === 'all' || rowCat === category) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });

    const counter = document.getElementById('comparison-visible-count');
    if (counter) {
      counter.textContent = `Showing ${visibleCount} academic criteria`;
    }
  };

  window.toggleRowDetails = function(rowId) {
    const detailsRow = document.getElementById(`details-${rowId}`);
    if (!detailsRow) return;

    const isVisible = detailsRow.style.display === 'table-row';
    document.querySelectorAll('.comparison-detail-row').forEach(r => r.style.display = 'none');
    document.querySelectorAll('.btn-row-expand').forEach(b => b.textContent = '+');

    if (!isVisible) {
      detailsRow.style.display = 'table-row';
      const triggerBtn = document.getElementById(`btn-expand-${rowId}`);
      if (triggerBtn) triggerBtn.textContent = '−';
    }
  };

  /* ─────────────────────────────────────────────────────────────
     2. RESEARCH ROI & TIME-SAVED CALCULATOR
  ───────────────────────────────────────────────────────────── */
  function initRoiCalculator() {
    const sliderPapers = document.getElementById('roi-slider-papers');
    const sliderTeam = document.getElementById('roi-slider-team');

    if (!sliderPapers || !sliderTeam) return;

    function recalculate() {
      const papers = parseInt(sliderPapers.value, 10) || 60;
      const team = parseInt(sliderTeam.value, 10) || 2;

      // Update slider value labels
      const labelPapers = document.getElementById('roi-val-papers');
      const labelTeam = document.getElementById('roi-val-team');
      if (labelPapers) labelPapers.textContent = `${papers} papers`;
      if (labelTeam) labelTeam.textContent = `${team} ${team === 1 ? 'researcher' : 'researchers'}`;

      // Mathematical models for literature review workload
      // Spreadsheets/Docs: manual copy-pasting, lost PDFs, retyping formulas, coordinating versions
      const manualHoursPerPaper = 2.4; // reading, re-typing metadata, hunting PDF highlights, reformatting
      const manualTeamOverhead = (team - 1) * 14; // merge conflicts, outdated email spreadsheets, citation mismatches
      const totalManualHours = Math.round((papers * manualHoursPerPaper) + manualTeamOverhead);

      // LitSphere: 1-click DOI ingestion, split-screen KaTeX extraction, auto-saving WAL, instant exports
      const litSphereHoursPerPaper = 0.65;
      const litSphereTeamOverhead = (team - 1) * 2;
      const totalLitSphereHours = Math.round((papers * litSphereHoursPerPaper) + litSphereTeamOverhead);

      const hoursSaved = Math.max(12, totalManualHours - totalLitSphereHours);
      const percentSaved = Math.round((hoursSaved / totalManualHours) * 100);
      const errorReduction = Math.min(98, Math.round(88 + (papers / 30) + (team * 1.5)));

      // Animate counter values
      animateVal('roi-stat-hours-saved', hoursSaved, ' hrs');
      animateVal('roi-stat-percent', percentSaved, '%');
      animateVal('roi-stat-error', errorReduction, '%');
      animateVal('roi-stat-manual-time', totalManualHours, ' hrs');
      animateVal('roi-stat-litsphere-time', totalLitSphereHours, ' hrs');
    }

    sliderPapers.addEventListener('input', recalculate);
    sliderTeam.addEventListener('input', recalculate);

    // Initial calculation
    recalculate();
  }

  function animateVal(elementId, target, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;

    const currentText = el.textContent.replace(/[^\d]/g, '');
    const start = parseInt(currentText, 10) || 0;
    const duration = 400;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(start + (target - start) * progress);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target + suffix;
      }
    }
    requestAnimationFrame(update);
  }

  /* ─────────────────────────────────────────────────────────────
     3. 5-STAGE SYSTEMATIC REVIEW LIFECYCLE CONTROLLER
  ───────────────────────────────────────────────────────────── */
  const LIFECYCLE_STAGES = [
    {
      id: 1,
      name: 'Stage 1: Ingestion & DOI Resolution',
      tag: 'AUTOMATED INTAKE',
      desc: 'Drag and drop bulk PDF files or paste lists of DOIs. LitSphere executes 1st-page title/author regex heuristics and queries the CrossRef REST API to pull peer-reviewed metadata in seconds.',
      kpi: 'Sub-second metadata ingestion with zero manual copying.',
      deliverable: 'Unassigned candidate paper corpus organized into staging trays.'
    },
    {
      id: 2,
      name: 'Stage 2: PRISMA 2020 Blind Screening',
      tag: 'METHODOLOGICAL APPRAISAL',
      desc: 'Conduct double-blind inclusion and exclusion appraisals. Reviewers independently vote on titles and abstracts, select verified screening criteria justifications, and resolve disputes.',
      kpi: 'PRISMA 2020 flow telemetry auto-calculated with complete audit trails.',
      deliverable: 'Eligible primary studies qualified for in-depth data extraction.'
    },
    {
      id: 3,
      name: 'Stage 3: Split-Screen KaTeX Extraction',
      tag: 'DEEP READING & MATH',
      desc: 'Open manuscripts in a synchronized dual-pane viewer. Read full PDFs with persistent multi-color highlighters on the left while entering equations, Big-O complexity, and key metrics on the right.',
      kpi: 'Native KaTeX formula rendering with zero mathematical distortion.',
      deliverable: 'Standardized quantitative and qualitative extracted variables.'
    },
    {
      id: 4,
      name: 'Stage 4: Dynamic Matrix Benchmarking',
      tag: 'HIGH-DENSITY COMPARISON',
      desc: 'Organize studies into hierarchical taxonomy clusters. Split parent columns into nested sub-headers (e.g., Complexity $\\to$ Time vs. Space) and double-click cells for Excel-like inline editing.',
      kpi: 'Instant SQLite WAL auto-saving with non-blocking concurrent writes.',
      deliverable: 'Comparative literature review matrix with grouped taxonomy headers.'
    },
    {
      id: 5,
      name: 'Stage 5: Synthesis & Thesis Export',
      tag: 'DISSEMINATION & DEFENSE',
      desc: 'Generate automated research gap analyses and dataset frequency summaries. Export the entire literature review into multi-level Excel spreadsheets, Overleaf LaTeX BibTeX, RIS, or APA/IEEE citations.',
      kpi: '100% compatible with Overleaf, Zotero, Mendeley, and Microsoft Excel.',
      deliverable: 'Ready-to-compile Chapter 2 literature review bundle for thesis defense.'
    }
  ];

  window.selectLifecycleStage = function(stageId, btn) {
    document.querySelectorAll('.lifecycle-step-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const stage = LIFECYCLE_STAGES.find(s => s.id === stageId);
    if (!stage) return;

    const titleEl = document.getElementById('lifecycle-stage-title');
    const tagEl = document.getElementById('lifecycle-stage-tag');
    const descEl = document.getElementById('lifecycle-stage-desc');
    const kpiEl = document.getElementById('lifecycle-stage-kpi');
    const delivEl = document.getElementById('lifecycle-stage-deliv');

    if (titleEl) titleEl.textContent = stage.name;
    if (tagEl) tagEl.textContent = stage.tag;
    if (descEl) descEl.textContent = stage.desc;
    if (kpiEl) kpiEl.textContent = stage.kpi;
    if (delivEl) delivEl.textContent = stage.deliverable;

    // Trigger LaTeX rendering if any
    setTimeout(() => {
      if (window.renderMathInElement) {
        renderMathInElement(document.getElementById('lifecycle-display-card'), {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    }, 50);
  };

  /* ─────────────────────────────────────────────────────────────
     4. INTERACTIVE SUBSYSTEM DEMOS (KaTeX, Column Splitter, SQLite)
  ───────────────────────────────────────────────────────────── */
  window.testInteractiveLatex = function(formulaCode) {
    const previewBox = document.getElementById('demo-latex-render-box');
    if (!previewBox) return;

    if (window.katex) {
      previewBox.innerHTML = window.katex.renderToString(formulaCode, { displayMode: true, throwOnError: false });
    } else {
      previewBox.textContent = formulaCode;
    }
  };

  window.simulateColumnSplit = function() {
    const parentHeader = document.getElementById('demo-parent-col');
    const subHeaderRow = document.getElementById('demo-sub-col-row');
    const splitBtn = document.getElementById('btn-demo-split-col');

    if (!parentHeader || !subHeaderRow) return;

    if (subHeaderRow.style.display === 'none') {
      parentHeader.setAttribute('colspan', '2');
      subHeaderRow.style.display = 'table-row';
      if (splitBtn) splitBtn.textContent = 'Merge Columns Back';
    } else {
      parentHeader.removeAttribute('colspan');
      subHeaderRow.style.display = 'none';
      if (splitBtn) splitBtn.textContent = 'Split into Time & Space Sub-Columns';
    }
  };

  /* ─────────────────────────────────────────────────────────────
     5. INITIALIZATION
  ───────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    initRoiCalculator();
    
    // Select first lifecycle stage by default
    const firstStageBtn = document.querySelector('.lifecycle-step-btn');
    if (firstStageBtn) {
      selectLifecycleStage(1, firstStageBtn);
    }

    // Trigger LaTeX on About page
    setTimeout(() => {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    }, 150);
  });

})();
