const path = require('path');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const papers = db.prepare('SELECT * FROM papers WHERE cluster_id = 143').all();
console.log(`Papers in cluster 143 (Total ${papers.length}):`);
papers.forEach(p => {
  const vals = db.prepare(`
    SELECT dc.column_name, pcv.value
    FROM paper_column_values pcv
    JOIN dynamic_columns dc ON dc.id = pcv.column_id
    WHERE pcv.paper_id = ?
  `).all(p.id);
  console.log(`\n- [Paper ID ${p.id}] "${p.title}"`);
  console.log(`  Domain: "${p.domain}"`);
  console.log(`  Total column values populated: ${vals.length}`);
  if (vals.length > 0) {
    console.log(`  Sample values:`, vals.slice(0, 3));
  }
});
