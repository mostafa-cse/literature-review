const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Multilingual_Low_Resource_Translation_Literature_Matrix.xlsx';
const CLUSTER_ID = 145;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Header is at row 3 (0-indexed)
const headerRow = rawData[3];
console.log(`Found header row at index 3 with ${headerRow.length} columns:`, headerRow);

// Extract rows from index 4 onwards
const excelRows = [];
for (let i = 4; i < rawData.length; i++) {
  const row = rawData[i];
  if (!row || !row[0]) continue;
  const obj = {};
  headerRow.forEach((h, idx) => {
    obj[h] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
  });
  excelRows.push(obj);
}
console.log(`Loaded ${excelRows.length} valid paper rows from Excel sheet '${sheetName}'`);

// 2. Fetch existing papers in cluster 145
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

// 3. Define all 25 dynamic columns to register in cluster 145
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
  'MLRT-001': {
    domain: 'Natural Language Processing / Multilingual Neural Machine Translation / Systematic Survey',
    keywords: ['Multilingual NMT', 'Systematic Survey', 'Zero-Shot Translation', 'Shared Representations', 'Cross-Lingual Transfer', 'Low-Resource MT', 'Many-to-Many Translation']
  },
  'MLRT-002': {
    domain: 'Natural Language Processing / Low-Resource Machine Translation / Comprehensive Survey',
    keywords: ['Low-Resource MT', 'Comprehensive Survey', 'Data Augmentation', 'Pivot Translation', 'Transfer Learning', 'Synthetic Data', 'Back-Translation', 'Unsupervised NMT']
  },
  'MLRT-003': {
    domain: 'Natural Language Processing / Low-Resource Neural Machine Translation / Systematic Review',
    keywords: ['Low-Resource NMT', 'Multilingual Pretraining', 'Semi-Supervised MT', 'Cross-Lingual Transfer', 'Linguistic Proximity', 'Domain Adaptation']
  },
  'MLRT-004': {
    domain: 'Natural Language Processing / Low-Resource NMT / Monolingual & Multimodal Transfer',
    keywords: ['Low-Resource NMT', 'Auxiliary Data Exploitation', 'Monolingual Data', 'Multilingual Transfer', 'Multimodal NMT', 'Data Scarcity']
  },
  'MLRT-005': {
    domain: 'Natural Language Processing / Multilingual NMT / Architecture & Training Paradigm',
    keywords: ['Multilingual NMT', 'Parameter Sharing', 'Language Clustering', 'Zero-Shot Translation', 'Multi-Source Translation', 'Vocabulary Sharing']
  },
  'MLRT-006': {
    domain: 'Natural Language Processing / Multilingual Sequence-to-Sequence Pretraining',
    keywords: ['mBART', 'Multilingual Denoising', 'Sequence-to-Sequence Pretraining', 'Low-Resource NMT', 'Back-Translation', 'Zero-Bitext Transfer']
  },
  'MLRT-007': {
    domain: 'Natural Language Processing / Multilingual NMT / Alignment-Aware Pretraining',
    keywords: ['mRASP', 'Random Aligned Substitution', 'Cross-Lingual Alignment', 'Multilingual Pretraining', 'Downstream MT', 'Low-Resource Transfer']
  },
  'MLRT-008': {
    domain: 'Natural Language Processing / Language Clustering & Specialization / Multilingual NMT',
    keywords: ['Language Clustering', 'Multilingual NMT', 'Universal Multilingual Model', 'Learned Language Embeddings', 'Parameter Sharing', 'Interference Mitigation']
  },
  'MLRT-009': {
    domain: 'Natural Language Processing / Massively Multilingual NMT / Empirical Analysis',
    keywords: ['Massively Multilingual NMT', 'Curse of Multilinguality', 'Capacity Allocation', 'Language Relatedness', 'Low-Resource Languages', 'Bible Corpus']
  },
  'MLRT-010': {
    domain: 'Natural Language Processing / Evaluation & Benchmarking / Multilingual MT',
    keywords: ['FLORES-101', 'Multilingual Evaluation', 'Low-Resource Benchmark', '101 Languages', 'Human Quality Assessment', 'Translation Quality Score']
  },
  'MLRT-011': {
    domain: 'Natural Language Processing / Massively Multilingual Foundation Models',
    keywords: ['NLLB-200', 'No Language Left Behind', '200 Languages', 'Low-Resource NMT', 'Sparse Mixture-of-Experts', 'Data Mining', 'Human-Centered Evaluation']
  },
  'MLRT-012': {
    domain: 'Natural Language Processing / Unsupervised Neural Machine Translation',
    keywords: ['Unsupervised NMT', 'Weight Sharing', 'Dual Encoders', 'Denoising Autoencoder', 'Local and Global GAN', 'Zero-Parallel Resource']
  },
  'MLRT-013': {
    domain: 'Natural Language Processing / Parameter-Efficient Fine-Tuning / Modular Adapters',
    keywords: ['Language-Family Adapters', 'Parameter-Efficient NMT', 'Low-Resource Transfer', 'Modular Adaptation', 'LoResMT', 'Multilingual Pretrained Models']
  },
  'MLRT-014': {
    domain: 'Natural Language Processing / Extremely Low-Resource MT / Regularization & Data Augmentation',
    keywords: ['Rogue Memorization', 'Extremely Low-Resource MT', 'Many-to-One Translation', 'Sample Rephrasing', 'Indigenous Languages', 'mBART']
  },
  'MLRT-015': {
    domain: 'Natural Language Processing / Small Language Models / Knowledge Distillation in MT',
    keywords: ['Small Language Models', 'Knowledge Distillation', 'SLM vs LLM', 'Low-Resource Languages', 'LoResMT 2026', '200 Languages', 'Efficient Inference']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Multilingual & Low-Resource Translation',
    keywords: ['Multilingual NMT', 'Low-Resource MT']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || row['Code / Resources'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('priority') || rawStatus.includes('start here')) statusVal = 'in_progress';
  else statusVal = 'unread';

  // Check title match against existing DB papers in cluster 145
  let matchedDbPaper = dbPapers.find(p => titlesMatch(exTitle, p.title));
  let paperId;

  if (matchedDbPaper) {
    paperId = matchedDbPaper.id;
    console.log(`\nMatched existing DB paper ID ${paperId} in cluster 145 for [${paperCode}] "${exTitle}"`);
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
    // Insert new paper into DB for Cluster 145
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
    console.log(`\nInserted NEW DB paper ID ${paperId} into cluster 145 for [${paperCode}] "${exTitle}"`);
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
