const path = require('path');
const xlsx = require('/Users/mostafakamal/Documents/Final Year Project/ Literature Review/node_modules/xlsx');
const { getDb } = require('/Users/mostafakamal/Documents/Final Year Project/ Literature Review/Backend/src/db');
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Speech_Recognition_Literature_Matrix.xlsx';
const CLUSTER_ID = 141;
const PROJECT_ID = 10;

console.log(`=== STARTING INGESTION FOR CLUSTER ${CLUSTER_ID} (PROJECT ${PROJECT_ID}) ===`);

// 1. Read Excel file
const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets['Speech Recognition'];
const excelRows = xlsx.utils.sheet_to_json(sheet);
console.log(`Loaded ${excelRows.length} rows from Excel sheet 'Speech Recognition'`);

// 2. Fetch existing papers for cluster 141
const dbPapers = db.prepare('SELECT * FROM papers WHERE project_id = ? AND cluster_id = ?').all(PROJECT_ID, CLUSTER_ID);
console.log(`Found ${dbPapers.length} papers in DB for Project ${PROJECT_ID}, Cluster ${CLUSTER_ID}`);

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
  return similarity >= 0.7;
}

// 3. Define all 25 dynamic columns to register in cluster 141
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
  'SR-013': {
    domain: 'Artificial Intelligence / Speech Processing / Multilingual ASR',
    keywords: ['Multilingual ASR', 'Cross-Lingual Transfer', 'Low-Resource Speech', 'Self-Supervised Learning', 'BABEL', 'Common Voice', 'WER', 'Speech Processing']
  },
  'SR-014': {
    domain: 'Artificial Intelligence / Speech Processing / End-to-End ASR',
    keywords: ['End-to-End ASR', 'CTC', 'RNN-T', 'Attention Encoder-Decoder', 'External LM Integration', 'LibriSpeech', 'WER', 'Speech Recognition']
  },
  'SR-015': {
    domain: 'Speech Processing / Representation Learning',
    keywords: ['Self-Supervised Learning', 'Speech Representation', 'Masked Prediction', 'Contrastive Learning', 'Predictive SSL', 'Speech Processing', 'Representation Learning']
  },
  'SR-016': {
    domain: 'Speech Recognition / Multilingual AI',
    keywords: ['Whisper', 'Weak Supervision', 'Multilingual ASR', 'Zero-Shot Transfer', 'Robustness', 'Large-Scale Pretraining', 'Speech Recognition']
  },
  'SR-017': {
    domain: 'Speech Processing / Multilingual ASR',
    keywords: ['XLS-R', 'wav2vec 2.0', 'Cross-Lingual Transfer', 'Low-Resource ASR', 'Speech Translation', 'CoVoST-2', 'VoxPopuli', 'Multilingual Speech']
  },
  'SR-018': {
    domain: 'Multilingual Speech Technology / ASR',
    keywords: ['Massively Multilingual Speech', 'MMS', 'wav2vec 2.0', 'FLEURS', '1000+ Languages', 'Low-Resource Speech', 'Multilingual Speech Technology']
  },
  'SR-019': {
    domain: 'Speech Processing / Self-Supervised Learning',
    keywords: ['wav2vec 2.0', 'Self-Supervised Learning', 'Contrastive Predictive Coding', 'Quantized Latent Targets', 'LibriSpeech', 'Low-Label ASR', 'Speech Representation']
  },
  'SR-020': {
    domain: 'Speech Processing / End-to-End ASR',
    keywords: ['Conformer', 'Transformer', 'Convolution', 'Macaron Feed-Forward', 'LibriSpeech', 'End-to-End ASR', 'Speech Recognition']
  },
  'SR-021': {
    domain: 'Bangla Speech Processing / ASR / Language Resources',
    keywords: ['Bengali Speech', 'Common Voice Bengali', 'OpenSLR', 'Bangla ASR', 'Crowdsourcing', 'Speech Dataset', 'Phoneme Diversity', 'Language Resources']
  },
  'SR-022': {
    domain: 'Bangla NLP / Speech Recognition',
    keywords: ['Bangla Speech Recognition', 'Bangla Dialects', 'Regional Dialects', 'Bangla NLP', 'DNN', 'MFCC', 'CNN-RNN', 'OpenSLR']
  }
};

// 5. Ingestion loop: Match or Insert paper, update base columns, dynamic columns, and keywords
let processedCount = 0;

for (let i = 0; i < excelRows.length; i++) {
  const row = excelRows[i];
  const exTitle = (row['Paper Title'] || '').trim();
  const paperCode = (row['Paper ID'] || '').trim();
  const meta = CURATED_METADATA[paperCode] || {
    domain: row['Domain'] || 'Speech Processing / ASR',
    keywords: ['Speech Recognition', 'ASR']
  };

  // Determine reading status
  let statusVal = 'unread';
  const rawStatus = (row['Reading Status'] || '').trim().toLowerCase();
  if (rawStatus.startsWith('read') || rawStatus === 'read') statusVal = 'read';
  else if (rawStatus.includes('progress') || rawStatus.includes('study') || rawStatus.includes('focus') || rawStatus.includes('core paper')) statusVal = 'in_progress';
  else if (rawStatus.includes('to read') || rawStatus === 'unread' || rawStatus.includes('not started')) statusVal = 'unread';

  // Check title match against existing DB papers in cluster 141
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
      parseInt(row['Publish Year'], 10) || matchedDbPaper.year,
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
    // Insert missing paper into DB for Cluster 141
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
checkPapers.forEach(p => console.log(` - ID ${p.id} | ${p.title.slice(0, 50)}... | Domain: ${p.domain} | Status: ${p.status}`));

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
