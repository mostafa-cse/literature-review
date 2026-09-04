const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/mostafakamal/Downloads/Speech_to_Speech_Translation_Literature_Matrix.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

rows.forEach((r, idx) => {
  console.log(`\n================== ROW ${idx + 1}: ${r['Paper ID']} ==================`);
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
});
