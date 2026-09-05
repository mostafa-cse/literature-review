const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Datasets_and_Benchmarks_Literature_Matrix(1).xlsx';
const CLUSTER_ID = 147;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheetName = 'Datasets & Benchmarks';
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

// 2. Fetch existing papers in cluster 147
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

// 3. Define all 25 dynamic columns to register in cluster 147
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
  'DB-001': {
    domain: 'Speech Translation / Multilingual Datasets / Speech-to-Text Benchmark',
    keywords: ['CoVoST', 'Multilingual Speech Translation', 'Speech-to-Text Benchmark', 'Common Voice Audio', 'Low-Resource ST', 'LREC 2020']
  },
  'DB-002': {
    domain: 'Speech Translation / Massively Multilingual Datasets / Large-Scale Benchmark',
    keywords: ['CoVoST 2', 'Massively Multilingual ST', 'Multilingual Benchmark', 'Interspeech 2021', '21 Languages', 'Direct Speech Translation']
  },
  'DB-003': {
    domain: 'Speech Translation / Multilingual Benchmark / TED Talks Corpus',
    keywords: ['MuST-C', 'Speech Translation Corpus', 'TED Talks Benchmark', 'Multilingual ST', 'NAACL 2019', 'Acoustic Alignment']
  },
  'DB-004': {
    domain: 'Speech Translation / Parliamentary Debates / Spoken Language Subtitling',
    keywords: ['Europarl-ST', 'Parliamentary Speech', 'Speech Translation Benchmark', 'Automatic Subtitling', 'European Parliament', 'Acoustic Corpus']
  },
  'DB-005': {
    domain: 'Speech Processing / Multilingual Speech Evaluation / Universal Representations',
    keywords: ['FLEURS', 'Few-Shot Speech Evaluation', 'Universal Speech Representations', '102 Languages', 'Speech Benchmark', 'SLT / Interspeech']
  },
  'DB-006': {
    domain: 'Speech Processing / Crowdsourced Audio / Massively Multilingual Speech Corpus',
    keywords: ['Common Voice', 'Mozilla Common Voice', 'Massively Multilingual Corpus', 'Crowdsourced Audio', 'Open Speech Dataset', 'LREC 2020']
  },
  'DB-007': {
    domain: 'Speech Processing / Multilingual ASR / Large-Scale Audiobook Corpus',
    keywords: ['MLS', 'Multilingual LibriSpeech', 'OpenSLR', 'Large-Scale Speech Corpus', 'ASR Benchmark', 'Audiobook Corpus']
  },
  'DB-008': {
    domain: 'Speech Processing / Multilingual Speech Pretraining / Parliamentary Interpretation',
    keywords: ['VoxPopuli', 'Multilingual Speech Pretraining', 'Semi-Supervised Learning', 'Simultaneous Interpretation', 'ACL 2021', 'European Parliament']
  },
  'DB-009': {
    domain: 'Speech Translation / Multilingual Speech Recognition / TEDx Corpus',
    keywords: ['Multilingual TEDx', 'mTEDx', 'Speech Recognition and Translation', 'OpenSLR', 'Interspeech 2021', 'Spoken Language Processing']
  },
  'DB-010': {
    domain: 'Speech-to-Speech Translation / Multilingual Benchmark / Synthetic Speech Corpus',
    keywords: ['CVSS Corpus', 'Speech-to-Speech Translation', 'Direct S2ST', 'Massively Multilingual S2ST', 'LREC 2022', 'Target Speech Synthesis']
  },
  'DB-011': {
    domain: 'Speech-to-Speech Translation / Mined Parallel Speech / Multilingual Corpus',
    keywords: ['SpeechMatrix', 'Mined Speech-to-Speech', 'Multilingual S2ST Corpus', 'Direct S2ST Benchmark', 'ACL 2023', 'Speech Alignment']
  },
  'DB-012': {
    domain: 'Speech Translation / Indic Languages / Low-Resource Speech-to-Text',
    keywords: ['Indic-TEDST', 'Indic Languages', 'Low-Resource Speech Translation', 'South Asian Languages', 'LREC-COLING 2024', 'Speech-to-Text Benchmark']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Datasets & Benchmarks',
    keywords: ['Speech Translation', 'Benchmark Dataset']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('priority') || rawStatus.includes('start here')) statusVal = 'in_progress';
  else statusVal = 'unread';

  // Check title match against existing DB papers in cluster 147
  let matchedDbPaper = dbPapers.find(p => titlesMatch(exTitle, p.title));
  let paperId;

  if (matchedDbPaper) {
    paperId = matchedDbPaper.id;
    console.log(`\nMatched existing DB paper ID ${paperId} in cluster 147 for [${paperCode}] "${exTitle}"`);
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
    // Insert new paper into DB for Cluster 147
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
    console.log(`\nInserted NEW DB paper ID ${paperId} into cluster 147 for [${paperCode}] "${exTitle}"`);
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
