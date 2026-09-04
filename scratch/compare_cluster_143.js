const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Speech_to_Speech_Translation_Literature_Matrix.xlsx';
const CLUSTER_ID = 143;
const PROJECT_ID = 10;

console.log('--- ALL PAPERS IN PROJECT 10 ---');
const allPapersInP10 = db.prepare('SELECT id, cluster_id, title, domain, authors, year FROM papers WHERE project_id = ?').all(PROJECT_ID);
console.log(`Total papers in Project 10: ${allPapersInP10.length}`);
allPapersInP10.forEach(p => {
  console.log(`[ID ${p.id}] Cluster: ${p.cluster_id} | Title: "${p.title}" | Domain: "${p.domain}"`);
});

console.log('\n--- PAPERS IN EXCEL FILE ---');
const wb = xlsx.readFile(EXCEL_PATH);
const sheet = wb.Sheets[wb.SheetNames[0]];
const excelRows = xlsx.utils.sheet_to_json(sheet);
excelRows.forEach((r, i) => {
  console.log(`\n[Excel ${i + 1}] ID: ${r['Paper ID']} | Title: "${r['Paper Title']}"`);
  console.log(`  Domain: "${r['Domain']}"`);
  console.log(`  Research Area: "${r['Research Area']}"`);
  console.log(`  Survey Type: "${r['Survey Type']}"`);
  console.log(`  Models: "${r['Models / Systems Identified']}"`);
  console.log(`  Datasets: "${r['Datasets Identified']}"`);
  console.log(`  Approaches: "${r['Approaches / Methods Identified']}"`);
  console.log(`  Status: "${r['Reading Status']}"`);
});
