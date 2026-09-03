const { generateToken } = require('./Backend/src/utils/auth');
console.log(generateToken({ id: 1, email: 'admin@admin.com', role: 'admin', status: 'active' }));
