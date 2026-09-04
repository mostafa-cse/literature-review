const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const EXCEL_PATH = '/Users/mostafakamal/Downloads/Simultaneous_Real_Time_Translation_Literature_Matrix.xlsx';
const CLUSTER_ID = 144;
const PROJECT_ID = 10;

try {
  const wb = xlsx.readFile(EXCEL_PATH);
  console.log('Sheet Names:', wb.SheetNames);

  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`\n=== Sheet: "${sheetName}" (Total rows: ${rows.length}) ===`);
    if (rows.length > 0) {
      console.log('Columns:', Object.keys(rows[0]));
      rows.forEach((r, idx) => {
        console.log(`\n[Row ${idx + 1}] ID: "${r['Paper ID']}" | Title: "${r['Paper Title']}"`);
        console.log(`  Domain: "${r['Domain']}"`);
        console.log(`  Year: "${r['Publish Year']}" | Authors: "${r['Authors']}"`);
        console.log(`  Survey Type: "${r['Survey Type']}"`);
        console.log(`  Research Area: "${r['Research Area']}"`);
      });
    }
  });

  console.log('\n=== Database State for Cluster 144 ===');
  const cluster = db.prepare('SELECT * FROM clusters WHERE id = ?').get(CLUSTER_ID);
  console.log('Cluster 144 info:', cluster);

  const papersIn144 = db.prepare('SELECT id, title, domain, authors, year, doi, status FROM papers WHERE project_id = ? AND cluster_id = ?').all(PROJECT_ID, CLUSTER_ID);
  console.log(`\nPapers currently in Cluster 144 (Total ${papersIn144.length}):`);
  papersIn144.forEach(p => {
    console.log(`- ID ${p.id}: "${p.title}" | domain: "${p.domain}" | status: "${p.status}"`);
  });

  const colsIn144 = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = ?').all(CLUSTER_ID);
  console.log(`\nDynamic columns in Cluster 144 (Total ${colsIn144.length}):`);
  colsIn144.forEach(c => console.log(`- ID ${c.id}: "${c.column_name}"`));

} catch (err) {
  console.error('Error:', err);
}
