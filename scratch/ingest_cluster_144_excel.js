const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Simultaneous_Real_Time_Translation_Literature_Matrix.xlsx';
const CLUSTER_ID = 144;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Loaded ${excelRows.length} rows from Excel sheet '${wb.SheetNames[0]}'`);

// 2. Fetch existing papers in cluster 144
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

// 3. Define all 25 dynamic columns to register in cluster 144
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
  'Notes'
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
  'RT-001': {
    domain: 'Natural Language Processing / Machine Translation / Simultaneous MT',
    keywords: ['Simultaneous Translation', 'Prefix-to-Prefix', 'Wait-k Policy', 'Controllable Latency', 'Implicit Anticipation', 'Neural Machine Translation', 'Real-Time MT']
  },
  'RT-002': {
    domain: 'Machine Translation / Monotonic Attention / Simultaneous Translation',
    keywords: ['Monotonic Attention', 'Multihead Attention', 'Simultaneous Machine Translation', 'Streaming Translation', 'Hard Attention', 'Online Generation']
  },
  'RT-003': {
    domain: 'Speech Translation / End-to-End SimulST',
    keywords: ['SimulMT to SimulST', 'End-to-End Simultaneous ST', 'Speech Translation', 'Wait-k Policy', 'Acoustic Feature Alignment', 'Real-Time Translation']
  },
  'RT-004': {
    domain: 'Speech Processing / Joint ASR & Translation / Streaming',
    keywords: ['Streaming Speech Translation', 'Joint ASR-ST', 'End-to-End ST', 'Online Speech Recognition', 'Dual-Decoder', 'Latency Optimization']
  },
  'RT-005': {
    domain: 'Speech Translation / End-to-End SimulST',
    keywords: ['RealTranS', 'Convolutional Weighted-Shrinking', 'Simultaneous Speech Translation', 'Streaming ST', 'Transformer', 'Latency Reduction']
  },
  'RT-006': {
    domain: 'Speech Translation / Simultaneous Translation / Transducer',
    keywords: ['Transducer Networks', 'Cross Attention', 'Simultaneous Translation', 'Read-Write Policy', 'Neural Transducer', 'Streaming Speech']
  },
  'RT-007': {
    domain: 'Speech Translation / Simultaneous Translation / IWSLT',
    keywords: ['IWSLT 2021', 'Simultaneous Speech Translation', 'Shared Task', 'USTC-NELSLIP', 'Wait-k', 'Quality-Latency Trade-Off']
  },
  'RT-008': {
    domain: 'Speech Translation / SimulST / Policy Optimization',
    keywords: ['Random Wait-k', 'Robust Wait-k', 'Simultaneous Speech Translation', 'Policy Optimization', 'Cross-Modal Alignment', 'Streaming ST']
  },
  'RT-009': {
    domain: 'Speech Translation / Streaming ST / IWSLT',
    keywords: ['IWSLT 2024', 'Streaming Speech Translation', 'CMU System', 'End-to-End SimulST', 'Streaming Encoder', 'Latency Optimization']
  },
  'RT-010': {
    domain: 'Speech-to-Speech Translation / Multitask Learning / Streaming',
    keywords: ['StreamSpeech', 'Simultaneous Speech-to-Speech Translation', 'SimulS2ST', 'Multi-Task Learning', 'Streaming S2ST', 'Discrete Units', 'Real-Time S2ST']
  },
  'RT-011': {
    domain: 'Speech Translation / LLM-Based Streaming ST',
    keywords: ['IWSLT 2025', 'LLM-Based SimulST', 'Causal Speech Encoder', 'Unsegmented Streaming ST', 'Multimodal LLM', 'CMU System']
  },
  'RT-012': {
    domain: 'Speech Translation / Simultaneous Translation / Systematic Review',
    keywords: ['Systematic Literature Review', 'Simultaneous Speech Translation', 'SimulST Realism', 'Latency Metrics', 'Unbounded Speech', 'Evaluation Protocols', 'Comprehensive Survey']
  },
  'RT-013': {
    domain: 'Speech-to-Speech Translation / Evaluation & Benchmarking',
    keywords: ['Long-Form SimulS2ST', 'Simultaneous Speech-to-Speech Translation', 'Latency Accumulation', 'Evaluation Methodology', 'Continuous Streaming', 'IWSLT 2026']
  },
  'RT-014': {
    domain: 'Multimodal Foundation Models / Simultaneous ST / Adaptation',
    keywords: ['Test-Time Adaptation', 'Multimodal Foundation Models', 'Simultaneous Speech Translation', 'Pause-Based Segmentation', 'KV Caching', 'Streaming Agent', 'IWSLT 2026']
  },
  'RT-015': {
    domain: 'Multimodal LLM / Simultaneous ST / IWSLT',
    keywords: ['Multimodal LLM', 'CUHKSZ System', 'IWSLT 2026', 'Wait-Token Policy', 'Emission Control', 'Qwen-Omni', 'Streaming Translation']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Simultaneous & Real-Time Translation',
    keywords: ['Simultaneous Translation', 'Real-Time Translation']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || row['Code / Resources'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('priority') || rawStatus.includes('start here')) statusVal = 'in_progress';
  else statusVal = 'unread';

  // Check title match against existing DB papers in cluster 144
  let matchedDbPaper = dbPapers.find(p => titlesMatch(exTitle, p.title));
  let paperId;

  if (matchedDbPaper) {
    paperId = matchedDbPaper.id;
    console.log(`\nMatched existing DB paper ID ${paperId} in cluster 144 for [${paperCode}] "${exTitle}"`);
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
      parseInt(row['Publish Year'], 10) || matchedDbPaper.year || 2024,
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
    // Insert new paper into DB for Cluster 144
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
      parseInt(row['Publish Year'], 10) || 2024,
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
    console.log(`\nInserted NEW DB paper ID ${paperId} into cluster 144 for [${paperCode}] "${exTitle}"`);
  }

  processedCount++;

  // Update paper_column_values for all 25 dynamic columns
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
