const path = require('path');
const { getDb } = require(path.join(__dirname, '../Backend/src/db'));
const db = getDb();

const cols = db.prepare('SELECT * FROM dynamic_columns WHERE cluster_id = 143').all();
console.log('Dynamic columns in cluster 143:', cols);
