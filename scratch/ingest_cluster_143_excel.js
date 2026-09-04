const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Speech_to_Speech_Translation_Literature_Matrix.xlsx';
const CLUSTER_ID = 143;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Loaded ${excelRows.length} rows from Excel sheet '${wb.SheetNames[0]}'`);

// 2. Fetch existing papers for cluster 143
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
    else {
      for (const w2 of words2) {
        if (w.startsWith(w2) || w2.startsWith(w)) {
          common += 0.9;
          break;
        }
      }
    }
  }
  const similarity = common / Math.max(words1.size, words2.size);
  return similarity >= 0.65;
}

// 3. Define all 25 dynamic columns to register in cluster 143
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

// 4. Curated domains & keywords mapping per Paper ID for robust search & filtering
const CURATED_METADATA = {
  'S2ST-001': {
    domain: 'Speech-to-Speech Translation; Direct S2ST; Neural Machine Translation',
    keywords: ['Direct S2ST', 'Speech-to-Speech Translation', 'Neural Machine Translation', 'Discrete Speech Units', 'Simultaneous S2ST', 'Latency Optimization', 'LLM-Based S2ST', 'Cascaded vs Direct', 'Self-Supervised Learning', 'Speech Processing']
  },
  'S2ST-002': {
    domain: 'Speech-to-Speech Translation; End-to-End ST; Speech Processing',
    keywords: ['Direct Speech to Speech Translation', 'End-to-End S2ST', 'ASR-MT-TTS Cascade', 'Speech Processing', 'Neural Machine Translation', 'Speech Translation Review', 'Direct S2ST', 'Acoustic Modeling']
  },
  'S2ST-003': {
    domain: 'Speech-to-Speech Translation; Translatotron; Voice Preservation',
    keywords: ['Translatotron', 'Translatotron 2', 'Translatotron 3', 'Direct S2ST', 'Speech-to-Speech Translation', 'Voice Preservation', 'Unsupervised S2ST', 'Spectrogram Generation', 'Discrete Units']
  },
  'S2ST-004': {
    domain: 'Speech Translation; End-to-End ST; Natural Language Processing',
    keywords: ['End-to-End Speech Translation', 'Speech Translation', 'Cascaded vs Direct', 'Tight Coupling', 'Transfer Learning', 'Data Scarcity', 'Speech Processing', 'NLP']
  },
  'S2ST-005': {
    domain: 'Speech Translation; End-to-End ST; Transfer Learning',
    keywords: ['End-to-End Speech Translation', 'Speech Translation Tutorial', 'Encoder-Decoder ST', 'Multilingual ST', 'Transfer Learning', 'Pretrained Speech Models', 'Speech Processing']
  },
  'S2ST-006': {
    domain: 'Multilingual & Multimodal Speech Translation; Speech Processing',
    keywords: ['Multilingual Speech Translation', 'Multimodal ST', 'Speech-to-Speech Translation', 'Speech Foundation Models', 'Recent Advances', 'IWSLT', 'Speech Processing']
  },
  'S2ST-007': {
    domain: 'Multilingual Multimodal AI; Speech-to-Speech Translation; Foundation Models',
    keywords: ['SeamlessM4T', 'Massively Multilingual', 'Multimodal Machine Translation', 'Speech-to-Speech Translation', 'SeamlessAlign', 'FLEURS', 'UnitY', 'Direct S2ST', 'Speech Foundation Models']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Speech-to-Speech Translation',
    keywords: ['Speech-to-Speech Translation', 'Direct S2ST']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('study') || rawStatus.includes('focus') || rawStatus.includes('core paper')) statusVal = 'in_progress';
  else if (rawStatus.includes('to read') || rawStatus === 'unread' || rawStatus.includes('not started')) statusVal = 'unread';

  // Check title match against existing DB papers in cluster 143
  let matchedDbPaper = dbPapers.find(p => titlesMatch(exTitle, p.title));
  let paperId;

  if (matchedDbPaper) {
    paperId = matchedDbPaper.id;
    console.log(`\nMatched existing DB paper ID ${paperId} for [${paperCode}] "${exTitle}"`);
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
    // Insert missing paper into DB for Cluster 143
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
    console.log(`\nInserted NEW DB paper ID ${paperId} for [${paperCode}] "${exTitle}"`);
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
