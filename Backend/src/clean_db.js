const fs = require('fs');
const path = require('path');
const { initDb, getDb, hashPassword } = require('./db');

function cleanDatabase() {
  console.log('🧹 [LitSphere DB Clean] Starting standard database reset with seed accounts...');
  initDb();
  const db = getDb();

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  try {
    // 1. Clear research data
    db.exec(`
      DELETE FROM paper_column_values;
      DELETE FROM dynamic_columns;
      DELETE FROM keywords;
      DELETE FROM paper_screening;
      DELETE FROM paper_comments;
      DELETE FROM papers;
      DELETE FROM clusters;
      DELETE FROM project_members;
      DELETE FROM projects;
      DELETE FROM audit_logs;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);

    // 2. Seed Fresh Standard Accounts
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, name, email, password_hash, role, institution, status, ai_token_quota, ai_tokens_used, storage_quota_mb, storage_used_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const adminHash = hashPassword('admin123');
    const researcherHash = hashPassword('researcher123');
    const coauthorHash = hashPassword('coauthor123');
    const advisorHash = hashPassword('advisor123');

    insertUser.run(1, 'admin', 'System Administrator', 'admin@litsphere.ac', adminHash, 'admin', 'LitSphere Academic Engineering', 'active', 500000, 0, 2048, 0.0);
    insertUser.run(2, 'researcher', 'Lead Researcher', 'researcher@litsphere.ac', researcherHash, 'user', 'Academic Research Institute', 'active', 100000, 0, 500, 0.0);
    insertUser.run(3, 'coauthor', 'Dr. Sarah Chen (Co-Author)', 'coauthor@litsphere.ac', coauthorHash, 'user', 'AI & Machine Learning Lab', 'active', 120000, 0, 800, 0.0);
    insertUser.run(4, 'advisor', 'Prof. Robert Vance (Advisor)', 'advisor@litsphere.ac', advisorHash, 'supervisor', 'Graduate Faculty of Engineering', 'active', 300000, 0, 2000, 0.0);

    // 3. Ensure System Settings are clean
    db.exec(`
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('maintenance_mode', 'false');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('maintenance_message', 'LitSphere Platform is currently undergoing scheduled maintenance.');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('allow_registration', 'true');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('default_user_quota', '100000');
    `);

    db.exec('COMMIT;');
    db.exec('PRAGMA foreign_keys = ON;');

    console.log('✅ [LitSphere DB Clean] Database reset with 4 standard seed accounts and 0 surveys.');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    console.error('❌ Database clean failed:', err);
    throw err;
  }
}

function wipeAllUsersAndData() {
  console.log('🧹 [LitSphere DB Wipe] Starting complete wipe (0 users, 0 surveys)...');
  initDb();
  const db = getDb();

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  try {
    db.exec(`
      DELETE FROM paper_column_values;
      DELETE FROM dynamic_columns;
      DELETE FROM keywords;
      DELETE FROM paper_screening;
      DELETE FROM paper_comments;
      DELETE FROM papers;
      DELETE FROM clusters;
      DELETE FROM project_members;
      DELETE FROM projects;
      DELETE FROM audit_logs;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);

    // Ensure System Settings are clean and registration is open
    db.exec(`
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('maintenance_mode', 'false');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('maintenance_message', 'LitSphere Platform is currently undergoing scheduled maintenance.');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('allow_registration', 'true');
      INSERT OR REPLACE INTO system_settings (key, value) VALUES ('default_user_quota', '100000');
    `);

    db.exec('COMMIT;');
    db.exec('PRAGMA foreign_keys = ON;');

    console.log('✅ [LitSphere DB Wipe] Database is now 100% completely empty!');
    console.log('👤 Users: 0 (Ready for you to create your own account)');
    console.log('📁 Projects/Surveys: 0 (Ready for fresh creation)');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    console.error('❌ Database wipe failed:', err);
    throw err;
  }
}

module.exports = { cleanDatabase, wipeAllUsersAndData };

if (require.main === module) {
  wipeAllUsersAndData();
}
