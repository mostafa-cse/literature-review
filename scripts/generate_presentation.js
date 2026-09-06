const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches (Standard 16:9 Widescreen)
pres.author = 'Mostafa Kamal';
pres.company = 'Jashore University of Science and Technology';
pres.title = 'LitSphere: Systematic Literature Review & Benchmarking Platform';
pres.subject = 'Comprehensive Final Year Project Presentation & System Architecture Walkthrough';

// Professional Academic Color Palette
const COLORS = {
  bg: '0B1120',         // Deep Academic Slate/Navy
  cardBg: '1E293B',     // Elevated Slate Card
  specBg: '0F172A',     // Dark Navy Spec Box
  border: '334155',     // Card Outline
  borderLight: '475569',// Subtle Border
  gold: 'F59E0B',       // Academic Gold Accent
  cyan: '38BDF8',       // Sky/Cyan Accent
  green: '10B981',      // Emerald Accent
  purple: 'A855F7',     // Lavender Accent
  pink: 'EC4899',       // Rose Accent
  red: 'EF4444',        // Coral Accent
  textWhite: 'FFFFFF',  // Primary Text
  textSlate: 'CBD5E1',  // Body Text
  textMuted: '94A3B8'   // Secondary Muted Text
};

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'presentation_screenshots');

// Setup Chrome Header & Footer for Each Slide
function setupSlideChrome(slide, slideNum, category, title, subtitle, accentColor) {
  slide.background = { color: COLORS.bg };

  // Category Pill Badge
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.8,
    y: 0.4,
    w: 5.0,
    h: 0.32,
    fill: { color: COLORS.cardBg },
    line: { color: accentColor, width: 1.2 },
    rectRadius: 0.08
  });

  slide.addText(category.toUpperCase() + `  |  SLIDE ${String(slideNum).padStart(2, '0')} OF 12`, {
    x: 0.85,
    y: 0.4,
    w: 4.9,
    h: 0.32,
    fontSize: 9,
    bold: true,
    color: accentColor,
    align: 'left',
    valign: 'middle'
  });

  // Slide Title
  slide.addText(title, {
    x: 0.8,
    y: 0.78,
    w: 11.73,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: COLORS.textWhite,
    valign: 'top'
  });

  // Slide Subtitle
  slide.addText(subtitle, {
    x: 0.8,
    y: 1.24,
    w: 11.73,
    h: 0.32,
    fontSize: 11,
    italic: true,
    color: COLORS.textMuted,
    valign: 'top'
  });

  // Footer Divider Line
  slide.addShape(pres.ShapeType.line, {
    x: 0.8,
    y: 6.95,
    w: 11.73,
    h: 0,
    line: { color: COLORS.border, width: 0.8 }
  });

  // Footer Left Text
  slide.addText('LitSphere: Deep Analytical Literature Review & Benchmarking System  |  Final Year Project Presentation', {
    x: 0.8,
    y: 7.02,
    w: 9.5,
    h: 0.3,
    fontSize: 9,
    color: COLORS.textMuted
  });

  // Footer Right Slide Count
  slide.addText(`Slide ${slideNum} of 12`, {
    x: 10.5,
    y: 7.02,
    w: 2.03,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: accentColor,
    align: 'right'
  });
}

// Two-Column Layout (Left: Technical Deep-Dive & Specs, Right: Rectangular Live Screenshot & Callout)
function createFeatureSlide({
  slideNum,
  category,
  title,
  subtitle,
  accentColor,
  imageFile,
  imageCaption,
  uiHighlights,
  bullets,
  specs
}) {
  const slide = pres.addSlide();
  setupSlideChrome(slide, slideNum, category, title, subtitle, accentColor);

  // ─────────────────────────────────────────────────────────────
  // LEFT COLUMN: Architectural Details & Technical Specs
  // ─────────────────────────────────────────────────────────────
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.8,
    y: 1.62,
    w: 5.65,
    h: 5.18,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08
  });

  slide.addText('CORE CAPABILITIES & ARCHITECTURAL LOGIC', {
    x: 1.0,
    y: 1.76,
    w: 5.25,
    h: 0.25,
    fontSize: 10,
    bold: true,
    color: accentColor
  });

  // Render individual bullet paragraphs
  let currentY = 2.08;
  bullets.forEach((b, idx) => {
    slide.addText([
      { text: `[${idx + 1}] ${b.title}: `, options: { bold: true, color: COLORS.textWhite, fontSize: 10 } },
      { text: b.desc, options: { bold: false, color: COLORS.textSlate, fontSize: 9.5 } }
    ], {
      x: 1.0,
      y: currentY,
      w: 5.25,
      h: 0.72,
      valign: 'top',
      lineSpacingMultiple: 1.15
    });
    currentY += 0.76;
  });

  // Inner Technical Specifications Box
  slide.addShape(pres.ShapeType.roundRect, {
    x: 1.0,
    y: 5.25,
    w: 5.25,
    h: 1.38,
    fill: { color: COLORS.specBg },
    line: { color: COLORS.borderLight, width: 0.8 },
    rectRadius: 0.06
  });

  slide.addText('ENGINEERING SPECIFICATIONS & IMPLEMENTATION', {
    x: 1.15,
    y: 5.34,
    w: 4.95,
    h: 0.22,
    fontSize: 8.5,
    bold: true,
    color: COLORS.gold
  });

  const specRuns = [];
  specs.forEach(s => {
    specRuns.push({ text: `• ${s.key}: `, options: { bold: true, color: COLORS.cyan, fontSize: 8.5 } });
    specRuns.push({ text: `${s.val}\n`, options: { bold: false, color: COLORS.textSlate, fontSize: 8.5 } });
  });

  slide.addText(specRuns, {
    x: 1.15,
    y: 5.56,
    w: 4.95,
    h: 1.0,
    valign: 'top'
  });

  // ─────────────────────────────────────────────────────────────
  // RIGHT COLUMN: Clean Rectangular Screenshot & UI Callouts
  // ─────────────────────────────────────────────────────────────
  slide.addShape(pres.ShapeType.roundRect, {
    x: 6.65,
    y: 1.62,
    w: 5.88,
    h: 5.18,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08
  });

  // Live Screenshot (NO oval rounding, clean rectangular frame with border)
  const imgPath = path.join(SCREENSHOTS_DIR, imageFile);
  if (fs.existsSync(imgPath)) {
    // Outer frame for the image
    slide.addShape(pres.ShapeType.rect, {
      x: 6.82,
      y: 1.78,
      w: 5.54,
      h: 3.32,
      fill: { color: '000000' },
      line: { color: COLORS.borderLight, width: 1.2 }
    });

    slide.addImage({
      path: imgPath,
      x: 6.82,
      y: 1.78,
      w: 5.54,
      h: 3.32
    });
  }

  // Caption Header Bar
  slide.addShape(pres.ShapeType.roundRect, {
    x: 6.82,
    y: 5.22,
    w: 5.54,
    h: 0.34,
    fill: { color: COLORS.specBg },
    line: { color: accentColor, width: 1 },
    rectRadius: 0.05
  });

  slide.addText(`[LIVE UI]  ${imageCaption}`, {
    x: 6.92,
    y: 5.22,
    w: 5.34,
    h: 0.34,
    fontSize: 8.5,
    bold: true,
    color: COLORS.textWhite,
    valign: 'middle'
  });

  // UI Inspection Highlights Box below screenshot
  slide.addShape(pres.ShapeType.roundRect, {
    x: 6.82,
    y: 5.64,
    w: 5.54,
    h: 1.0,
    fill: { color: COLORS.specBg },
    line: { color: COLORS.borderLight, width: 0.8 },
    rectRadius: 0.06
  });

  slide.addText('KEY VISUAL ELEMENTS INSPECTED IN INTERFACE:', {
    x: 6.95,
    y: 5.72,
    w: 5.28,
    h: 0.2,
    fontSize: 8,
    bold: true,
    color: COLORS.gold
  });

  const highlightRuns = uiHighlights.map(h => `▸ ${h}`).join('\n');
  slide.addText(highlightRuns, {
    x: 6.95,
    y: 5.94,
    w: 5.28,
    h: 0.65,
    fontSize: 8,
    color: COLORS.textSlate,
    valign: 'top',
    lineSpacingMultiple: 1.15
  });
}

// ==========================================
// SLIDE 1: Title & Executive Platform Vision
// ==========================================
(function buildSlide1() {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.bg };

  // Top Category Pill
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.8,
    y: 0.45,
    w: 5.6,
    h: 0.35,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.gold, width: 1.5 },
    rectRadius: 0.08
  });

  slide.addText('ACADEMIC RESEARCH BENCHMARKING PLATFORM  |  SLIDE 01 OF 12', {
    x: 0.85,
    y: 0.45,
    w: 5.5,
    h: 0.35,
    fontSize: 9.5,
    bold: true,
    color: COLORS.gold,
    valign: 'middle'
  });

  // Hero Title
  slide.addText('LitSphere: Deep Analytical Literature Review & Benchmarking System', {
    x: 0.8,
    y: 0.92,
    w: 11.73,
    h: 0.85,
    fontSize: 24,
    bold: true,
    color: COLORS.textWhite
  });

  // Hero Subtitle
  slide.addText('A Unified Scientific Platform for Systematic Literature Reviews, Dynamic Taxonomy Matrixing, In-Browser PDF/KaTeX Extraction, PRISMA 2020 Blind Screening & Multi-Level Thesis Synthesis', {
    x: 0.8,
    y: 1.82,
    w: 11.73,
    h: 0.48,
    fontSize: 11.5,
    color: COLORS.cyan
  });

  // Left Content Card: Core Thesis Motivation & Solution
  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.8,
    y: 2.45,
    w: 5.65,
    h: 4.35,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08
  });

  slide.addText('RESEARCH PROBLEM & PLATFORM SOLUTION', {
    x: 1.0,
    y: 2.6,
    w: 5.25,
    h: 0.28,
    fontSize: 11,
    bold: true,
    color: COLORS.gold
  });

  slide.addText([
    { text: '[1] Problem in Academia: ', options: { bold: true, color: COLORS.textWhite, fontSize: 10 } },
    { text: 'Researchers typically track hundreds of papers using fragmented spreadsheets (Excel, Google Sheets) and disconnected PDF folders, causing severe loss of methodological context, lack of standardized taxonomy, and lost mathematical formulation integrity.\n\n', options: { color: COLORS.textSlate, fontSize: 9.5 } },
    { text: '[2] The LitSphere Solution: ', options: { bold: true, color: COLORS.textWhite, fontSize: 10 } },
    { text: 'LitSphere replaces disparate tools with an integrated research workbench combining high-concurrency SQLite WAL storage, automated CrossRef DOI indexing, side-by-side PDF.js/KaTeX extraction, and PRISMA 2020 appraisal.\n\n', options: { color: COLORS.textSlate, fontSize: 9.5 } },
    { text: '[3] 8 Integrated Subsystems: ', options: { bold: true, color: COLORS.textWhite, fontSize: 10 } },
    { text: 'Authentication & RBAC, Survey Governance, Multi-source Ingestion, Master Matrix Workbench, Dynamic Taxonomy Splitting, Split-Screen Reviewer, PRISMA Screening, and Multi-Format Thesis Export (Excel, LaTeX, BibTeX).', options: { color: COLORS.textSlate, fontSize: 9.5 } }
  ], {
    x: 1.0,
    y: 2.95,
    w: 5.25,
    h: 2.8,
    valign: 'top',
    lineSpacingMultiple: 1.15
  });

  // Presenter Credentials Box
  slide.addShape(pres.ShapeType.roundRect, {
    x: 1.0,
    y: 5.85,
    w: 5.25,
    h: 0.78,
    fill: { color: COLORS.specBg },
    line: { color: COLORS.borderLight, width: 0.8 },
    rectRadius: 0.06
  });

  slide.addText([
    { text: 'PRESENTER: ', options: { bold: true, color: COLORS.gold, fontSize: 9.5 } },
    { text: 'Mostafa Kamal (200108.cse@student.just.edu.bd)\n', options: { color: COLORS.textWhite, fontSize: 9.5 } },
    { text: 'INSTITUTION: ', options: { bold: true, color: COLORS.gold, fontSize: 9.5 } },
    { text: 'Dept. of Computer Science & Engineering, Jashore University of Science & Technology', options: { color: COLORS.textWhite, fontSize: 9.5 } }
  ], {
    x: 1.12,
    y: 5.92,
    w: 5.0,
    h: 0.65,
    valign: 'middle'
  });

  // Right Frame: Hero Web Screenshot (Clean Rectangle)
  slide.addShape(pres.ShapeType.roundRect, {
    x: 6.65,
    y: 2.45,
    w: 5.88,
    h: 4.35,
    fill: { color: COLORS.cardBg },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08
  });

  const imgPath = path.join(SCREENSHOTS_DIR, '01_home_hero.png');
  if (fs.existsSync(imgPath)) {
    slide.addShape(pres.ShapeType.rect, {
      x: 6.82,
      y: 2.6,
      w: 5.54,
      h: 3.32,
      fill: { color: '000000' },
      line: { color: COLORS.borderLight, width: 1.2 }
    });

    slide.addImage({
      path: imgPath,
      x: 6.82,
      y: 2.6,
      w: 5.54,
      h: 3.32
    });
  }

  slide.addShape(pres.ShapeType.roundRect, {
    x: 6.82,
    y: 6.02,
    w: 5.54,
    h: 0.62,
    fill: { color: COLORS.specBg },
    line: { color: COLORS.gold, width: 1 },
    rectRadius: 0.06
  });

  slide.addText('[LIVE UI]  LitSphere Academic Intelligence Hero Portal & Live Test Drive Sandbox\nFeaturing dynamic particle constellation, feature pill tags & instant interactive demo suite', {
    x: 6.95,
    y: 6.04,
    w: 5.28,
    h: 0.58,
    fontSize: 8.5,
    bold: true,
    color: COLORS.textWhite,
    valign: 'middle'
  });

  // Footer Divider
  slide.addShape(pres.ShapeType.line, {
    x: 0.8,
    y: 6.95,
    w: 11.73,
    h: 0,
    line: { color: COLORS.border, width: 0.8 }
  });

  slide.addText('LitSphere: Advanced Literature Review & Benchmarking System  |  Final Year Project Defense', {
    x: 0.8,
    y: 7.02,
    w: 9.5,
    h: 0.3,
    fontSize: 9,
    color: COLORS.textMuted
  });

  slide.addText('Slide 1 of 12', {
    x: 10.5,
    y: 7.02,
    w: 2.03,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: COLORS.gold,
    align: 'right'
  });
})();

// ==========================================
// SLIDE 2: System Architecture & SQLite Engine
// ==========================================
createFeatureSlide({
  slideNum: 2,
  category: 'System Architecture & Database Engine',
  title: 'Relational SQLite WAL Architecture & Subsystem Ecosystem',
  subtitle: 'Zero-latency single-file persistence with synchronous Write-Ahead Logging and dual BLOB/disk storage',
  accentColor: COLORS.cyan,
  imageFile: '02_architecture_subsystems.png',
  imageCaption: 'Subsystems Architecture, Comparison Matrix & Technology Breakdown',
  uiHighlights: [
    'Comparison matrix benchmarking LitSphere vs. Google Sheets, Excel, and reference managers',
    '77% Average time saved, 100% mathematical fidelity & <1ms SQLite WAL mode latency badge',
    '8 Core platform subsystems navigable via interactive architectural tabs'
  ],
  bullets: [
    {
      title: 'Node.js 22 DatabaseSync Engine',
      desc: 'Built using native Node.js DatabaseSync module, eliminating slow binary C++ native addon bindings and delivering sub-millisecond ACID transactions directly in the runtime.'
    },
    {
      title: 'WAL Journaling & 5000ms Busy Timeout',
      desc: "Configured with 'PRAGMA journal_mode = WAL' and 'PRAGMA busy_timeout = 5000;'. Enables simultaneous non-blocking concurrent readers while dedicated writes execute cleanly without lock contention."
    },
    {
      title: 'Dual BLOB & Filesystem PDF Storage',
      desc: 'Stores binary PDF documents directly inside SQLite paper_files table with automatic migration and fallback streaming from /uploads/ directory, ensuring 100% self-contained database backups.'
    },
    {
      title: 'Relational Integrity Across 15 Tables',
      desc: "Strict 'PRAGMA foreign_keys = ON' with cascading constraints across users, projects, clusters, papers, dynamic columns, values, keywords, and immutable audit logs."
    }
  ],
  specs: [
    { key: 'Runtime Engine', val: 'Node.js v25.8.1 with Express 4.21.2 & SQLite DatabaseSync' },
    { key: 'Concurrency Mode', val: 'Write-Ahead Logging (WAL) + Busy Timeout 5000ms' },
    { key: 'Schema Scope', val: '15 Core Tables: projects, clusters, papers, paper_files, audit_logs' },
    { key: 'Binary Ingestion', val: 'SQLite BLOB storage with dynamic streaming endpoint /api/papers/:id/pdf' }
  ]
});

// ==========================================
// SLIDE 3: Authentication, Security & Researcher Identity
// ==========================================
createFeatureSlide({
  slideNum: 3,
  category: 'Security & Researcher Identity',
  title: 'Researcher Authentication, Cryptography & Session Auditing',
  subtitle: 'Cryptographic scrypt hashing, HS256 stateless tokens with revocation, and ORCID/Google SSO',
  accentColor: COLORS.purple,
  imageFile: '03_auth_security.png',
  imageCaption: 'Researcher Sign-In, Live Uniqueness Feedback & Institutional Auth Portal',
  uiHighlights: [
    'Dynamic tabbed authentication card supporting Login, Registration, and Password Reset',
    'Live AJAX input validation verifying username & institutional email availability on keyup',
    'ORCID Researcher iD and Google SSO integrations alongside password strength meter'
  ],
  bullets: [
    {
      title: 'Cryptographic Password Hashing',
      desc: 'Implements Node.js native crypto.scryptSync with 16-byte random salt generation and 64-byte derived keys (format: salt:derivedKey), providing strong protection against rainbow tables.'
    },
    {
      title: 'Stateless JWT Session Verification',
      desc: 'Custom HMAC-SHA256 token generator (generateToken) featuring 30-day expiration, user role encapsulation, and token version validation (token_version) enabling instant session revocation.'
    },
    {
      title: 'Live Input Debounce & Institutional SSO',
      desc: 'Real-time AJAX debouncing validates username and Gmail availability before form submission; integrated with Firebase Google SSO and academic ORCID authentication.'
    },
    {
      title: 'Self-Service Nodemailer OTP Password Reset',
      desc: 'Automated 6-digit numeric OTP generation stored with 15-minute expirations in password_resets table with HTML email dispatching.'
    }
  ],
  specs: [
    { key: 'Crypto Algorithms', val: 'scryptSync (16B Salt, 64B Key) + HMAC-SHA256 JWT' },
    { key: 'Auth Routes', val: 'POST /api/auth/register, /login, /google, /orcid, /logout' },
    { key: 'Session Revocation', val: 'Single-click global logout via token_version incrementation' },
    { key: 'Security Audit Trail', val: 'Immutable IP & User-Agent logging on every auth attempt' }
  ]
});

// ==========================================
// SLIDE 4: Systematic Surveys Dashboard & Master Templates
// ==========================================
createFeatureSlide({
  slideNum: 4,
  category: 'Survey Lifecycle & Project Governance',
  title: 'Multi-Project Survey Hub & Master Taxonomy Blueprints',
  subtitle: 'Project lifecycle governance, live synthesis progress metrics, and one-click benchmark cloning',
  accentColor: COLORS.gold,
  imageFile: '04_dashboard_surveys.png',
  imageCaption: 'Active Surveys Dashboard with Live Synthesis Progress Rings & Metric Cards',
  uiHighlights: [
    'Side-by-side active survey cards with OWNER tags, creation dates & action buttons',
    'Live circular synthesis progress bar (67% 2/3 complete on Speech Translation Survey)',
    'Metric counters displaying Total Papers (3), Clusters (3), Read (2), and Screened (0)'
  ],
  bullets: [
    {
      title: 'Centralized Survey Oversight',
      desc: 'Provides researchers with an executive workspace listing all active literature reviews, custom domains, member rosters, and creation dates in toggleable Card and Table views.'
    },
    {
      title: 'Real-Time Synthesis Progress Rings',
      desc: 'Dynamic SVG progress indicators compute (read_count / total_papers) * 100 and PRISMA screening completeness in real-time, providing immediate visual feedback on survey readiness.'
    },
    {
      title: 'Master Blueprint Taxonomy Cloning',
      desc: 'One-click instantiation clones pre-structured academic benchmarks (e.g. 6-Pillar Feature Selection or LLM Benchmarks) complete with color-coded clusters and scientific dynamic columns.'
    },
    {
      title: 'Project Duplication & Matrix Reset',
      desc: 'Allows researchers to deep-clone survey taxonomies without carrying over legacy papers (/duplicate), or wipe papers while preserving the curated matrix schema (/reset-matrix).'
    }
  ],
  specs: [
    { key: 'Endpoints', val: 'GET /api/projects, POST /api/projects, POST /api/projects/clone-template' },
    { key: 'Lifecycle Handlers', val: 'POST /api/projects/:id/duplicate, POST /api/projects/:id/reset-matrix' },
    { key: 'Blueprint Library', val: 'master_templates table containing pre-seeded JSON cluster schemas' },
    { key: 'Progress Computation', val: 'Aggregate sub-queries in SQLite computing read, in-progress, and unread' }
  ]
});

// ==========================================
// SLIDE 5: Automated Paper Ingestion & CrossRef API Resolver
// ==========================================
createFeatureSlide({
  slideNum: 5,
  category: 'Multi-Source Data Ingestion',
  title: 'Automated Paper Ingestion & CrossRef DOI Metadata Resolver',
  subtitle: 'Batch PDF drag-and-drop ingestion paired with live academic DOI metadata resolution',
  accentColor: COLORS.green,
  imageFile: '05_paper_ingestion_modal.png',
  imageCaption: 'Paper Ingestion Modal with CrossRef DOI Auto-Fetch & PDF Drag-and-Drop',
  uiHighlights: [
    'DOI Auto-Fetch engine resolving CrossRef & OpenAlex metadata in real time',
    'Metadata input fields: Paper Title, Authors, Publication Year, Pub / Conf / Journal',
    'Drag-and-drop PDF dropzone attaching local manuscripts with instant split-screen linkage'
  ],
  bullets: [
    {
      title: 'CrossRef REST API Auto-Fetch',
      desc: 'Resolves DOI strings via api.crossref.org/works/{doi} with regex cleaning, automatically retrieving publication title, author lists, publication year, journal name, and publisher.'
    },
    {
      title: 'Heuristic PDF Metadata Extraction',
      desc: 'Integrates pdf-parse within Multer 50MB upload pipelines; scans first 2,000 characters using regular expressions to heuristically discover title, author blocks, arXiv IDs, and abstracts.'
    },
    {
      title: 'Bulk Manuscript Ingestion',
      desc: 'Supports multi-file drag-and-drop uploading; automatically splits batches, indexes binary streams into SQLite paper_files, and stages papers in the Unassigned triage queue.'
    },
    {
      title: 'Unassigned Papers Staging Tray',
      desc: 'Newly uploaded manuscripts are quarantined in a dedicated staging tray until researchers perform initial PRISMA appraisal and route them into specific taxonomy clusters.'
    }
  ],
  specs: [
    { key: 'Ingestion APIs', val: 'POST /api/papers/upload, POST /api/papers/bulk-upload, GET /api/doi/resolve' },
    { key: 'PDF Parsing Engine', val: 'pdf-parse library + regular expression metadata heuristics' },
    { key: 'File Guardrails', val: 'Multer 50MB limit, PDF MIME verification, disk & SQLite BLOB mirroring' },
    { key: 'Auto-Triage', val: 'Automatic assignment to project staging tray when cluster_id is null' }
  ]
});

// ==========================================
// SLIDE 6: Master Matrix Workbench & Inline Data Editing
// ==========================================
createFeatureSlide({
  slideNum: 6,
  category: 'Core Workbench & Matrix Grid',
  title: 'High-Density Master Matrix Workbench & Inline Editing',
  subtitle: 'Excel-like data grid with optimistic UI updates, multi-criteria filtering, and KaTeX math',
  accentColor: COLORS.cyan,
  imageFile: '06_master_matrix_grid.png',
  imageCaption: 'Master Matrix Table with Status Badges, Dynamic Columns & Synthesis Synthesizer',
  uiHighlights: [
    'Live rows showing Seamless (Meta AI), UnitY (ACL), and Monotonic Attention (Interspeech)',
    'Reading status pills (green read dot, amber in-progress dot) with cluster categorization',
    'Cluster Insights & Unique Value Summary below grid with #1, #2, #3 paper citation badges'
  ],
  bullets: [
    {
      title: 'Unified High-Density Data Grid',
      desc: 'Displays literature surveys in a consolidated matrix table showing paper title, cluster category, publication year, venue, math models, strengths, gaps, and custom variables.'
    },
    {
      title: 'Optimistic Inline Cell Editing',
      desc: 'Researchers can edit dynamic column values directly within table cells; updates trigger debounced background POST /api/columns/values/batch requests without reloading the grid.'
    },
    {
      title: 'Tri-State Reading Workflow',
      desc: 'One-click cycling of reading status pills between unread (gray), in_progress (amber), and read (emerald), updating project dashboard metrics in real time.'
    },
    {
      title: 'Live KaTeX Equation Typesetting',
      desc: 'Mathematical expressions enclosed in $...$ or $$...$$ are instantly rendered as high-fidelity LaTeX notation via client-side KaTeX rendering in table cells and popovers.'
    }
  ],
  specs: [
    { key: 'Matrix Grid JS', val: 'Frontend/js/workspace/matrix.js (1,800+ lines of reactive grid logic)' },
    { key: 'Cell Value API', val: 'POST /api/columns/values (single upsert), POST /api/columns/values/batch' },
    { key: 'State Persistence', val: 'Column ordering, visible/hidden state, and aliases in localStorage' },
    { key: 'Math Engine', val: 'KaTeX v0.16.8 client-side auto-render extension' }
  ]
});

// ==========================================
// SLIDE 7: Hierarchical Taxonomy & Dynamic Column Splitting
// ==========================================
createFeatureSlide({
  slideNum: 7,
  category: 'Taxonomy Matrix & Schema Evolution',
  title: 'Hierarchical Taxonomy & Dynamic Column Splitting',
  subtitle: 'Runtime schema evolution enabling multi-level scientific variables and nested sub-headers',
  accentColor: COLORS.purple,
  imageFile: '07_dynamic_column_split.png',
  imageCaption: 'Column Splitting Modal Configuring Hierarchical Multi-Level Sub-Headers',
  uiHighlights: [
    'Split Column modal with custom column selector and sub-column quantity counter (1 to 10)',
    'Dynamic sub-column label inputs (#1 Sub 1, #2 Sub 2) with + Add Another Sub-Column button',
    'Zero-downtime execution creating hierarchical sub-columns across all papers in the cluster'
  ],
  bullets: [
    {
      title: 'Zero-Downtime Dynamic Columns',
      desc: 'Researchers can append custom benchmark variables (e.g. Time Complexity, Sample Size, Dataset) to specific clusters or globally across projects without altering SQLite tables.'
    },
    {
      title: 'Hierarchical Column Splitting Engine',
      desc: 'Converts a flat matrix column into a multi-column grouped parent (e.g. Evaluation Metrics splits into BLEU, Lagging, and WER) using relational parent_column_id pointers.'
    },
    {
      title: 'Multi-Level Header Rendering',
      desc: 'Generates complex two-tier HTML thead structures with dynamic colspan and rowspan attributes, matching the rigorous formatting standards of academic survey tables.'
    },
    {
      title: 'Lossless Column Unsplitting',
      desc: 'The /unsplit endpoint safely merges child sub-columns back into a unified parent container without data corruption, concatenating sub-values cleanly.'
    }
  ],
  specs: [
    { key: 'Endpoints', val: 'POST /api/columns, POST /api/columns/split, POST /api/columns/unsplit' },
    { key: 'Data Model', val: 'dynamic_columns table with self-referencing parent_column_id' },
    { key: 'Value Storage', val: 'paper_column_values table (paper_id, column_id, value) EAV pattern' },
    { key: 'Colspan Export', val: 'SheetJS cell merge ranges dynamically computed from parent/child count' }
  ]
});

// ==========================================
// SLIDE 8: Split-Screen Reviewer, KaTeX Math & PDF.js
// ==========================================
createFeatureSlide({
  slideNum: 8,
  category: 'Document Reading & Deep Extraction',
  title: 'Split-Screen PDF.js Reviewer & KaTeX Math Extraction',
  subtitle: 'Side-by-side manuscript inspection with persistent resizer and live LaTeX preview',
  accentColor: COLORS.pink,
  imageFile: '08_splitscreen_reviewer.png',
  imageCaption: 'Split-Screen PDF Reader (Seamless Paper) Alongside Math & Attribute Extraction',
  uiHighlights: [
    'Left: Full Mozilla PDF.js canvas rendering the 145-page Meta AI SeamlessM4T research paper',
    'Right: Extracted variables (Target Modality, Vocoder, BLEU, Average Lagging, ASR WER)',
    'Live breadcrumbs (#1 Seamless) with quick status toggle and split resize handle'
  ],
  bullets: [
    {
      title: 'Integrated Split-Screen Reading Canvas',
      desc: 'Positions the embedded PDF.js reader iframe on the left and comprehensive data extraction forms on the right, eliminating context switching between external PDF viewers and tables.'
    },
    {
      title: 'Draggable Split Pane Resizer',
      desc: 'Smooth draggable divider bar allows researchers to customize viewer ratios (18% to 80%), with position preferences stored in localStorage across reading sessions.'
    },
    {
      title: 'Live KaTeX Equation Sandbox',
      desc: 'Real-time two-way formula previewer converts LaTeX syntax into formatted mathematical notation on keypress, validating complex objective functions before saving.'
    },
    {
      title: 'Auto-Saving Attribute Pipeline',
      desc: 'Intuitions, core equations, strengths, gaps, advantages, and criticisms auto-save via debounced REST PUT requests to /api/papers/:id with visual save-state indicators.'
    }
  ],
  specs: [
    { key: 'Review Engines', val: 'Frontend/review.html (Production) & Frontend/review_react.html (React 18)' },
    { key: 'PDF Renderer', val: 'Mozilla PDF.js v3.11 with canvas rendering, zoom, and page navigation' },
    { key: 'Split Persistence', val: 'litsphere_review_split stored in localStorage with clamp bounds' },
    { key: 'Data Sync API', val: 'PUT /api/papers/:id with debounced JSON payload transmission' }
  ]
});

// ==========================================
// SLIDE 9: PRISMA 2020 Blind Screening & Peer Annotations
// ==========================================
createFeatureSlide({
  slideNum: 9,
  category: 'Systematic Review Methodology',
  title: 'PRISMA 2020 Blind Screening & Page-Anchored Annotations',
  subtitle: 'Rigorous systematic appraisal with structured exclusion reasons and supervisor audit trails',
  accentColor: COLORS.green,
  imageFile: '09_prisma_screening.png',
  imageCaption: 'PRISMA 2020 Quality Appraisal Panel with Exclusion Reasons & Peer Notes',
  uiHighlights: [
    'Blind Screening decision buttons: [Include] (highlighted active), [Exclude], [Uncertain]',
    'Exclusion reason taxonomy dropdown and saved appraisal state badge',
    'Collaborator comments section with page-anchored quotes for peer consensus review'
  ],
  bullets: [
    {
      title: 'PRISMA 2020 Systematic Compliance',
      desc: 'Provides structured quality appraisal controls for systematic reviews, recording independent reviewer decisions (included, excluded, uncertain) in paper_screening.'
    },
    {
      title: 'Standardized Exclusion Taxonomy',
      desc: 'Pre-configured exclusion reasons include Wrong Study Design, Insufficient Data, Non-Peer Reviewed, Duplicate Study, Language Barrier, and Outdated Benchmark.'
    },
    {
      title: 'Page-Anchored Quote Annotations',
      desc: 'Reviewers highlight or type specific evidence from manuscripts, linking comments directly to specific PDF page numbers (page_number) with quoted excerpts (quote_text).'
    },
    {
      title: 'Multi-Reviewer Collaboration Trail',
      desc: 'Tracks who performed each appraisal with timestamped audit trails, allowing supervisors and co-authors to inspect evaluation rationales without mutual bias.'
    }
  ],
  specs: [
    { key: 'Screening Routes', val: 'GET /api/reviews/screening/:paperId, POST /api/reviews/screening' },
    { key: 'Comment Routes', val: 'GET /api/reviews/comments/:paperId, POST /api/reviews/comments' },
    { key: 'Database Schema', val: 'paper_screening & paper_comments with foreign keys to papers & users' },
    { key: 'PRISMA Tracking', val: 'Live aggregation of screening counts for PRISMA flow diagram reporting' }
  ]
});

// ==========================================
// SLIDE 10: 4-Tier Academic RBAC & Supervisor Sharing
// ==========================================
createFeatureSlide({
  slideNum: 10,
  category: 'Collaboration & Access Control',
  title: '4-Tier Academic RBAC & Secure Supervisor Sharing',
  subtitle: 'Fine-grained institutional roles and cryptographically signed public review links',
  accentColor: COLORS.gold,
  imageFile: '10_collaboration_rbac.png',
  imageCaption: 'Project Team & Access Roles Modal Showing Roster and Role Assignments',
  uiHighlights: [
    'Role permission matrix: Owner, Editor (Co-Author), Reviewer (Advisor), Viewer (Read-only)',
    'Invite collaborator form with instant institutional email/username lookup',
    'Research team roster displaying member avatars, email addresses, and active role tags'
  ],
  bullets: [
    {
      title: '4-Tier Role-Based Access Control',
      desc: 'Granular permissions: Owner (full survey control), Editor (co-author editing papers & matrix), Reviewer (advisor PRISMA screening & notes), and Viewer (read-only inspect & export).'
    },
    {
      title: 'Instant Collaborator Invitation',
      desc: 'Owners can invite colleagues by email or username; the system verifies account presence and binds the user in project_members with immediate workspace access.'
    },
    {
      title: 'Cryptographic Supervisor Share Links',
      desc: 'Generates secure 64-character hex tokens (crypto.randomBytes(32)) for external advisors to inspect live benchmark matrices without creating an account (/shared/:token).'
    },
    {
      title: 'Survey Ownership Transfer Protocol',
      desc: 'Enables survey leads to seamlessly hand over ownership (POST /api/projects/:id/transfer-ownership) while gracefully demoting the creator to an Editor.'
    }
  ],
  specs: [
    { key: 'RBAC Routes', val: 'GET /api/collaboration/:id/members, POST .../invite, PUT .../role, DELETE' },
    { key: 'Share Links API', val: 'POST /api/projects/:id/share-link, GET /api/projects/shared/:token' },
    { key: 'Security Guard', val: 'requireProjectRole middleware verifying project_members against JWT' },
    { key: 'Audit Trail', val: 'Role promotions, demotions, and invitations logged in audit_logs' }
  ]
});

// ==========================================
// SLIDE 11: Cluster Synthesis & Multi-Format Thesis Export
// ==========================================
createFeatureSlide({
  slideNum: 11,
  category: 'Synthesis & Publication Export',
  title: 'Cluster Insights Synthesis & Multi-Format Thesis Export',
  subtitle: 'Automated categorical synthesis paired with SheetJS Excel, LaTeX tabularx, and BibTeX generators',
  accentColor: COLORS.cyan,
  imageFile: '11_export_modal.png',
  imageCaption: 'Export Modal Supporting Structured Multi-Level Excel, LaTeX Booktabs & BibTeX',
  uiHighlights: [
    'Export Scope selector (Full Project vs. Specific Cluster) & File Format selector',
    'Interactive column checkboxes (18 columns selected with Select All / Clear All)',
    'One-click direct browser download producing publication-ready Excel & LaTeX tables'
  ],
  bullets: [
    {
      title: 'Automated Cluster Insights Synthesizer',
      desc: 'The /clusters/:id/insights engine aggregates unique values across all columns, displaying distinct metric counts with citation badges (#1, #2, #3) ready to copy for thesis writeups.'
    },
    {
      title: 'SheetJS Multi-Level Excel Generation',
      desc: 'Builds publication-grade .xlsx spreadsheets featuring merged two-tier header cells for split columns (!merges), auto-fitted column widths, freeze panes, and custom styled headers.'
    },
    {
      title: 'LaTeX Tabularx & Booktabs Generator',
      desc: 'Generates compile-ready LaTeX survey code using booktabs, toprule, midrule, bottomrule, multicolumn, and sanitized LaTeX special characters.'
    },
    {
      title: 'BibTeX & RIS Reference Files',
      desc: 'One-click export of structured .bib and .ris files containing DOI, authors, journal, and abstract fields for seamless drag-and-drop into Zotero and Overleaf.'
    }
  ],
  specs: [
    { key: 'Export API', val: 'GET /api/export/excel, /latex, /bibtex, /ris, /csv, /json' },
    { key: 'Excel Engine', val: 'SheetJS (xlsx) with dynamic merge ranges and column width heuristics' },
    { key: 'LaTeX Engine', val: 'Custom LaTeX generator formatting tabularx with auto-wrapping columns' },
    { key: 'Scope Control', val: 'Filter export by specific taxonomy cluster or full systematic review corpus' }
  ]
});

// ==========================================
// SLIDE 12: Admin Control Center, Live Telemetry & QA
// ==========================================
createFeatureSlide({
  slideNum: 12,
  category: 'System Administration & QA Verification',
  title: 'Admin Control Center, Live Telemetry & Test Automation',
  subtitle: 'Platform telemetry KPIs, global maintenance guardrails, and 100% automated test coverage',
  accentColor: COLORS.red,
  imageFile: '12_admin_telemetry.png',
  imageCaption: 'System Operations Portal with Memory Telemetry, Database KPIs & Audit Logs',
  uiHighlights: [
    'Live hardware metrics: 44.5 MB heap memory, 124.25 MB SQLite WAL database, 845 audit events',
    'Server infrastructure details: Node.js v25.8.1, Darwin arm64, 8 logical cores, healthy status',
    'Platform maintenance mode toggle & broadcast maintenance banner input'
  ],
  bullets: [
    {
      title: 'Real-Time Telemetry & Health Monitoring',
      desc: 'Admin dashboard streams live hardware & software KPIs: Node.js process heap memory, RSS footprint, SQLite database file size (124 MB), WAL size, and total security audit events (845+).'
    },
    {
      title: 'Global Platform Maintenance Guardrails',
      desc: 'System maintenance mode toggle intercepts non-admin API requests with HTTP 503 and broadcasts custom banner announcements across all active researcher workspaces.'
    },
    {
      title: 'Researcher Seat & Quota Governance',
      desc: 'Administrators can modify individual researcher token quotas, allocate storage limits (MB), suspend or activate researcher seats, and reset security credentials.'
    },
    {
      title: 'Comprehensive Automated QA Suite',
      desc: '6 automated test suites executing 100+ assertions verify RBAC permissions, user credentials, audit logging, column splitting, and export formatting with 100% pass rates.'
    }
  ],
  specs: [
    { key: 'Admin Endpoints', val: 'GET /api/admin/stats, GET /api/admin/audit-logs, POST /api/admin/maintenance' },
    { key: 'Test Automation', val: 'Backend/tests/run_all.js executing 6 test suites with zero regressions' },
    { key: 'Audit Schema', val: 'audit_logs table tracking user_id, action, ip_address, details, status' },
    { key: 'Storage Quotas', val: 'recalculateUserStorage utility calculating exact byte usage from SQLite BLOBs' }
  ]
});

// Save Presentation
const outputPath = path.join(__dirname, '..', 'LitSphere_Literature_Review_System_Presentation.pptx');
pres.writeFile({ fileName: outputPath }).then(fileName => {
  console.log(`\n🎉 Presentation successfully generated: ${fileName}`);
  const stats = fs.statSync(fileName);
  console.log(`File Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total Slides: 12 (exact constraint met: 9-12 pages)`);
}).catch(err => {
  console.error('Error generating presentation:', err);
  process.exit(1);
});
