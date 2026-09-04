const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/mostafakamal/Downloads/Multilingual_Low_Resource_Translation_Literature_Matrix.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log('Total raw rows:', raw.length);
console.log('Row 0:', raw[0]);
console.log('\nRow 1 (Column Headers):', raw[1]);
console.log('\nRow 2 (First Data Row):', raw[2]);
console.log('\nRow 16 (Last Data Row):', raw[16]);
