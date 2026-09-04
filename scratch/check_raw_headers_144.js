const xlsx = require('xlsx');
const wb = xlsx.readFile('/Users/mostafakamal/Downloads/Simultaneous_Real_Time_Translation_Literature_Matrix.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log('Raw Row 0 (Headers):', rawData[0]);
console.log('\nRaw Row 1:', rawData[1]);
console.log('\nRaw Row 12:', rawData[12]);
