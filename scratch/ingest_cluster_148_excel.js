const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Evaluation_and_Analysis_Literature_Matrix.xlsx';
const CLUSTER_ID = 148;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheetName = 'Evaluation & Analysis';
const sheet = wb.Sheets[sheetName];
if (!sheet) {
  throw new Error(`Sheet '${sheetName}' not found in ${EXCEL_PATH}`);
}

const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
const headerRow = rawData[0];
console.log(`Found header row at index 0 with ${headerRow.length} columns:`, headerRow);

// Extract rows from index 1 onwards
const excelRows = [];
for (let i = 1; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row || !row[0]) continue;
  const obj = {};
  headerRow.forEach((h, idx) => {
    obj[h] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
  });
  excelRows.push(obj);
}
console.log(`Loaded ${excelRows.length} valid paper rows from Excel sheet '${sheetName}'`);

// 2. Fetch existing papers in cluster 148
const dbPapers = db.prepare('SELECT * FROM papers WHERE project_id = ? AND cluster_id = ?').all(PROJECT_ID, CLUSTER_ID);
console.log(`Found ${dbPapers.length} papers currently in DB for Project ${PROJECT_ID}, Cluster ${CLUSTER_ID}`);

function normalize(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titlesMatch(t1, t2) {
  const n1 = normalize(t1);
  const n2 = normalize(t2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const words1 = new Set(n1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 2));
  let common = 0;
  for (const w of words1) {
    if (words2.has(w)) common++;
  }
  const similarity = common / Math.max(words1.size, words2.size);
  return similarity >= 0.65;
}

// 3. Define all dynamic columns to register in cluster 148 (including Source URL if present)
const DYNAMIC_COLUMNS = [
  'Paper ID',
  'Survey Type',
  'Research Area',
  'Research Problem / Motivation',
  'Scope of Review',
  'Review Period',
  'Search Strategy',
  'Databases / Sources',
  'Number of Papers Reviewed',
  'Inclusion Criteria',
  'Exclusion Criteria',
  'Classification / Taxonomy',
  'Approaches / Methods Identified',
  'Datasets Identified',
  'Models / Systems Identified',
  'Evaluation Metrics',
  'Major Findings',
  'Research Trends',
  'Strengths',
  'Limitations / Criticism',
  'Research Gaps',
  'Future Research Directions',
  'Relevance to Our Research',
  'Code / Resources',
  'Notes',
  'Source URL'
];

const colIdMap = {};
for (const colName of DYNAMIC_COLUMNS) {
  let existing = db.prepare('SELECT id FROM dynamic_columns WHERE cluster_id = ? AND column_name = ?').get(CLUSTER_ID, colName);
  if (!existing) {
    const res = db.prepare("INSERT INTO dynamic_columns (cluster_id, column_name, col_type) VALUES (?, ?, 'text')").run(CLUSTER_ID, colName);
    colIdMap[colName] = res.lastInsertRowid;
    console.log(`Created dynamic column '${colName}' with ID ${colIdMap[colName]}`);
  } else {
    colIdMap[colName] = existing.id;
  }
}

// 4. Curated domains & keywords mapping per Paper ID
const CURATED_METADATA = {
  'EA-001': {
    domain: 'Machine Translation / Metric Evaluation / Automated & Human Assessment',
    keywords: ['Machine Translation Evaluation', 'Automated MT Metrics', 'Human Evaluation', 'BLEU', 'METEOR', 'TER', 'ChrF', 'NLE 2020']
  },
  'EA-002': {
    domain: 'Speech-to-Speech Translation / Metric Assessment / ASR-BLEU & Human Quality',
    keywords: ['Speech-to-Speech Translation', 'S2ST Evaluation', 'ASR-BLEU', 'Human Quality Rating', 'ASRU 2021', 'Acoustic Evaluation']
  },
  'EA-003': {
    domain: 'Simultaneous Translation / Evaluation Toolkits / Standardized Streaming Benchmarking',
    keywords: ['SimulEval', 'Simultaneous Translation Toolkit', 'Latency Evaluation', 'Average Lagging', 'Streaming S2T', 'EMNLP 2020']
  },
  'EA-004': {
    domain: 'Simultaneous Translation / Latency Evaluation / Stream-Level Measurement',
    keywords: ['Stream-Level Latency', 'Simultaneous MT', 'Continuous Audio Streams', 'Latency Metrics', 'EMNLP 2021', 'Unsegmented Evaluation']
  },
  'EA-005': {
    domain: 'Simultaneous Translation / Latency Metrics / Duration-Aware Average Token Delay',
    keywords: ['Average Token Delay', 'ATD Metric', 'Duration-Aware Latency', 'Simultaneous Translation', 'JNLP 2024', 'Speech Duration Alignment']
  },
  'EA-006': {
    domain: 'Simultaneous Speech Translation / Low-Latency Systems / End-to-End Benchmarking',
    keywords: ['End-to-End Evaluation', 'Low-Latency Simultaneous ST', 'Real-Time Streaming', 'EMNLP 2023', 'Computation Delay', 'ASR-MT Pipeline']
  },
  'EA-007': {
    domain: 'Speech Translation / Benchmark Evaluation / Human Annotation & Automatic Metrics',
    keywords: ['IWSLT 2023', 'Speech Translation Evaluation', 'Human Annotation', 'Audio Segmentation', 'LREC-COLING 2024', 'Metric Correlation']
  },
  'EA-008': {
    domain: 'Simultaneous Speech Translation / Realistic Latency / Computation-Aware Benchmarking',
    keywords: ['Realistic Latency', 'Computation-Aware Evaluation', 'Real-Time S2TT', 'TACL 2025', 'Audio Streaming Latency', 'Hardware Dependent Latency']
  },
  'EA-009': {
    domain: 'Simultaneous Speech Translation / Latency Metrics / Beyond Expected Delay',
    keywords: ['Latency Distribution', 'Average Lagging Critique', 'Simultaneous ST Metrics', 'ACL 2025 Findings', 'Outlier Delay Sensitivity']
  },
  'EA-010': {
    domain: 'Simultaneous Speech Translation / Computation-Aware Latency / CA* Metric Formulation',
    keywords: ['CA* Metric', 'Computation-Aware Latency', 'Hardware Drift Normalization', 'Simultaneous ST', 'NAACL 2025', 'Runtime Profiling']
  },
  'EA-011': {
    domain: 'Speech Synthesis / TTS Evaluation / Perceptual Quality & Intelligibility',
    keywords: ['Speech Synthesis Evaluation', 'TTS Assessment', 'Naturalness & Intelligibility', 'SSW 2025', 'MOS Evaluation', 'Objective Speech Metrics']
  },
  'EA-012': {
    domain: 'Evaluation Methodology / Metric Meta-Evaluation / Local Metric Accuracy',
    keywords: ['Metric Meta-Evaluation', 'Local Metric Accuracy', 'Contextual Evaluation', 'NAACL 2025', 'Metric Reliability', 'Automated Evaluation Benchmarking']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Evaluation & Analysis',
    keywords: ['Evaluation & Analysis', 'Translation Metrics']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('priority') || rawStatus.includes('start here')) statusVal = 'in_progress';
  else statusVal = 'unread';

  // Check title match against existing DB papers in cluster 148
  let matchedDbPaper = dbPapers.find(p => titlesMatch(exTitle, p.title));
  let paperId;

  if (matchedDbPaper) {
    paperId = matchedDbPaper.id;
    console.log(`\nMatched existing DB paper ID ${paperId} in cluster 148 for [${paperCode}] "${exTitle}"`);
    db.prepare(`
      UPDATE papers
      SET title = ?,
          authors = ?,
          year = ?,
          pub = ?,
          doi = ?,
          domain = ?,
          status = ?,
          strengths = ?,
          advantages = ?,
          criticism = ?,
          gaps = ?,
          future_directions = ?,
          intuition = ?
      WHERE id = ?
    `).run(
      exTitle,
      row['Authors'] || '',
      parseInt(row['Publish Year'], 10) || matchedDbPaper.year || 2025,
      row['Publisher / Conference / Journal'] || '',
      row['DOI / Link'] || '',
      meta.domain,
      statusVal,
      row['Strengths'] || '',
      row['Strengths'] || '',
      row['Limitations / Criticism'] || '',
      row['Research Gaps'] || '',
      row['Future Research Directions'] || '',
      row['Major Findings'] || row['Research Problem / Motivation'] || '',
      paperId
    );
  } else {
    // Insert new paper into DB for Cluster 148
    const res = db.prepare(`
      INSERT INTO papers (
        project_id,
        cluster_id,
        title,
        authors,
        year,
        pub,
        doi,
        domain,
        status,
        strengths,
        advantages,
        criticism,
        gaps,
        future_directions,
        intuition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      PROJECT_ID,
      CLUSTER_ID,
      exTitle,
      row['Authors'] || '',
      parseInt(row['Publish Year'], 10) || 2025,
      row['Publisher / Conference / Journal'] || '',
      row['DOI / Link'] || '',
      meta.domain,
      statusVal,
      row['Strengths'] || '',
      row['Strengths'] || '',
      row['Limitations / Criticism'] || '',
      row['Research Gaps'] || '',
      row['Future Research Directions'] || '',
      row['Major Findings'] || row['Research Problem / Motivation'] || ''
    );
    paperId = res.lastInsertRowid;
    console.log(`\nInserted NEW DB paper ID ${paperId} into cluster 148 for [${paperCode}] "${exTitle}"`);
  }

  processedCount++;

  // Update paper_column_values for all dynamic columns
  const insertColVal = db.prepare(`
    INSERT INTO paper_column_values (paper_id, column_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(paper_id, column_id) DO UPDATE SET value = excluded.value
  `);

  for (const colName of DYNAMIC_COLUMNS) {
    const colId = colIdMap[colName];
    const val = row[colName] !== undefined && row[colName] !== null ? String(row[colName]).trim() : '';
    insertColVal.run(paperId, colId, val);
  }

  // Update keywords
  db.prepare('DELETE FROM keywords WHERE paper_id = ?').run(paperId);
  const insertKw = db.prepare('INSERT INTO keywords (paper_id, keyword) VALUES (?, ?)');
  for (const kw of meta.keywords) {
    insertKw.run(paperId, kw.trim());
  }
  console.log(`  Domain: ${meta.domain}`);
  console.log(`  Keywords (${meta.keywords.length}): ${meta.keywords.join(', ')}`);
}

console.log(`\n=== INGESTION SUMMARY ===`);
console.log(`Successfully processed and populated ${processedCount}/${excelRows.length} papers!`);

// 6. Verify result in DB
const checkPapers = db.prepare(`
  SELECT id, title, authors, year, pub, domain, status
  FROM papers WHERE project_id = ? AND cluster_id = ?
`).all(PROJECT_ID, CLUSTER_ID);
console.log(`\nVerified DB Papers in Cluster ${CLUSTER_ID}: ${checkPapers.length}`);
checkPapers.forEach(p => console.log(` - ID ${p.id} | ${p.title.slice(0, 60)}... | Domain: ${p.domain} | Status: ${p.status}`));

const checkVals = db.prepare(`
  SELECT COUNT(*) as total_vals
  FROM paper_column_values pcv
  JOIN dynamic_columns dc ON dc.id = pcv.column_id
  WHERE dc.cluster_id = ?
`).get(CLUSTER_ID);
console.log(`Total dynamic column values in cluster ${CLUSTER_ID}: ${checkVals.total_vals}`);

const checkKws = db.prepare(`
  SELECT COUNT(*) as total_kws
  FROM keywords k
  JOIN papers p ON p.id = k.paper_id
  WHERE p.project_id = ? AND p.cluster_id = ?
`).get(PROJECT_ID, CLUSTER_ID);
console.log(`Total keywords in cluster ${CLUSTER_ID}: ${checkKws.total_kws}`);
