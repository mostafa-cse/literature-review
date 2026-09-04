const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/mostafakamal/Downloads/Simultaneous_Real_Time_Translation_Literature_Matrix.xlsx');
console.log('Sheet names:', wb.SheetNames);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
console.log(`Sheet 1 "${wb.SheetNames[0]}" has ${rows.length} rows`);

rows.forEach((r, idx) => {
  console.log(`\n================== ROW ${idx + 1}: ${r['Paper ID']} ==================`);
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
});
