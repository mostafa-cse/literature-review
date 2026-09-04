const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Simultaneous_Real_Time_Translation_Literature_Matrix.xlsx';
const PROJECT_ID = 10;
const CLUSTER_ID = 144;

const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

const allProjPapers = db.prepare('SELECT id, cluster_id, title FROM papers WHERE project_id = ?').all(PROJECT_ID);

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

excelRows.forEach((r, idx) => {
  const exTitle = r['Paper Title'];
  const matched = allProjPapers.find(p => titlesMatch(exTitle, p.title));
  if (matched) {
    console.log(`[Row ${idx + 1}: ${r['Paper ID']}] MATCHED in DB ID ${matched.id} (Cluster ${matched.cluster_id}): "${matched.title}"`);
  } else {
    console.log(`[Row ${idx + 1}: ${r['Paper ID']}] NOT FOUND in DB (Will be created in Cluster 144): "${exTitle}"`);
  }
});
