const path = require('path');
const xlsx = require('xlsx');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));

const filePath = '/Users/mostafakamal/Downloads/Speech_to_Speech_Translation_Literature_Matrix.xlsx';

try {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0]; // 'Speech-to-Speech Translation'
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`=== Excel Sheet: "${sheetName}" ===`);
  console.log(`Total data rows: ${rows.length}`);
  if (rows.length > 0) {
    console.log('Columns in Excel:', Object.keys(rows[0]));
    console.log('\nPapers in Excel:');
    rows.forEach((r, idx) => {
      console.log(`\n[Row ${idx + 1}] ID: "${r['Paper ID']}" | Title: "${r['Paper Title']}"`);
      console.log(`  Domain: "${r['Domain']}"`);
      console.log(`  Authors: "${r['Authors']}"`);
      console.log(`  Year: "${r['Publish Year']}" | DOI: "${r['DOI / Link']}"`);
      console.log(`  Survey Type: "${r['Survey Type']}"`);
      console.log(`  Research Area: "${r['Research Area']}"`);
    });
  }

  const db = getDb();
  console.log('\n=== Database: Cluster 143 & Project 10 ===');
  const cluster = db.prepare('SELECT * FROM clusters WHERE id = 143').get();
  console.log('Cluster 143:', cluster);

  const clustersInProj10 = db.prepare('SELECT * FROM clusters WHERE project_id = 10').all();
  console.log('\nAll Clusters in Project 10:', clustersInProj10);

  const papersInProj10 = db.prepare('SELECT id, title, cluster_id, domain, keywords, authors, year, doi, status FROM papers WHERE project_id = 10').all();
  console.log(`\nPapers in Project 10 (Total ${papersInProj10.length}):`);
  papersInProj10.forEach(p => {
    console.log(`- ID ${p.id} (cluster ${p.cluster_id}): "${p.title}" | domain: "${p.domain}" | keywords: ${JSON.stringify(p.keywords)}`);
  });

  const colsInCluster143 = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = 143 OR project_id = 10').all();
  console.log(`\nDynamic columns for Project 10 / Cluster 143 (Total ${colsInCluster143.length}):`);
  colsInCluster143.forEach(c => {
    console.log(`- ID ${c.id} (cluster ${c.cluster_id}, project ${c.project_id}): "${c.column_name || c.name}"`);
  });

} catch (err) {
  console.error('Error:', err);
}
