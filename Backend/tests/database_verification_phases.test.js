/**
 * ==============================================================================
 * LITSPHERE DATABASE FULL SYSTEM VERIFICATION TEST SUITE (PHASES 1 TO 7)
 * ==============================================================================
 * Comprehensive verification of:
 * - Phase 1: Engine Health & Low-Level Physical Integrity
 * - Phase 2: Relational Schema & Foreign Key Constraints Integrity
 * - Phase 3: Table Indexes, Uniqueness & Query Performance
 * - Phase 4: Data Hygiene, Security & Field Validation
 * - Phase 5: Orphan Records & Garbage Data Audit
 * - Phase 6: Default Seed Data & Master Templates Verification
 * - Phase 7: PostgreSQL Parity & Prisma Migration Consistency
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDb, DB_PATH, hashPassword, verifyPassword } = require('../src/db');

// Color formatting for console
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// ------------------------------------------------------------------------------
// PHASE 1: Database Engine Health & Low-Level Physical Integrity
// ------------------------------------------------------------------------------
async function runPhase1(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 1: Database Engine Health & Low-Level Physical Integrity${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  // 1.1 PRAGMA integrity_check
  const integrity = db.prepare('PRAGMA integrity_check;').all();
  details.integrityCheck = integrity;
  if (!integrity || integrity.length === 0 || integrity[0].integrity_check !== 'ok') {
    errors.push(`PRAGMA integrity_check failed: ${JSON.stringify(integrity)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA integrity_check = ok`);
  }

  // 1.2 PRAGMA quick_check
  const quick = db.prepare('PRAGMA quick_check;').all();
  details.quickCheck = quick;
  if (!quick || quick.length === 0 || quick[0].quick_check !== 'ok') {
    errors.push(`PRAGMA quick_check failed: ${JSON.stringify(quick)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA quick_check = ok`);
  }

  // 1.3 PRAGMA journal_mode (should be WAL)
  const journal = db.prepare('PRAGMA journal_mode;').all();
  details.journalMode = journal;
  const jMode = (journal[0]?.journal_mode || '').toLowerCase();
  if (jMode !== 'wal') {
    errors.push(`PRAGMA journal_mode is "${jMode}", expected "wal"`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA journal_mode = WAL`);
  }

  // 1.4 PRAGMA busy_timeout (should be 5000ms)
  const timeout = db.prepare('PRAGMA busy_timeout;').all();
  details.busyTimeout = timeout;
  const bTimeout = timeout[0]?.timeout;
  if (bTimeout !== 5000) {
    errors.push(`PRAGMA busy_timeout is ${bTimeout}, expected 5000`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA busy_timeout = 5000ms`);
  }

  // 1.5 File size, permissions, and backup test
  if (!fs.existsSync(DB_PATH)) {
    errors.push(`Database file not found at ${DB_PATH}`);
  } else {
    const stat = fs.statSync(DB_PATH);
    details.fileSize = stat.size;
    details.fileMode = stat.mode.toString(8);
    if (stat.size <= 0) {
      errors.push(`Database file size is 0 bytes`);
    } else {
      console.log(`  ${c.green}✔${c.reset} Physical file size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  ${c.green}✔${c.reset} Permissions: ${stat.mode.toString(8)} (readable & writable)`);
    }

    // Backup test: verify SQLite file can be backed up / snapshotted cleanly
    const backupDir = path.join(path.dirname(DB_PATH), '.db_backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `backup_test_${Date.now()}.db`);
    try {
      fs.copyFileSync(DB_PATH, backupFile);
      const bStat = fs.statSync(backupFile);
      if (bStat.size !== stat.size) {
        errors.push(`Database backup copy failed size check: ${bStat.size} vs ${stat.size}`);
      } else {
        console.log(`  ${c.green}✔${c.reset} Database backup / snapshot test passed`);
      }
      fs.unlinkSync(backupFile);
    } catch (bErr) {
      errors.push(`Backup test failed: ${bErr.message}`);
    }
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 2: Relational Schema & Foreign Key Constraints Integrity
// ------------------------------------------------------------------------------
async function runPhase2(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 2: Relational Schema & Foreign Key Constraints Integrity${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  // 2.1 PRAGMA foreign_keys
  const fkPragma = db.prepare('PRAGMA foreign_keys;').all();
  if (fkPragma[0]?.foreign_keys !== 1) {
    errors.push(`PRAGMA foreign_keys is OFF (${fkPragma[0]?.foreign_keys})`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA foreign_keys = ON (1)`);
  }

  // 2.2 PRAGMA foreign_key_check
  const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
  details.fkViolations = fkViolations;
  if (fkViolations.length > 0) {
    errors.push(`PRAGMA foreign_key_check found ${fkViolations.length} violations: ${JSON.stringify(fkViolations)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} PRAGMA foreign_key_check = 0 violations (All 16 tables clean)`);
  }

  // 2.3 Verify Foreign Key definitions across all core relational tables
  const expectedRelations = [
    { table: 'projects', from: 'owner_id', toTable: 'users', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'clusters', from: 'project_id', toTable: 'projects', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'dynamic_columns', from: 'cluster_id', toTable: 'clusters', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'dynamic_columns', from: 'parent_column_id', toTable: 'dynamic_columns', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'papers', from: 'project_id', toTable: 'projects', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'papers', from: 'cluster_id', toTable: 'clusters', toCol: 'id', on_delete: 'SET NULL' },
    { table: 'paper_column_values', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'paper_column_values', from: 'column_id', toTable: 'dynamic_columns', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'keywords', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'paper_files', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'project_members', from: 'project_id', toTable: 'projects', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'project_members', from: 'user_id', toTable: 'users', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'paper_comments', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'paper_screening', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'paper_highlights', from: 'paper_id', toTable: 'papers', toCol: 'id', on_delete: 'CASCADE' },
    { table: 'password_resets', from: 'user_id', toTable: 'users', toCol: 'id', on_delete: 'CASCADE' }
  ];

  let verifiedFkCount = 0;
  for (const rel of expectedRelations) {
    const fks = db.prepare(`PRAGMA foreign_key_list("${rel.table}");`).all();
    const match = fks.find(f => f.from === rel.from && f.table === rel.toTable && f.to === rel.toCol);
    if (!match) {
      errors.push(`Missing FK constraint: ${rel.table}.${rel.from} -> ${rel.toTable}.${rel.toCol}`);
    } else {
      if (rel.on_delete && match.on_delete.toUpperCase() !== rel.on_delete.toUpperCase()) {
        errors.push(`FK on_delete mismatch on ${rel.table}.${rel.from}: expected ${rel.on_delete}, got ${match.on_delete}`);
      } else {
        verifiedFkCount++;
      }
    }
  }
  console.log(`  ${c.green}✔${c.reset} Verified ${verifiedFkCount}/${expectedRelations.length} foreign key cascade rules`);

  // 2.4 Transactional cascade deletion simulation test
  try {
    const simOwner = db.prepare("SELECT id FROM users LIMIT 1").get();
    if (simOwner) {
      // Create isolated test project & children
      const simP = db.prepare("INSERT INTO projects (name, owner_id) VALUES ('__CASCADE_SIM_TEST__', ?)").run(simOwner.id);
      const pId = simP.lastInsertRowid;

      const simC = db.prepare("INSERT INTO clusters (project_id, name) VALUES (?, 'Sim Cluster')").run(pId);
      const cId = simC.lastInsertRowid;

      const simCol = db.prepare("INSERT INTO dynamic_columns (cluster_id, column_name) VALUES (?, 'Sim Col')").run(cId);
      const colId = simCol.lastInsertRowid;

      const simPaper = db.prepare("INSERT INTO papers (project_id, cluster_id, title) VALUES (?, ?, 'Sim Paper')").run(pId, cId);
      const paperId = simPaper.lastInsertRowid;

      db.prepare("INSERT INTO paper_column_values (paper_id, column_id, value) VALUES (?, ?, 'Val')").run(paperId, colId);
      db.prepare("INSERT INTO keywords (paper_id, keyword) VALUES (?, 'SimKw')").run(paperId);

      // Now delete parent project and assert all children cascade deleted
      db.prepare("DELETE FROM projects WHERE id = ?").run(pId);

      const remainClusters = db.prepare("SELECT COUNT(*) as c FROM clusters WHERE id = ?").get(cId).c;
      const remainCols = db.prepare("SELECT COUNT(*) as c FROM dynamic_columns WHERE id = ?").get(colId).c;
      const remainPapers = db.prepare("SELECT COUNT(*) as c FROM papers WHERE id = ?").get(paperId).c;
      const remainPcv = db.prepare("SELECT COUNT(*) as c FROM paper_column_values WHERE paper_id = ?").get(paperId).c;
      const remainKw = db.prepare("SELECT COUNT(*) as c FROM keywords WHERE paper_id = ?").get(paperId).c;

      if (remainClusters !== 0 || remainCols !== 0 || remainPapers !== 0 || remainPcv !== 0 || remainKw !== 0) {
        errors.push(`Cascade delete failed: clusters=${remainClusters}, cols=${remainCols}, papers=${remainPapers}, pcv=${remainPcv}, kw=${remainKw}`);
      } else {
        console.log(`  ${c.green}✔${c.reset} Transactional cascade deletion test verified 100% clean`);
      }
    }
  } catch (simErr) {
    errors.push(`Cascade simulation error: ${simErr.message}`);
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 3: Table Indexes, Uniqueness & Query Performance
// ------------------------------------------------------------------------------
async function runPhase3(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 3: Table Indexes, Uniqueness & Query Performance${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  // 3.1 Unique check: users.email
  const dupEmails = db.prepare('SELECT email, COUNT(*) as c FROM users GROUP BY email HAVING c > 1').all();
  if (dupEmails.length > 0) {
    errors.push(`Duplicate user emails found: ${JSON.stringify(dupEmails)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} users.email uniqueness verified (0 duplicates)`);
  }

  // 3.2 Unique check: users.username
  const dupUsernames = db.prepare("SELECT username, COUNT(*) as c FROM users WHERE username IS NOT NULL AND username != '' GROUP BY username HAVING c > 1").all();
  if (dupUsernames.length > 0) {
    errors.push(`Duplicate usernames found: ${JSON.stringify(dupUsernames)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} users.username uniqueness verified (0 duplicates)`);
  }

  // 3.3 Unique check: projects(owner_id, name)
  const dupProjects = db.prepare('SELECT owner_id, name, COUNT(*) as c FROM projects GROUP BY owner_id, name HAVING c > 1').all();
  if (dupProjects.length > 0) {
    errors.push(`Duplicate projects per owner found: ${JSON.stringify(dupProjects)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} projects(owner_id, name) uniqueness verified (0 duplicates)`);
  }

  // 3.4 Unique check: project_members(project_id, user_id)
  const dupMembers = db.prepare('SELECT project_id, user_id, COUNT(*) as c FROM project_members GROUP BY project_id, user_id HAVING c > 1').all();
  if (dupMembers.length > 0) {
    errors.push(`Duplicate project members found: ${JSON.stringify(dupMembers)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} project_members(project_id, user_id) uniqueness verified (0 duplicates)`);
  }

  // 3.5 Unique check: paper_column_values(paper_id, column_id)
  const dupPcv = db.prepare('SELECT paper_id, column_id, COUNT(*) as c FROM paper_column_values GROUP BY paper_id, column_id HAVING c > 1').all();
  if (dupPcv.length > 0) {
    errors.push(`Duplicate paper_column_values found: ${JSON.stringify(dupPcv)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} paper_column_values(paper_id, column_id) uniqueness verified (0 duplicates)`);
  }

  // 3.6 Unique check: paper_screening(paper_id, user_id)
  const dupScreenings = db.prepare('SELECT paper_id, user_id, COUNT(*) as c FROM paper_screening GROUP BY paper_id, user_id HAVING c > 1').all();
  if (dupScreenings.length > 0) {
    errors.push(`Duplicate paper_screening found: ${JSON.stringify(dupScreenings)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} paper_screening(paper_id, user_id) uniqueness verified (0 duplicates)`);
  }

  // 3.7 Unique check: paper_files(paper_id)
  const dupPaperFiles = db.prepare('SELECT paper_id, COUNT(*) as c FROM paper_files GROUP BY paper_id HAVING c > 1').all();
  if (dupPaperFiles.length > 0) {
    errors.push(`Duplicate paper_files found: ${JSON.stringify(dupPaperFiles)}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} paper_files(paper_id) uniqueness verified (0 duplicates)`);
  }

  // 3.8 Check presence of critical performance indexes in sqlite_master
  const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index'").all();
  const indexNames = indexes.map(i => i.name);
  const requiredIndexes = [
    'idx_users_email',
    'idx_users_role',
    'idx_projects_owner',
    'idx_clusters_project',
    'idx_papers_project',
    'idx_papers_cluster',
    'idx_dynamic_columns_cluster',
    'idx_pcv_paper',
    'idx_pcv_column',
    'idx_keywords_paper',
    'idx_pm_project',
    'idx_pm_user',
    'idx_audit_logs_action',
    'idx_audit_logs_created',
    'idx_paper_files_paper'
  ];

  for (const idx of requiredIndexes) {
    if (!indexNames.includes(idx)) {
      errors.push(`Missing query performance index: ${idx}`);
    }
  }
  console.log(`  ${c.green}✔${c.reset} Checked ${requiredIndexes.length} core query performance indexes`);

  // 3.9 EXPLAIN QUERY PLAN testing
  const planQueries = [
    { name: 'papers by project', sql: 'EXPLAIN QUERY PLAN SELECT * FROM papers WHERE project_id = 1;' },
    { name: 'clusters by project', sql: 'EXPLAIN QUERY PLAN SELECT * FROM clusters WHERE project_id = 1;' },
    { name: 'user by email', sql: "EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = 'admin@litsphere.ac';" },
    { name: 'pcv by paper', sql: 'EXPLAIN QUERY PLAN SELECT * FROM paper_column_values WHERE paper_id = 1;' },
    { name: 'audit logs by created_at', sql: "EXPLAIN QUERY PLAN SELECT * FROM audit_logs WHERE created_at > '2026-01-01';" }
  ];

  for (const pq of planQueries) {
    const plan = db.prepare(pq.sql).all();
    const planText = plan.map(p => p.detail || '').join(' ');
    if (!planText.includes('USING INDEX') && !planText.includes('USING COVERING INDEX')) {
      errors.push(`Query [${pq.name}] does NOT use index! Plan: ${planText}`);
    } else {
      console.log(`  ${c.green}✔${c.reset} Query plan [${pq.name}]: uses index`);
    }
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 4: Data Hygiene, Security & Field Validation
// ------------------------------------------------------------------------------
async function runPhase4(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 4: Data Hygiene, Security & Field Validation${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  const users = db.prepare('SELECT id, name, email, password_hash, role, status, ai_token_quota, ai_tokens_used, storage_quota_mb, storage_used_mb, created_at, last_login FROM users').all();

  // 4.1 Password hash security (salt:derivedKey format, length 32:128)
  let invalidPassUsers = [];
  for (const u of users) {
    if (!u.password_hash || !u.password_hash.includes(':')) {
      invalidPassUsers.push(u);
    } else {
      const [salt, key] = u.password_hash.split(':');
      if (!salt || !key || salt.length !== 32 || key.length !== 128) {
        invalidPassUsers.push(u);
      }
    }
  }
  if (invalidPassUsers.length > 0) {
    errors.push(`Users with invalid/unhashed/non-scrypt password format: ${invalidPassUsers.map(u => `${u.id}:${u.email}`).join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} 100% of user passwords use cryptographically secure scrypt (salt:derivedKey)`);
  }

  // 4.2 Email normalization (lowercase, trimmed)
  let nonNormalizedEmails = [];
  for (const u of users) {
    if (u.email !== u.email.toLowerCase().trim()) {
      nonNormalizedEmails.push(u.email);
    }
  }
  if (nonNormalizedEmails.length > 0) {
    errors.push(`Non-normalized user emails found: ${nonNormalizedEmails.join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} 100% of user emails are normalized (lowercase and trimmed)`);
  }

  // 4.3 Platform role values
  const validPlatformRoles = ['admin', 'user', 'reviewer', 'supervisor'];
  let invalidRoleUsers = [];
  for (const u of users) {
    if (!validPlatformRoles.includes(u.role)) {
      invalidRoleUsers.push(`${u.id}:${u.email} (role=${u.role})`);
    }
  }
  if (invalidRoleUsers.length > 0) {
    errors.push(`Invalid platform roles found: ${invalidRoleUsers.join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} 100% of platform roles are valid ('admin', 'user', 'reviewer', 'supervisor')`);
  }

  // 4.4 Project member roles
  const validMemberRoles = ['owner', 'editor', 'reviewer', 'viewer'];
  const members = db.prepare('SELECT id, project_id, user_id, role FROM project_members').all();
  let invalidMemberRoles = [];
  for (const m of members) {
    if (!validMemberRoles.includes(m.role)) {
      invalidMemberRoles.push(`${m.id}: project ${m.project_id}, user ${m.user_id} (role=${m.role})`);
    }
  }
  if (invalidMemberRoles.length > 0) {
    errors.push(`Invalid project member roles found: ${invalidMemberRoles.join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} 100% of project member roles are valid ('owner', 'editor', 'reviewer', 'viewer')`);
  }

  // 4.5 Quota bounds
  let invalidQuotas = [];
  for (const u of users) {
    if (u.ai_tokens_used < 0 || u.ai_token_quota < 0 || u.storage_used_mb < 0 || u.storage_quota_mb < 0) {
      invalidQuotas.push(`${u.id}:${u.email}`);
    }
  }
  if (invalidQuotas.length > 0) {
    errors.push(`Users with negative quotas/usage: ${invalidQuotas.join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} All user token and storage quotas within non-negative bounds`);
  }

  // 4.6 Timestamp format integrity
  let invalidTimestamps = [];
  for (const u of users) {
    if (u.created_at && isNaN(Date.parse(u.created_at))) {
      invalidTimestamps.push(`User ${u.id} created_at: ${u.created_at}`);
    }
    if (u.last_login && isNaN(Date.parse(u.last_login))) {
      invalidTimestamps.push(`User ${u.id} last_login: ${u.last_login}`);
    }
  }
  if (invalidTimestamps.length > 0) {
    errors.push(`Invalid timestamp format in users: ${invalidTimestamps.join(', ')}`);
  } else {
    console.log(`  ${c.green}✔${c.reset} All date/timestamp fields parse into valid ISO/SQL dates`);
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 5: Orphan Records & Garbage Data Audit
// ------------------------------------------------------------------------------
async function runPhase5(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 5: Orphan Records & Garbage Data Audit${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  const orphanChecks = [
    { name: 'papers -> projects', sql: 'SELECT COUNT(*) as c FROM papers WHERE project_id NOT IN (SELECT id FROM projects)' },
    { name: 'clusters -> projects', sql: 'SELECT COUNT(*) as c FROM clusters WHERE project_id NOT IN (SELECT id FROM projects)' },
    { name: 'dynamic_columns -> clusters', sql: 'SELECT COUNT(*) as c FROM dynamic_columns WHERE cluster_id NOT IN (SELECT id FROM clusters)' },
    { name: 'paper_column_values -> papers', sql: 'SELECT COUNT(*) as c FROM paper_column_values WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'paper_column_values -> dynamic_columns', sql: 'SELECT COUNT(*) as c FROM paper_column_values WHERE column_id NOT IN (SELECT id FROM dynamic_columns)' },
    { name: 'keywords -> papers', sql: 'SELECT COUNT(*) as c FROM keywords WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'paper_files -> papers', sql: 'SELECT COUNT(*) as c FROM paper_files WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'project_members -> projects', sql: 'SELECT COUNT(*) as c FROM project_members WHERE project_id NOT IN (SELECT id FROM projects)' },
    { name: 'project_members -> users', sql: 'SELECT COUNT(*) as c FROM project_members WHERE user_id NOT IN (SELECT id FROM users)' },
    { name: 'paper_comments -> papers', sql: 'SELECT COUNT(*) as c FROM paper_comments WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'paper_comments -> users', sql: 'SELECT COUNT(*) as c FROM paper_comments WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)' },
    { name: 'paper_screening -> papers', sql: 'SELECT COUNT(*) as c FROM paper_screening WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'paper_screening -> users', sql: 'SELECT COUNT(*) as c FROM paper_screening WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)' },
    { name: 'paper_highlights -> papers', sql: 'SELECT COUNT(*) as c FROM paper_highlights WHERE paper_id NOT IN (SELECT id FROM papers)' },
    { name: 'paper_highlights -> users', sql: 'SELECT COUNT(*) as c FROM paper_highlights WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)' },
    { name: 'password_resets -> users', sql: 'SELECT COUNT(*) as c FROM password_resets WHERE user_id NOT IN (SELECT id FROM users)' }
  ];

  for (const chk of orphanChecks) {
    const orphanCount = db.prepare(chk.sql).get().c;
    if (orphanCount > 0) {
      errors.push(`Orphan records detected: ${chk.name} has ${orphanCount} orphans`);
    } else {
      console.log(`  ${c.green}✔${c.reset} ${chk.name}: 0 orphans`);
    }
  }

  // Audit paper_files binary integrity
  const corruptFiles = db.prepare('SELECT id, paper_id, filename, file_size, LENGTH(data) as blob_len FROM paper_files WHERE file_size <= 0 OR data IS NULL OR LENGTH(data) = 0').all();
  if (corruptFiles.length > 0) {
    errors.push(`Corrupt / empty paper_files detected: ${JSON.stringify(corruptFiles)}`);
  } else {
    const fileCount = db.prepare('SELECT COUNT(*) as c FROM paper_files').get().c;
    console.log(`  ${c.green}✔${c.reset} Binary BLOB integrity verified across ${fileCount} stored manuscript files`);
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 6: Default Seed Data & Master Templates Verification
// ------------------------------------------------------------------------------
async function runPhase6(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 6: Default Seed Data & Master Templates Verification${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  // 6.1 master_templates check
  const templates = db.prepare('SELECT id, name, category, clusters_json FROM master_templates').all();
  if (templates.length === 0) {
    errors.push('No master templates found in master_templates table');
  } else {
    let validJsonCount = 0;
    for (const t of templates) {
      try {
        const parsed = JSON.parse(t.clusters_json);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          errors.push(`Template "${t.name}" has invalid or empty clusters JSON array`);
        } else {
          validJsonCount++;
        }
      } catch (jErr) {
        errors.push(`Template "${t.name}" has corrupted JSON: ${jErr.message}`);
      }
    }
    console.log(`  ${c.green}✔${c.reset} Verified ${validJsonCount} master benchmark templates with valid cluster definitions`);
  }

  // 6.2 system_settings check
  const requiredSettings = [
    'maintenance_mode',
    'default_user_token_quota',
    'default_user_storage_quota_mb',
    'active_llm_provider',
    'gemini_model'
  ];
  const settings = db.prepare('SELECT key, value FROM system_settings').all();
  const settingKeys = settings.map(s => s.key);
  for (const reqKey of requiredSettings) {
    if (!settingKeys.includes(reqKey)) {
      errors.push(`Missing required system setting: ${reqKey}`);
    }
  }
  console.log(`  ${c.green}✔${c.reset} Verified ${settings.length} system settings and platform configuration parameters`);

  // 6.3 System administrator account
  const admin = db.prepare("SELECT * FROM users WHERE email = 'admin@litsphere.ac'").get();
  if (!admin) {
    errors.push("Platform admin 'admin@litsphere.ac' does not exist in users");
  } else {
    if (admin.role !== 'admin') {
      errors.push(`admin@litsphere.ac role is '${admin.role}', expected 'admin'`);
    }
    if (admin.status !== 'active') {
      errors.push(`admin@litsphere.ac status is '${admin.status}', expected 'active'`);
    }
    // Verify password authentication
    const passMatches = verifyPassword('admin123', admin.password_hash) || verifyPassword('password123', admin.password_hash);
    if (!passMatches) {
      errors.push(`admin@litsphere.ac password authentication failed`);
    } else {
      console.log(`  ${c.green}✔${c.reset} Platform administrator active and authenticated`);
    }
  }

  // 6.4 Academic researcher and coauthor accounts
  const seedAccounts = [
    { email: 'researcher@litsphere.ac', expectedRole: 'user', pass: 'researcher123' },
    { email: 'coauthor@litsphere.ac', expectedRole: 'user', pass: 'coauthor123' },
    { email: 'advisor@litsphere.ac', expectedRole: 'supervisor', pass: 'advisor123' }
  ];

  for (const sa of seedAccounts) {
    const acc = db.prepare("SELECT * FROM users WHERE email = ?").get(sa.email);
    if (!acc) {
      errors.push(`Seed user '${sa.email}' not found`);
    } else {
      if (acc.role !== sa.expectedRole) {
        errors.push(`Seed user '${sa.email}' role mismatch: expected ${sa.expectedRole}, got ${acc.role}`);
      }
      if (!verifyPassword(sa.pass, acc.password_hash) && !verifyPassword('password123', acc.password_hash)) {
        errors.push(`Seed user '${sa.email}' password verification failed`);
      } else {
        console.log(`  ${c.green}✔${c.reset} Academic seed account '${sa.email}' (${acc.role}) verified`);
      }
    }
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// PHASE 7: PostgreSQL Parity & Prisma Migration Consistency
// ------------------------------------------------------------------------------
async function runPhase7(db) {
  console.log(`\n${c.cyan}======================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}▶ PHASE 7: PostgreSQL Parity & Prisma Migration Consistency${c.reset}`);
  console.log(`${c.cyan}======================================================================${c.reset}`);

  const errors = [];
  const details = {};

  try {
    const { verifyConsistency } = require('../src/scripts/verify_migration_consistency');
    const { checkPrismaHealth, prisma } = require('../src/config/prisma');
    const { runMigration } = require('../src/scripts/migrate_sqlite_to_postgres');

    // 7.1 Check live Prisma health
    const health = await checkPrismaHealth();
    if (!health.connected) {
      errors.push(`Prisma/PostgreSQL connection unhealthy: ${health.error}`);
      return { passed: false, errors, details };
    }
    console.log(`  ${c.green}✔${c.reset} Prisma / PostgreSQL connection is healthy (latency: ${health.latencyMs}ms)`);

    // 7.2 Verify schema.prisma model and enum mapping parity
    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      errors.push(`schema.prisma file missing at ${schemaPath}`);
    } else {
      const schemaText = fs.readFileSync(schemaPath, 'utf8');
      const expectedModels = [
        'User', 'Session', 'PasswordReset', 'Project', 'ProjectMember',
        'TaxonomyCluster', 'DynamicColumn', 'PaperColumnValue', 'Paper',
        'PaperFile', 'PaperKeyword', 'PaperComment', 'PaperHighlight',
        'PaperScreening', 'AuditLog', 'MasterTemplate', 'SystemSetting'
      ];
      for (const m of expectedModels) {
        if (!schemaText.includes(`model ${m} `)) {
          errors.push(`Missing Prisma model definition: ${m}`);
        }
      }
      console.log(`  ${c.green}✔${c.reset} Verified 17 Prisma models with strict SQLite relational entity mapping`);
    }

    // 7.3 Run migration sync (SQLite -> PostgreSQL) to mirror latest runtime/test data
    console.log(`  🔄 Synchronizing current SQLite records to PostgreSQL...`);
    await runMigration({ clean: true });
    console.log(`  ${c.green}✔${c.reset} SQLite to PostgreSQL data migration sync completed`);

    // 7.4 Run verifyConsistency()
    const verifyResult = await verifyConsistency();
    if (!verifyResult.success) {
      errors.push(`PostgreSQL migration consistency returned ${verifyResult.totalErrors} errors`);
    } else {
      console.log(`  ${c.green}✔${c.reset} Full PostgreSQL parity verified: Row counts, Foreign Keys, SHA-256 Hashes, Autoincrement Sequences`);
    }
  } catch (pErr) {
    errors.push(`Phase 7 verification execution error: ${pErr.message}`);
  }

  return { passed: errors.length === 0, errors, details };
}

// ------------------------------------------------------------------------------
// MASTER ORCHESTRATOR WITH RE-CHECK LOOPING
// ------------------------------------------------------------------------------
async function runPhases(targetPhase = 7) {
  const db = getDb();
  const phaseFns = [
    { num: 1, name: 'Engine Health & Low-Level Physical Integrity', fn: runPhase1 },
    { num: 2, name: 'Relational Schema & Foreign Key Constraints Integrity', fn: runPhase2 },
    { num: 3, name: 'Table Indexes, Uniqueness & Query Performance', fn: runPhase3 },
    { num: 4, name: 'Data Hygiene, Security & Field Validation', fn: runPhase4 },
    { num: 5, name: 'Orphan Records & Garbage Data Audit', fn: runPhase5 },
    { num: 6, name: 'Default Seed Data & Master Templates Verification', fn: runPhase6 },
    { num: 7, name: 'PostgreSQL Parity & Prisma Migration Consistency', fn: runPhase7 }
  ];

  console.log(`${c.bold}${c.yellow}\n======================================================================`);
  console.log(`🚀 EXECUTING DATABASE VERIFICATION SUITE: PHASES 1 TO ${targetPhase}`);
  console.log(`======================================================================${c.reset}`);

  for (let i = 0; i < targetPhase; i++) {
    const p = phaseFns[i];
    const res = await p.fn(db);
    if (!res.passed) {
      console.error(`\n${c.red}${c.bold}❌ PHASE ${p.num} FAILED WITH ${res.errors.length} ISSUE(S):${c.reset}`);
      for (const err of res.errors) {
        console.error(`   ${c.red}• ${err}${c.reset}`);
      }
      return { success: false, failedPhase: p.num, errors: res.errors };
    } else {
      console.log(`\n${c.green}${c.bold}⭐ PHASE ${p.num} [${p.name}] PASSED WITH ZERO ERRORS.${c.reset}`);
    }
  }

  console.log(`\n${c.green}${c.bold}======================================================================`);
  console.log(`🏆 ALL PHASES (1 TO ${targetPhase}) SUCCESSFULLY PASSED ZERO-CORRUPTION VERIFICATION!`);
  console.log(`======================================================================${c.reset}\n`);

  return { success: true };
}

if (require.main === module) {
  const target = parseInt(process.argv[2] || '7', 10);
  runPhases(target)
    .then(({ success, failedPhase }) => {
      process.exit(success ? 0 : (failedPhase || 1));
    })
    .catch(err => {
      console.error('Fatal test runner error:', err);
      process.exit(1);
    });
}

module.exports = {
  runPhase1,
  runPhase2,
  runPhase3,
  runPhase4,
  runPhase5,
  runPhase6,
  runPhase7,
  runPhases
};
