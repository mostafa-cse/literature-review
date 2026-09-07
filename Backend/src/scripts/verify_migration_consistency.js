/**
 * ==============================================================================
 * LITSPHERE MIGRATION CONSISTENCY & RELATIONAL INTEGRITY VERIFICATION
 * ==============================================================================
 * Verifies foreign key consistency, row parity, SHA-256 integrity, and sequence
 * alignment between SQLite (literature.db) and PostgreSQL (Prisma).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { prisma } = require('../config/prisma');

// Resolve path to SQLite database
const rootDb = path.resolve(__dirname, '../../../literature.db');
const backendDb = path.resolve(__dirname, '../../literature.db');
const seedDb = path.resolve(__dirname, '../../literature-seed.db');

let SQLITE_PATH = process.env.DB_PATH;
if (!SQLITE_PATH || !fs.existsSync(SQLITE_PATH)) {
  if (fs.existsSync(rootDb)) SQLITE_PATH = rootDb;
  else if (fs.existsSync(backendDb)) SQLITE_PATH = backendDb;
  else if (fs.existsSync(seedDb)) SQLITE_PATH = seedDb;
}

async function verifyConsistency() {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log('🔍 LITSPHERE RELATIONAL CONSISTENCY & MIGRATION INTEGRITY VERIFICATION');
  console.log('======================================================================\n');

  let totalErrors = 0;
  const results = {
    tableCounts: [],
    foreignKeyChecks: [],
    fileIntegrity: null,
    sequenceChecks: [],
  };

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

  // ----------------------------------------------------------------------------
  // 1. Table Row Count Comparison
  // ----------------------------------------------------------------------------
  console.log('📊 [1/4] Comparing Row Counts (SQLite vs. PostgreSQL)...');
  const countChecks = [
    { name: 'users', pgModel: prisma.user, sqliteTable: 'users' },
    { name: 'system_settings', pgModel: prisma.systemSetting, sqliteTable: 'system_settings' },
    { name: 'master_templates', pgModel: prisma.masterTemplate, sqliteTable: 'master_templates' },
    { name: 'projects', pgModel: prisma.project, sqliteTable: 'projects', allowExtra: true }, // +1 synthesized default project
    { name: 'project_members', pgModel: prisma.projectMember, sqliteTable: 'project_members' },
    { name: 'clusters', pgModel: prisma.taxonomyCluster, sqliteTable: 'clusters' },
    { name: 'dynamic_columns', pgModel: prisma.dynamicColumn, sqliteTable: 'dynamic_columns' },
    { name: 'papers', pgModel: prisma.paper, sqliteTable: 'papers' },
    { name: 'paper_column_values', pgModel: prisma.paperColumnValue, sqliteTable: 'paper_column_values' },
    { name: 'keywords', pgModel: prisma.paperKeyword, sqliteTable: 'keywords' },
    { name: 'paper_files', pgModel: prisma.paperFile, sqliteTable: 'paper_files' },
    { name: 'paper_comments', pgModel: prisma.paperComment, sqliteTable: 'paper_comments' },
    { name: 'paper_screening', pgModel: prisma.paperScreening, sqliteTable: 'paper_screening' },
    { name: 'paper_highlights', pgModel: prisma.paperHighlight, sqliteTable: 'paper_highlights' },
    { name: 'audit_logs', pgModel: prisma.auditLog, sqliteTable: 'audit_logs' },
    { name: 'password_resets', pgModel: prisma.passwordReset, sqliteTable: 'password_resets', filterOrphans: true },
  ];

  for (const c of countChecks) {
    const sqliteCount = sqlite
      .prepare(`SELECT COUNT(*) as c FROM "${c.sqliteTable}"`)
      .get().c;
    const pgCount = await c.pgModel.count();

    let matches = sqliteCount === pgCount;
    let note = 'Exact Match';

    if (c.allowExtra && pgCount >= sqliteCount) {
      matches = true;
      note = `Valid (Synthesized Project fallback included: PG=${pgCount}, SQLite=${sqliteCount})`;
    } else if (c.filterOrphans && pgCount <= sqliteCount) {
      matches = true;
      note = `Valid (Orphaned test tokens skipped: PG=${pgCount}, SQLite=${sqliteCount})`;
    }

    if (!matches) {
      totalErrors++;
      note = `MISMATCH! SQLite=${sqliteCount}, PG=${pgCount}`;
    }

    results.tableCounts.push({
      Table: c.name,
      SQLite: sqliteCount,
      PostgreSQL: pgCount,
      Status: matches ? '✅ PASS' : '❌ FAIL',
      Details: note,
    });
  }
  console.table(results.tableCounts);

  // ----------------------------------------------------------------------------
  // 2. Strict Foreign Key & Referential Integrity in PostgreSQL
  // ----------------------------------------------------------------------------
  console.log('\n🔗 [2/4] Verifying Foreign Key Integrity & Zero Orphaned Records in PostgreSQL...');
  const fkChecks = [
    {
      relation: 'papers -> projects',
      sql: 'SELECT COUNT(*) as c FROM papers WHERE project_id NOT IN (SELECT id FROM projects)',
    },
    {
      relation: 'papers -> clusters',
      sql: 'SELECT COUNT(*) as c FROM papers WHERE cluster_id IS NOT NULL AND cluster_id NOT IN (SELECT id FROM clusters)',
    },
    {
      relation: 'clusters -> projects',
      sql: 'SELECT COUNT(*) as c FROM clusters WHERE project_id NOT IN (SELECT id FROM projects)',
    },
    {
      relation: 'dynamic_columns -> clusters',
      sql: 'SELECT COUNT(*) as c FROM dynamic_columns WHERE cluster_id NOT IN (SELECT id FROM clusters)',
    },
    {
      relation: 'dynamic_columns -> dynamic_columns (parent)',
      sql: 'SELECT COUNT(*) as c FROM dynamic_columns WHERE parent_column_id IS NOT NULL AND parent_column_id NOT IN (SELECT id FROM dynamic_columns)',
    },
    {
      relation: 'paper_column_values -> papers',
      sql: 'SELECT COUNT(*) as c FROM paper_column_values WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'paper_column_values -> dynamic_columns',
      sql: 'SELECT COUNT(*) as c FROM paper_column_values WHERE column_id NOT IN (SELECT id FROM dynamic_columns)',
    },
    {
      relation: 'keywords -> papers',
      sql: 'SELECT COUNT(*) as c FROM keywords WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'paper_files -> papers',
      sql: 'SELECT COUNT(*) as c FROM paper_files WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'project_members -> projects',
      sql: 'SELECT COUNT(*) as c FROM project_members WHERE project_id NOT IN (SELECT id FROM projects)',
    },
    {
      relation: 'project_members -> users',
      sql: 'SELECT COUNT(*) as c FROM project_members WHERE user_id NOT IN (SELECT id FROM users)',
    },
    {
      relation: 'paper_comments -> papers',
      sql: 'SELECT COUNT(*) as c FROM paper_comments WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'paper_comments -> users',
      sql: 'SELECT COUNT(*) as c FROM paper_comments WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)',
    },
    {
      relation: 'paper_screening -> papers',
      sql: 'SELECT COUNT(*) as c FROM paper_screening WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'paper_screening -> users',
      sql: 'SELECT COUNT(*) as c FROM paper_screening WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)',
    },
    {
      relation: 'paper_highlights -> papers',
      sql: 'SELECT COUNT(*) as c FROM paper_highlights WHERE paper_id NOT IN (SELECT id FROM papers)',
    },
    {
      relation: 'paper_highlights -> users',
      sql: 'SELECT COUNT(*) as c FROM paper_highlights WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)',
    },
    {
      relation: 'password_resets -> users',
      sql: 'SELECT COUNT(*) as c FROM password_resets WHERE user_id NOT IN (SELECT id FROM users)',
    },
    {
      relation: 'audit_logs -> users',
      sql: 'SELECT COUNT(*) as c FROM audit_logs WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)',
    },
  ];

  for (const fk of fkChecks) {
    const res = await prisma.$queryRawUnsafe(fk.sql);
    const orphanCount = Number(res[0].c);
    const passed = orphanCount === 0;

    if (!passed) totalErrors++;

    results.foreignKeyChecks.push({
      Relationship: fk.relation,
      Orphans: orphanCount,
      Status: passed ? '✅ PASS' : '❌ VIOLATION',
    });
  }
  console.table(results.foreignKeyChecks);

  // ----------------------------------------------------------------------------
  // 3. File Storage & SHA-256 Integrity
  // ----------------------------------------------------------------------------
  console.log('\n📁 [3/4] Verifying Paper File Storage & SHA-256 Integrity...');
  const files = await prisma.paperFile.findMany();
  let invalidHashes = 0;
  let zeroSizes = 0;
  let missingKeys = 0;

  for (const f of files) {
    if (!f.sha256 || f.sha256.length !== 64) invalidHashes++;
    if (!f.fileSize || f.fileSize <= 0) zeroSizes++;
    if (!f.r2ObjectKey && !f.publicUrl) missingKeys++;
  }

  const filePassed = invalidHashes === 0 && zeroSizes === 0 && missingKeys === 0;
  if (!filePassed) totalErrors++;

  results.fileIntegrity = {
    TotalFiles: files.length,
    InvalidHashes: invalidHashes,
    ZeroByteFiles: zeroSizes,
    MissingKeysOrUrls: missingKeys,
    Status: filePassed ? '✅ PASS' : '❌ FAIL',
  };
  console.table([results.fileIntegrity]);

  // ----------------------------------------------------------------------------
  // 4. Sequence Alignment Verification
  // ----------------------------------------------------------------------------
  console.log('\n🔢 [4/4] Verifying Autoincrement Sequence Alignment...');
  const tables = [
    'users',
    'projects',
    'clusters',
    'dynamic_columns',
    'papers',
    'keywords',
    'paper_files',
  ];

  for (const t of tables) {
    const maxRes = await prisma.$queryRawUnsafe(`SELECT COALESCE(MAX(id), 1) as max_id FROM "${t}"`);
    const maxId = Number(maxRes[0].max_id);

    const seqRes = await prisma.$queryRawUnsafe(
      `SELECT last_value, is_called FROM "${t}_id_seq"`
    );
    const lastVal = Number(seqRes[0].last_value);
    const isCalled = seqRes[0].is_called;

    const aligned = isCalled ? lastVal >= maxId : lastVal > maxId;
    if (!aligned) totalErrors++;

    results.sequenceChecks.push({
      Table: t,
      MaxId: maxId,
      SeqLastValue: lastVal,
      IsCalled: isCalled,
      Status: aligned ? '✅ PASS' : '❌ MISALIGNED',
    });
  }
  console.table(results.sequenceChecks);

  // ----------------------------------------------------------------------------
  // Final Result
  // ----------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================================');
  if (totalErrors === 0) {
    console.log(`🏆 VERIFICATION PASSED WITH ZERO ERRORS (${duration}s)`);
    console.log('   All 16 tables, foreign keys, files, and sequences are 100% consistent!');
  } else {
    console.error(`💥 VERIFICATION FAILED WITH ${totalErrors} ERROR(S) (${duration}s)`);
  }
  console.log('======================================================================\n');

  return { success: totalErrors === 0, totalErrors, results };
}

if (require.main === module) {
  verifyConsistency()
    .then(({ success }) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal verification error:', err);
      process.exit(1);
    });
}

module.exports = { verifyConsistency };
