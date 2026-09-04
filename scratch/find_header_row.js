const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/mostafakamal/Downloads/Multilingual_Low_Resource_Translation_Literature_Matrix.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });

raw.forEach((r, idx) => {
  console.log(`[Row ${idx}] length: ${r.length}, first cell: "${r[0]}"`);
  if (r.length > 5) {
    console.log(`  Row ${idx} sample: [${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}]`);
  }
});
