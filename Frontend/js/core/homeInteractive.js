/**
 * LITSPHERE HOMEPAGE INTERACTIVE VIEW SUITE
 * Powers all interactive playgrounds on the landing page:
 * 1. Interactive Master Matrix Playground (live cell edit, cluster filter, dataset switcher)
 * 2. Split-Screen Reader & KaTeX LaTeX Math Sandbox (live formula renderer, color highlighter)
 * 3. PRISMA 2020 Screening Simulator (inclusion/exclusion voting, appraisal criteria, live counters)
 * 4. Academic Citation & Multi-Format Export Generator (BibTeX, APA, IEEE, Harvard, Excel, Markdown)
 * 5. 4-Role Collaboration RBAC Explorer (Owner, Editor, Reviewer, Viewer granular permissions)
 * 6. Live Telemetry Counters & Particle Constellation
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     1. SAMPLE DATASETS FOR MATRIX PLAYGROUND
  ───────────────────────────────────────────────────────────── */
  const MATRIX_DATASETS = {
    speech: {
      name: 'Multilingual Speech-to-Bangla Translation',
      clusters: [
        { id: 'c1', name: 'Streaming Architectures', color: '#6366f1' },
        { id: 'c2', name: 'Low-Latency Inference', color: '#10b981' },
        { id: 'c3', name: 'Acoustic Benchmarks', color: '#f59e0b' }
      ],
      papers: [
        {
          id: 1,
          title: 'Streaming Multilingual Speech-to-Speech Translation with Chunked Attention',
          cluster: 'Streaming Architectures',
          clusterColor: '#6366f1',
          year: 2025,
          complexity: '$\\mathcal{O}(T \\cdot W \\log W)$',
          datasets: 'BanglaVoice, CoVoST-2',
          status: 'Included',
          latency: '240 ms'
        },
        {
          id: 2,
          title: 'Low-Latency Conformer-Transducer for Simultaneous Bangla Speech Processing',
          cluster: 'Low-Latency Inference',
          clusterColor: '#10b981',
          year: 2024,
          complexity: '$\\mathcal{O}(L \\cdot D^2)$',
          datasets: 'CommonVoice v14, B-Speech',
          status: 'Included',
          latency: '180 ms'
        },
        {
          id: 3,
          title: 'Cross-Lingual Acoustic Representation Transfer for Low-Resource Indic Languages',
          cluster: 'Acoustic Benchmarks',
          clusterColor: '#f59e0b',
          year: 2024,
          complexity: '$\\mathcal{O}(B \\cdot T \\cdot D)$',
          datasets: 'IndicTTS, VoxCeleb',
          status: 'Pending',
          latency: '310 ms'
        }
      ]
    },
    quantum: {
      name: 'Quantum Object Detection & Vision Benchmarks',
      clusters: [
        { id: 'c1', name: 'Quantum Neural Networks', color: '#8b5cf6' },
        { id: 'c2', name: 'Hybrid Classical-Quantum', color: '#38bdf8' },
        { id: 'c3', name: 'Circuit Optimization', color: '#ec4899' }
      ],
      papers: [
        {
          id: 1,
          title: 'A Systematic Review of Quantum Object Detection: Research Trends, Datasets and Methods',
          cluster: 'Quantum Neural Networks',
          clusterColor: '#8b5cf6',
          year: 2025,
          complexity: '$\\mathcal{O}(2^Q \\cdot K)$',
          datasets: 'IBM-Q 127, MNIST-Q',
          status: 'Included',
          latency: '95 ms'
        },
        {
          id: 2,
          title: 'Parameterized Quantum Circuits for Real-Time Edge Feature Extraction',
          cluster: 'Circuit Optimization',
          clusterColor: '#ec4899',
          year: 2024,
          complexity: '$\\mathcal{O}(Q \\cdot D \\log Q)$',
          datasets: 'Rigetti Aspen, CIFAR-10',
          status: 'Included',
          latency: '140 ms'
        },
        {
          id: 3,
          title: 'Hybrid Classical-Quantum Convolutional Architectures for High-Resolution Imagery',
          cluster: 'Hybrid Classical-Quantum',
          clusterColor: '#38bdf8',
          year: 2024,
          complexity: '$\\mathcal{O}(N \\cdot Q^2)$',
          datasets: 'ImageNet-Subset, Pennylane',
          status: 'Pending',
          latency: '220 ms'
        }
      ]
    },
    feature: {
      name: 'High-Dimensional Feature Selection & Taxonomy',
      clusters: [
        { id: 'c1', name: 'Filter Methods (MI, ReliefF)', color: '#3b82f6' },
        { id: 'c2', name: 'Wrapper & Metaheuristics', color: '#10b981' },
        { id: 'c3', name: 'Embedded & Sparse LASSO', color: '#f43f5e' }
      ],
      papers: [
        {
          id: 1,
          title: 'Deep Isolation Forest for High-Dimensional Outlier Detection & Sparse Modeling',
          cluster: 'Embedded & Sparse LASSO',
          clusterColor: '#f43f5e',
          year: 2024,
          complexity: '$\\mathcal{O}(N \\cdot D \\log K)$',
          datasets: 'NSL-KDD, MNIST, Arrhythmia',
          status: 'Included',
          latency: '60 ms'
        },
        {
          id: 2,
          title: 'Mutual Information & Maximum Relevance Minimum Redundancy Feature Selection',
          cluster: 'Filter Methods (MI, ReliefF)',
          clusterColor: '#3b82f6',
          year: 2023,
          complexity: '$\\mathcal{O}(D^2 \\cdot N)$',
          datasets: 'UNSW-NB15, Colon',
          status: 'Included',
          latency: '45 ms'
        },
        {
          id: 3,
          title: 'Particle Swarm Optimization for Multi-Objective High-Dimensional Classification',
          cluster: 'Wrapper & Metaheuristics',
          clusterColor: '#10b981',
          year: 2024,
          complexity: '$\\mathcal{O}(I \\cdot P \\cdot D)$',
          datasets: 'Leukemia, Lymphoma',
          status: 'Included',
          latency: '380 ms'
        }
      ]
    }
  };

  let activeDatasetKey = 'speech';
  let activeClusterFilter = 'all';

  /* ─────────────────────────────────────────────────────────────
     2. MATRIX PLAYGROUND CONTROLLER
  ───────────────────────────────────────────────────────────── */
  function initInteractiveMatrix() {
    renderMatrixDatasetTabs();
    renderClusterFilterPills();
    renderMatrixTable();
  }

  function renderMatrixDatasetTabs() {
    const container = document.getElementById('matrix-dataset-tabs');
    if (!container) return;

    container.innerHTML = Object.keys(MATRIX_DATASETS).map(key => {
      const active = key === activeDatasetKey ? 'active' : '';
      return `
        <button class="matrix-dataset-btn ${active}" onclick="window.switchMatrixDataset('${key}')">
          <span class="matrix-dataset-indicator"></span>
          <span>${MATRIX_DATASETS[key].name}</span>
        </button>
      `;
    }).join('');
  }

  function renderClusterFilterPills() {
    const container = document.getElementById('matrix-cluster-pills');
    if (!container) return;

    const dataset = MATRIX_DATASETS[activeDatasetKey];
    let html = `
      <button class="cluster-filter-pill ${activeClusterFilter === 'all' ? 'active' : ''}" onclick="window.filterMatrixCluster('all')">
        All Clusters (${dataset.papers.length})
      </button>
    `;

    dataset.clusters.forEach(c => {
      const active = activeClusterFilter === c.name ? 'active' : '';
      html += `
        <button class="cluster-filter-pill ${active}" onclick="window.filterMatrixCluster('${c.name}')" style="--cluster-accent: ${c.color};">
          <span class="pill-color-dot" style="background: ${c.color};"></span>
          <span>${c.name}</span>
        </button>
      `;
    });

    container.innerHTML = html;
  }

  function renderMatrixTable() {
    const tbody = document.getElementById('matrix-playground-tbody');
    if (!tbody) return;

    const dataset = MATRIX_DATASETS[activeDatasetKey];
    const filteredPapers = dataset.papers.filter(p => {
      if (activeClusterFilter === 'all') return true;
      return p.cluster === activeClusterFilter;
    });

    if (filteredPapers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-tertiary);">No papers found in this cluster.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredPapers.map((paper, idx) => `
      <tr data-paper-id="${paper.id}">
        <td class="matrix-cell-id font-mono">#${idx + 1}</td>
        <td class="matrix-cell-editable cell-title" data-field="title" title="Click to edit paper title" onclick="window.editMatrixCell(this)">
          <span class="cell-display-text">${paper.title}</span>
        </td>
        <td>
          <span class="matrix-cluster-tag" style="background: ${paper.clusterColor}22; color: ${paper.clusterColor}; border-color: ${paper.clusterColor}55;">
            ${paper.cluster}
          </span>
        </td>
        <td class="matrix-cell-editable font-mono" data-field="year" onclick="window.editMatrixCell(this)" style="text-align: center;">
          <span class="cell-display-text">${paper.year}</span>
        </td>
        <td class="matrix-cell-editable font-mono cell-latex" data-field="complexity" onclick="window.editMatrixCell(this)" style="color: var(--accent-primary);">
          <span class="cell-display-text">${paper.complexity}</span>
        </td>
        <td class="matrix-cell-editable" data-field="datasets" onclick="window.editMatrixCell(this)">
          <span class="cell-display-text">${paper.datasets}</span>
        </td>
        <td style="text-align: center;">
          <span class="matrix-status-badge ${paper.status.toLowerCase()}">${paper.status}</span>
        </td>
      </tr>
    `).join('');

    // Re-render LaTeX in table
    triggerKatex();
  }

  window.switchMatrixDataset = function (key) {
    if (!MATRIX_DATASETS[key]) return;
    activeDatasetKey = key;
    activeClusterFilter = 'all';
    initInteractiveMatrix();
    showInteractiveToast(`Switched matrix to: ${MATRIX_DATASETS[key].name}`);
  };

  window.filterMatrixCluster = function (clusterName) {
    activeClusterFilter = clusterName;
    renderClusterFilterPills();
    renderMatrixTable();
  };

  window.editMatrixCell = function (cellEl) {
    if (cellEl.querySelector('input')) return; // Already editing

    const currentText = cellEl.querySelector('.cell-display-text') ? cellEl.querySelector('.cell-display-text').textContent : cellEl.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'matrix-inline-input';

    cellEl.innerHTML = '';
    cellEl.appendChild(input);
    input.focus();
    input.select();

    function commitChange() {
      const newVal = input.value.trim() || currentText;
      cellEl.innerHTML = `<span class="cell-display-text">${newVal}</span>`;
      cellEl.classList.add('cell-saved-pulse');
      setTimeout(() => cellEl.classList.remove('cell-saved-pulse'), 800);
      showInteractiveToast('Cell auto-saved to SQLite WAL (simulated commit)');
      triggerKatex();
    }

    input.addEventListener('blur', commitChange);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        cellEl.innerHTML = `<span class="cell-display-text">${currentText}</span>`;
        triggerKatex();
      }
    });
  };

  /* ─────────────────────────────────────────────────────────────
     3. SPLIT-SCREEN READER & LATEX MATH SANDBOX
  ───────────────────────────────────────────────────────────── */
  const SAMPLE_FORMULAS = [
    { label: 'Loss Function', code: '\\mathcal{L}_{\\text{total}} = \\mathcal{L}_{\\text{ASR}} + \\alpha \\mathcal{L}_{\\text{MT}} + \\beta \\mathcal{L}_{\\text{latency}}' },
    { label: 'Isolation Score', code: 'S(x, n) = 2^{-\\frac{\\mathbb{E}(h(x))}{c(n)}}' },
    { label: 'Big-O Complexity', code: '\\mathcal{O}\\left(\\sum_{l=1}^L N \\cdot D_l \\log K\\right)' },
    { label: 'Regularized Empirical Risk', code: '\\min_{\\theta} \\frac{1}{N}\\sum_{i=1}^N \\ell(f_\\theta(x_i), y_i) + \\lambda \\|\\theta\\|_1' }
  ];

  function initMathAndPdfSandbox() {
    const input = document.getElementById('sandbox-latex-input');
    const presetsContainer = document.getElementById('sandbox-formula-presets');

    if (presetsContainer) {
      presetsContainer.innerHTML = SAMPLE_FORMULAS.map((f, i) => `
        <button class="preset-formula-btn ${i === 0 ? 'active' : ''}" onclick="window.applyFormulaPreset('${encodeURIComponent(f.code)}', this)">
          ${f.label}
        </button>
      `).join('');
    }

    if (input) {
      input.addEventListener('input', () => {
        renderSandboxFormula(input.value);
      });
      renderSandboxFormula(input.value);
    }

    // Highlighting simulator
    window.activeHighlightColor = 'yellow';
  }

  function renderSandboxFormula(latexCode) {
    const output = document.getElementById('sandbox-latex-output');
    if (!output) return;

    if (!latexCode.trim()) {
      output.innerHTML = '<span style="color: var(--text-tertiary);">Type or select LaTeX formula above...</span>';
      return;
    }

    try {
      if (window.katex) {
        output.innerHTML = window.katex.renderToString(latexCode, { displayMode: true, output: 'html', throwOnError: false });
      } else {
        output.textContent = latexCode;
      }
    } catch (e) {
      output.innerHTML = `<span style="color: #ef4444;">Syntax Error: ${e.message}</span>`;
    }
  }

  window.applyFormulaPreset = function (encodedCode, btn) {
    const code = decodeURIComponent(encodedCode);
    const input = document.getElementById('sandbox-latex-input');
    if (input) {
      input.value = code;
      renderSandboxFormula(code);
    }
    document.querySelectorAll('.preset-formula-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    showInteractiveToast('Loaded preset LaTeX formula');
  };

  window.setHighlightColor = function (colorName, btn) {
    window.activeHighlightColor = colorName;
    document.querySelectorAll('.highlighter-tool-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    showInteractiveToast(`Highlighter color set to ${colorName.toUpperCase()}`);
  };

  window.highlightSampleText = function (element) {
    const color = window.activeHighlightColor || 'yellow';
    element.classList.remove('highlight-yellow', 'highlight-emerald', 'highlight-cyan', 'highlight-pink');
    element.classList.add(`highlight-${color}`);
    showInteractiveToast(`Annotated manuscript passage with [${color.toUpperCase()}]`);
  };

  /* ─────────────────────────────────────────────────────────────
     4. PRISMA 2020 SYSTEMATIC SCREENING SIMULATOR
  ───────────────────────────────────────────────────────────── */
  const PRISMA_SAMPLE_PAPERS = [
    {
      title: 'A Systematic Review of Quantum Object Detection and Recognition: Research Trends, Datasets, and Methods',
      authors: 'Ifran Lindu Mahargya, Guruh Fajar Shidik, Affandy, Pujiono, Supriadi Rustad (2025)',
      journal: 'Intelligent Systems with Applications',
      abstract: 'This study presents a systematic literature review following PRISMA 2020 on quantum-assisted object detection. We evaluate 127 primary studies across NISQ benchmarks, gate complexities, and dataset coverage...',
      decision: 'unscreened'
    },
    {
      title: 'Establishing Multifactorial Risk Factors for Adult-Onset Hearing Loss: A Systematic Review',
      authors: 'Preventive Medicine Study Group (2024)',
      journal: 'Preventive Medicine Journal',
      abstract: 'We conducted a dual-reviewer meta-analysis evaluating epidemiological risk indicators across 42 longitudinal cohorts with rigorous Newcastle-Ottawa quality scoring...',
      decision: 'unscreened'
    }
  ];

  let currentPrismaIdx = 0;
  let prismaCounts = {
    identified: 142,
    screened: 68,
    included: 24,
    excluded: 44
  };

  function initPrismaSimulator() {
    renderPrismaCard();
    updatePrismaCounterElements();
  }

  function renderPrismaCard() {
    const card = document.getElementById('prisma-active-paper');
    if (!card) return;

    const paper = PRISMA_SAMPLE_PAPERS[currentPrismaIdx];
    card.innerHTML = `
      <div class="prisma-paper-header">
        <span class="prisma-source-tag">${paper.journal}</span>
        <span class="prisma-status-badge ${paper.decision}">${paper.decision.toUpperCase()}</span>
      </div>
      <h4 class="prisma-paper-title">${paper.title}</h4>
      <p class="prisma-paper-authors">${paper.authors}</p>
      <p class="prisma-paper-abstract">${paper.abstract}</p>
    `;
  }

  function updatePrismaCounterElements() {
    const elId = document.getElementById('prisma-count-identified');
    const elSc = document.getElementById('prisma-count-screened');
    const elIn = document.getElementById('prisma-count-included');
    const elEx = document.getElementById('prisma-count-excluded');

    if (elId) elId.textContent = prismaCounts.identified;
    if (elSc) elSc.textContent = prismaCounts.screened;
    if (elIn) elIn.textContent = prismaCounts.included;
    if (elEx) elEx.textContent = prismaCounts.excluded;
  }

  window.handlePrismaVote = function (decisionType) {
    const paper = PRISMA_SAMPLE_PAPERS[currentPrismaIdx];
    paper.decision = decisionType;

    const reasonSelect = document.getElementById('prisma-criteria-reason');
    const reasonText = reasonSelect ? reasonSelect.value : 'Criteria Verified';

    if (decisionType === 'included') {
      prismaCounts.included++;
      prismaCounts.screened++;
      showInteractiveToast(`✓ Study INCLUDED: "${reasonText}"`);
    } else if (decisionType === 'excluded') {
      prismaCounts.excluded++;
      prismaCounts.screened++;
      showInteractiveToast(`✕ Study EXCLUDED: "${reasonText}"`);
    } else {
      showInteractiveToast(`⏳ Marked study for Second-Reviewer Blind Appraisal`);
    }

    updatePrismaCounterElements();
    renderPrismaCard();

    // Pulse effect
    const box = document.getElementById('prisma-flow-diagram');
    if (box) {
      box.classList.add('flow-updated-pulse');
      setTimeout(() => box.classList.remove('flow-updated-pulse'), 700);
    }
  };

  window.nextPrismaSample = function () {
    currentPrismaIdx = (currentPrismaIdx + 1) % PRISMA_SAMPLE_PAPERS.length;
    renderPrismaCard();
  };

  /* ─────────────────────────────────────────────────────────────
     5. ACADEMIC CITATION & MULTI-FORMAT EXPORT GENERATOR
  ───────────────────────────────────────────────────────────── */
  const CITATION_PAPERS = {
    speech: {
      title: 'A Low-Latency Multilingual Speech-to-Bangla Speech Translation Framework with Streaming Inference',
      authors: 'Kamal, M., et al.',
      year: 2026,
      venue: 'IEEE Transactions on Audio, Speech, and Language Processing',
      doi: '10.1109/TASLP.2026.3108842',
      bibtex: `@article{kamal2026speech,
  author    = {Kamal, Mostafa and Chen, Sarah and Vance, Robert},
  title     = {A Low-Latency Multilingual Speech-to-Bangla Speech Translation Framework with Streaming Inference},
  journal   = {IEEE Transactions on Audio, Speech, and Language Processing},
  year      = {2026},
  volume    = {34},
  pages     = {112--128},
  doi       = {10.1109/TASLP.2026.3108842}
}`,
      apa: `Kamal, M., Chen, S., & Vance, R. (2026). A low-latency multilingual speech-to-Bangla speech translation framework with streaming inference. IEEE Transactions on Audio, Speech, and Language Processing, 34, 112–128. https://doi.org/10.1109/TASLP.2026.3108842`,
      ieee: `M. Kamal, S. Chen, and R. Vance, "A Low-Latency Multilingual Speech-to-Bangla Speech Translation Framework with Streaming Inference," IEEE Trans. Audio, Speech, Lang. Process., vol. 34, pp. 112–128, 2026, doi: 10.1109/TASLP.2026.3108842.`,
      harvard: `Kamal, M., Chen, S. and Vance, R., 2026. A low-latency multilingual speech-to-Bangla speech translation framework with streaming inference. IEEE Transactions on Audio, Speech, and Language Processing, 34, pp.112–128.`,
      ris: `TY  - JOUR
AU  - Kamal, Mostafa
AU  - Chen, Sarah
AU  - Vance, Robert
TI  - A Low-Latency Multilingual Speech-to-Bangla Speech Translation Framework with Streaming Inference
JO  - IEEE Transactions on Audio, Speech, and Language Processing
VL  - 34
SP  - 112
EP  - 128
PY  - 2026
DO  - 10.1109/TASLP.2026.3108842
ER  -`,
      markdown: `| Paper | Year | Cluster | Computational Complexity | Datasets | Status |
|---|---|---|---|---|---|
| A Low-Latency Multilingual Speech-to-Bangla Translation | 2026 | Streaming Architectures | $\\mathcal{O}(T \\cdot W \\log W)$ | BanglaVoice, CoVoST-2 | Included |`
    }
  };

  let activeCitationFormat = 'bibtex';

  function initCitationBuilder() {
    renderCitationOutput();
  }

  function renderCitationOutput() {
    const codeEl = document.getElementById('citation-code-output');
    if (!codeEl) return;

    const paper = CITATION_PAPERS['speech'];
    codeEl.textContent = paper[activeCitationFormat] || paper.bibtex;
  }

  window.setCitationFormat = function (fmt, btn) {
    activeCitationFormat = fmt;
    document.querySelectorAll('.citation-format-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderCitationOutput();
    showInteractiveToast(`Switched citation format to ${fmt.toUpperCase()}`);
  };

  window.copyCitationToClipboard = function () {
    const codeEl = document.getElementById('citation-code-output');
    if (!codeEl) return;

    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      showInteractiveToast('📋 Citation copied to clipboard!');
      const copyBtn = document.getElementById('btn-copy-citation');
      if (copyBtn) {
        const origText = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>✓ Copied!</span>`;
        setTimeout(() => copyBtn.innerHTML = origText, 1800);
      }
    }).catch(() => {
      showInteractiveToast('Failed to copy. Please manually copy from text box.');
    });
  };

  /* ─────────────────────────────────────────────────────────────
     6. 4-ROLE COLLABORATION RBAC EXPLORER
  ───────────────────────────────────────────────────────────── */
  const RBAC_ROLES = {
    owner: {
      name: 'Project Owner (Lead PI)',
      badge: 'GOVERNANCE & SOVEREIGNTY',
      accentColor: '#38bdf8',
      description: 'Full sovereign governance of the research survey: team management, transfer ownership, survey backup/clone, matrix reset, and cascading purge.',
      permissions: [
        { label: 'Create & delete taxonomy clusters', allowed: true },
        { label: 'Ingest papers via PDF & CrossRef DOI', allowed: true },
        { label: 'Modify matrix extracted cell values', allowed: true },
        { label: 'Split columns into nested sub-headers', allowed: true },
        { label: 'PRISMA blind screening & quality appraisal', allowed: true },
        { label: 'Invite collaborators (Editor, Reviewer, Viewer)', allowed: true },
        { label: 'Transfer survey ownership to another user', allowed: true },
        { label: 'Generate supervisor tokenized public share links', allowed: true },
        { label: 'Permanently purge survey with cascading cleanup', allowed: true }
      ]
    },
    editor: {
      name: 'Editor (Co-Author & Postdoc)',
      badge: 'CONTENT & EXTRACTION',
      accentColor: '#10b981',
      description: 'Active co-author with full benchmark matrix editing powers: adding papers, editing extraction cells, splitting columns, and updating metadata.',
      permissions: [
        { label: 'Create & delete taxonomy clusters', allowed: true },
        { label: 'Ingest papers via PDF & CrossRef DOI', allowed: true },
        { label: 'Modify matrix extracted cell values', allowed: true },
        { label: 'Split columns into nested sub-headers', allowed: true },
        { label: 'PRISMA blind screening & quality appraisal', allowed: true },
        { label: 'Invite collaborators (Editor, Reviewer, Viewer)', allowed: false },
        { label: 'Transfer survey ownership to another user', allowed: false },
        { label: 'Generate supervisor tokenized public share links', allowed: false },
        { label: 'Permanently purge survey with cascading cleanup', allowed: false }
      ]
    },
    reviewer: {
      name: 'Reviewer (Advisor / Supervisor)',
      badge: 'BLIND APPRAISAL & FEEDBACK',
      accentColor: '#f59e0b',
      description: 'Independent appraiser conducting double-blind systematic review: voting PRISMA inclusion/exclusion, leaving quote-anchored annotations, and reviewing gap synthesis.',
      permissions: [
        { label: 'Create & delete taxonomy clusters', allowed: false },
        { label: 'Ingest papers via PDF & CrossRef DOI', allowed: false },
        { label: 'Modify matrix extracted cell values', allowed: false },
        { label: 'Split columns into nested sub-headers', allowed: false },
        { label: 'PRISMA blind screening & quality appraisal', allowed: true },
        { label: 'Add paper comments & manuscript annotations', allowed: true },
        { label: 'Read-only inspection of benchmark matrix', allowed: true },
        { label: 'Invite collaborators or alter survey settings', allowed: false },
        { label: 'Permanently purge survey with cascading cleanup', allowed: false }
      ]
    },
    viewer: {
      name: 'Viewer (Student / External Reader)',
      badge: 'READ-ONLY & DATA EXPORT',
      accentColor: '#94a3b8',
      description: 'Auditor or student accessing published literature findings: inspect benchmark matrix, search keywords, and export data in Excel, CSV, or BibTeX.',
      permissions: [
        { label: 'Inspect full benchmark matrix & papers list', allowed: true },
        { label: 'Export matrix in multi-level Excel (.xlsx), CSV, JSON', allowed: true },
        { label: 'Search and filter across taxonomy clusters', allowed: true },
        { label: 'View synthesized research gaps & dataset counts', allowed: true },
        { label: 'Modify matrix extracted cell values', allowed: false },
        { label: 'Ingest or delete papers', allowed: false },
        { label: 'Submit PRISMA screening decisions', allowed: false },
        { label: 'Invite collaborators or alter survey settings', allowed: false },
        { label: 'Permanently purge survey with cascading cleanup', allowed: false }
      ]
    }
  };

  let activeRbacRole = 'owner';

  function initRbacExplorer() {
    renderRbacDetails();
  }

  function renderRbacDetails() {
    const roleData = RBAC_ROLES[activeRbacRole];
    const detailsContainer = document.getElementById('rbac-role-details');
    if (!detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="rbac-role-card">
        <div class="rbac-card-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="rbac-role-icon-box" style="--role-accent: ${roleData.accentColor};">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${roleData.accentColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <div>
              <h3 style="font-size: 1.3rem; font-weight: 800; font-family: 'Outfit', sans-serif; color: var(--text-primary); margin-bottom: 2px;">
                ${roleData.name}
              </h3>
              <span class="rbac-badge" style="color: ${roleData.accentColor}; background: ${roleData.accentColor}18; border-color: ${roleData.accentColor}44;">
                ${roleData.badge}
              </span>
            </div>
          </div>
        </div>

        <p style="font-size: 0.96rem; color: var(--text-secondary); line-height: 1.65; margin: 1.25rem 0 1.5rem 0;">
          ${roleData.description}
        </p>

        <div class="rbac-permissions-grid">
          ${roleData.permissions.map(p => `
            <div class="rbac-permission-item ${p.allowed ? 'allowed' : 'blocked'}">
              <span class="rbac-perm-icon">${p.allowed ? '✓' : '✕'}</span>
              <span class="rbac-perm-label">${p.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  window.switchRbacRole = function (roleKey, btn) {
    if (!RBAC_ROLES[roleKey]) return;
    activeRbacRole = roleKey;
    document.querySelectorAll('.rbac-role-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderRbacDetails();
    showInteractiveToast(`Viewing permissions for: ${RBAC_ROLES[roleKey].name}`);
  };

  /* ─────────────────────────────────────────────────────────────
     7. TOAST FEEDBACK ENGINE
  ───────────────────────────────────────────────────────────── */
  function showInteractiveToast(msg) {
    let toast = document.getElementById('home-interactive-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'home-interactive-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'show';

    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      toast.className = '';
    }, 2800);
  }

  function triggerKatex() {
    setTimeout(() => {
      if (window.renderMathInElement) {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          output: 'html',
          throwOnError: false
        });
      }
    }, 60);
  }

  /* ─────────────────────────────────────────────────────────────
     8. GLOBAL BOOTSTRAPPER
  ───────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    initInteractiveMatrix();
    initMathAndPdfSandbox();
    initPrismaSimulator();
    initCitationBuilder();
    initRbacExplorer();

    // Trigger math rendering
    triggerKatex();
  });

})();
