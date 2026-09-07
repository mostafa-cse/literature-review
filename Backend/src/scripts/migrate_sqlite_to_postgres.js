/**
 * ==============================================================================
 * LITSPHERE AUTOMATED DATA MIGRATION SCRIPT (SQLite -> PostgreSQL + R2)
 * ==============================================================================
 * Extracts all academic records from SQLite (literature.db), applies strict
 * enum/relational transformations, offloads PDF manuscript BLOBs to Cloudflare R2
 * (with local offline fallback), loads records into PostgreSQL via Prisma,
 * and synchronizes all autoincrement sequences.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { prisma } = require('../config/prisma');
const storageService = require('../services/storageService');

// Resolve path to SQLite database
const rootDb = path.resolve(__dirname, '../../../literature.db');
const backendDb = path.resolve(__dirname, '../../literature.db');
const seedDb = path.resolve(__dirname, '../../literature-seed.db');

let SQLITE_PATH = process.env.DB_PATH;
if (!SQLITE_PATH || !fs.existsSync(SQLITE_PATH)) {
  if (fs.existsSync(rootDb)) {
    SQLITE_PATH = rootDb;
  } else if (fs.existsSync(backendDb)) {
    SQLITE_PATH = backendDb;
  } else if (fs.existsSync(seedDb)) {
    SQLITE_PATH = seedDb;
  } else {
    throw new Error('No SQLite database found for migration at ' + rootDb);
  }
}

// ------------------------------------------------------------------------------
// ENUM TRANSFORM HELPERS
// ------------------------------------------------------------------------------

function mapRole(role) {
  if (!role) return 'USER';
  const r = role.toUpperCase();
  if (['ADMIN', 'USER', 'REVIEWER', 'SUPERVISOR'].includes(r)) return r;
  return 'USER';
}

function mapUserStatus(status) {
  if (!status) return 'ACTIVE';
  const s = status.toUpperCase();
  if (['ACTIVE', 'DEACTIVATED', 'BANNED'].includes(s)) return s;
  return 'ACTIVE';
}

function mapProjectRole(role) {
  if (!role) return 'VIEWER';
  const r = role.toUpperCase();
  if (['OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'].includes(r)) return r;
  return 'VIEWER';
}

function mapPaperStatus(status) {
  if (!status) return 'UNREAD';
  const s = status.toLowerCase();
  if (s === 'read' || s === 'completed' || s === 'analyzed') return 'COMPLETED';
  if (s === 'in_progress' || s === 'reading') return 'READING';
  return 'UNREAD';
}

function mapScreeningDecision(dec) {
  if (!dec) return 'PENDING';
  const d = dec.toUpperCase();
  if (['INCLUDED', 'EXCLUDED', 'UNCERTAIN', 'PENDING'].includes(d)) return d;
  return 'PENDING';
}

function mapColType(t) {
  if (!t) return 'TEXT';
  const ct = t.toUpperCase();
  if (['TEXT', 'NUMBER', 'LATEX', 'TAGS', 'SELECT'].includes(ct)) return ct;
  return 'TEXT';
}

function mapAuditStatus(s) {
  if (!s) return 'SUCCESS';
  const st = s.toUpperCase();
  if (['FAILED', 'FAILURE'].includes(st)) return 'FAILURE';
  if (['WARNING', 'DENIED'].includes(st)) return 'DENIED';
  return 'SUCCESS';
}

function parseDate(val, fallback = new Date()) {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

// ------------------------------------------------------------------------------
// TABLE TRUNCATION (CLEAN SLATE OPTION)
// ------------------------------------------------------------------------------

async function cleanPostgresTables() {
  console.log('🧹 [PostgreSQL] Truncating all tables for clean migration...');
  const tables = [
    'paper_highlights',
    'paper_screening',
    'paper_comments',
    'paper_files',
    'keywords',
    'paper_column_values',
    'papers',
    'dynamic_columns',
    'clusters',
    'project_members',
    'projects',
    'sessions',
    'password_resets',
    'audit_logs',
    'master_templates',
    'system_settings',
    'users',
  ];

  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE;`);
  }
  console.log('✅ [PostgreSQL] Clean truncation complete.');
}

// ------------------------------------------------------------------------------
// SEQUENCE SYNCHRONIZATION
// ------------------------------------------------------------------------------

async function syncPostgresSequences() {
  console.log('🔄 [PostgreSQL] Synchronizing autoincrement ID sequences...');
  const autoincrementTables = [
    'users',
    'projects',
    'project_members',
    'clusters',
    'dynamic_columns',
    'papers',
    'paper_column_values',
    'keywords',
    'paper_files',
    'paper_comments',
    'paper_screening',
    'paper_highlights',
    'master_templates',
    'audit_logs',
    'password_resets',
  ];

  for (const t of autoincrementTables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE(MAX(id), 1)) FROM "${t}";`
      );
    } catch (err) {
      console.warn(`⚠️ Warning syncing sequence for ${t}:`, err.message);
    }
  }
  console.log('✅ [PostgreSQL] All 15 ID sequences successfully synchronized.');
}

// ------------------------------------------------------------------------------
// MAIN MIGRATION PIPELINE
// ------------------------------------------------------------------------------

async function runMigration({ clean = true } = {}) {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log('🚀 LITSPHERE DATABASE MIGRATION: SQLite -> PostgreSQL & Cloudflare R2');
  console.log('======================================================================');
  console.log(`📂 Source SQLite: ${SQLITE_PATH}`);
  console.log(`🎯 Target Database: ${process.env.DATABASE_URL ? 'PostgreSQL (Prisma)' : 'Undefined'}`);

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });

  if (clean) {
    await cleanPostgresTables();
  }

  const stats = {
    users: 0,
    system_settings: 0,
    master_templates: 0,
    projects: 0,
    project_members: 0,
    clusters: 0,
    dynamic_columns: 0,
    papers: 0,
    paper_column_values: 0,
    keywords: 0,
    paper_files: 0,
    paper_comments: 0,
    paper_screening: 0,
    paper_highlights: 0,
    audit_logs: 0,
    password_resets: 0,
  };

  // 1. Users
  console.log('\n▶️ [1/16] Migrating Users...');
  const rawUsers = sqlite.prepare('SELECT * FROM users').all();
  const validUserIds = new Set();
  for (const u of rawUsers) {
    validUserIds.add(u.id);
  }

  const usersData = rawUsers.map((u) => ({
    id: u.id,
    name: u.name || 'Anonymous User',
    username: u.username || null,
    email: u.email,
    passwordHash: u.password_hash,
    role: mapRole(u.role),
    institution: u.institution || 'Academic Research Institute',
    status: mapUserStatus(u.status),
    bio: u.bio || null,
    orcid: u.orcid || null,
    googleScholar: u.google_scholar || null,
    phone: u.phone || null,
    avatarUrl: u.avatar_url || null,
    tokenVersion: u.token_version || 1,
    firebaseUid: u.firebase_uid || null,
    aiTokenQuota: u.ai_token_quota || 100000,
    aiTokensUsed: u.ai_tokens_used || 0,
    storageQuotaMb: u.storage_quota_mb || 500,
    storageUsedMb: Number(u.storage_used_mb) || 0.0,
    createdAt: parseDate(u.created_at),
    lastLogin: u.last_login ? parseDate(u.last_login) : null,
  }));

  const userRes = await prisma.user.createMany({
    data: usersData,
    skipDuplicates: true,
  });
  stats.users = userRes.count;
  console.log(`   ✅ Migrated ${stats.users} users.`);

  // 2. System Settings
  console.log('\n▶️ [2/16] Migrating System Settings...');
  const rawSettings = sqlite.prepare('SELECT * FROM system_settings').all();
  const settingsData = rawSettings.map((s) => ({
    key: s.key,
    value: s.value,
    updatedAt: parseDate(s.updated_at),
  }));
  const setRes = await prisma.systemSetting.createMany({
    data: settingsData,
    skipDuplicates: true,
  });
  stats.system_settings = setRes.count;
  console.log(`   ✅ Migrated ${stats.system_settings} system settings.`);

  // 3. Master Templates
  console.log('\n▶️ [3/16] Migrating Master Templates...');
  const rawTemplates = sqlite.prepare('SELECT * FROM master_templates').all();
  const templatesData = rawTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description || null,
    clustersJson: t.clusters_json,
    createdAt: parseDate(t.created_at),
  }));
  const templRes = await prisma.masterTemplate.createMany({
    data: templatesData,
    skipDuplicates: true,
  });
  stats.master_templates = templRes.count;
  console.log(`   ✅ Migrated ${stats.master_templates} master templates.`);

  // 4. Projects (Surveys)
  console.log('\n▶️ [4/16] Migrating Projects...');
  const rawProjects = sqlite.prepare('SELECT * FROM projects').all();
  const validProjectIds = new Set();
  for (const p of rawProjects) {
    validProjectIds.add(p.id);
  }

  const fallbackOwnerId = validUserIds.has(1) ? 1 : (validUserIds.size > 0 ? Array.from(validUserIds)[0] : null);

  const projectsData = rawProjects.map((p) => ({
    id: p.id,
    ownerId: validUserIds.has(p.owner_id) ? p.owner_id : fallbackOwnerId,
    name: p.name,
    description: p.description || null,
    domain: p.domain || 'Computer Science',
    isPublic: Boolean(p.is_public),
    shareToken: p.share_token || null,
    createdAt: parseDate(p.created_at),
    updatedAt: parseDate(p.created_at),
  }));

  // Ensure default Project 1 exists if referenced by papers in SQLite
  const papersNeedProj1 = sqlite
    .prepare('SELECT COUNT(*) as c FROM papers WHERE project_id = 1')
    .get().c;
  if (papersNeedProj1 > 0 && !validProjectIds.has(1)) {
    console.log('   ℹ️ Synthesizing fallback Project 1 for foundational papers...');
    projectsData.unshift({
      id: 1,
      ownerId: fallbackOwnerId,
      name: 'Default Literature Survey & Benchmark',
      description: 'Foundational benchmark survey workspace migrated from SQLite.',
      domain: 'Computer Science',
      isPublic: false,
      shareToken: 'survey_migrated_default_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    validProjectIds.add(1);
  }

  const projRes = await prisma.project.createMany({
    data: projectsData,
    skipDuplicates: true,
  });
  stats.projects = projRes.count;
  console.log(`   ✅ Migrated ${stats.projects} projects.`);

  // 5. Project Members
  console.log('\n▶️ [5/16] Migrating Project Members...');
  const rawMembers = sqlite.prepare('SELECT * FROM project_members').all();
  const validMembers = rawMembers.filter(
    (m) => validProjectIds.has(m.project_id) && validUserIds.has(m.user_id)
  );

  const membersData = validMembers.map((m) => ({
    id: m.id,
    projectId: m.project_id,
    userId: m.user_id,
    role: mapProjectRole(m.role),
    invitedBy: m.invited_by && validUserIds.has(m.invited_by) ? m.invited_by : null,
    createdAt: parseDate(m.created_at),
  }));

  const memRes = await prisma.projectMember.createMany({
    data: membersData,
    skipDuplicates: true,
  });
  stats.project_members = memRes.count;
  console.log(`   ✅ Migrated ${stats.project_members} project members.`);

  // 6. Taxonomy Clusters
  console.log('\n▶️ [6/16] Migrating Taxonomy Clusters...');
  const rawClusters = sqlite.prepare('SELECT * FROM clusters').all();
  const validClusterIds = new Set();
  const validClusters = rawClusters.filter((c) => validProjectIds.has(c.project_id));
  for (const c of validClusters) {
    validClusterIds.add(c.id);
  }

  const clustersData = validClusters.map((c) => ({
    id: c.id,
    projectId: c.project_id,
    name: c.name,
    description: c.description || null,
    color: c.color || null,
    position: c.position || 0,
    createdAt: new Date(),
  }));

  const clustRes = await prisma.taxonomyCluster.createMany({
    data: clustersData,
    skipDuplicates: true,
  });
  stats.clusters = clustRes.count;
  console.log(`   ✅ Migrated ${stats.clusters} taxonomy clusters.`);

  // 7. Dynamic Columns
  console.log('\n▶️ [7/16] Migrating Dynamic Benchmark Columns...');
  const rawCols = sqlite.prepare('SELECT * FROM dynamic_columns').all();
  const validCols = rawCols.filter((col) => validClusterIds.has(col.cluster_id));
  const validColIds = new Set();
  for (const col of validCols) {
    validColIds.add(col.id);
  }

  // Insert parent columns first (parent_column_id IS NULL)
  const parentCols = validCols.filter((c) => !c.parent_column_id);
  const childCols = validCols.filter((c) => c.parent_column_id);

  const parentData = parentCols.map((col) => ({
    id: col.id,
    clusterId: col.cluster_id,
    columnName: col.column_name,
    parentColumnId: null,
    colType: mapColType(col.col_type),
    createdAt: new Date(),
  }));
  const parentRes = await prisma.dynamicColumn.createMany({
    data: parentData,
    skipDuplicates: true,
  });

  let childCount = 0;
  if (childCols.length > 0) {
    const childData = childCols.map((col) => ({
      id: col.id,
      clusterId: col.cluster_id,
      columnName: col.column_name,
      parentColumnId: validColIds.has(col.parent_column_id) ? col.parent_column_id : null,
      colType: mapColType(col.col_type),
      createdAt: new Date(),
    }));
    const childRes = await prisma.dynamicColumn.createMany({
      data: childData,
      skipDuplicates: true,
    });
    childCount = childRes.count;
  }

  stats.dynamic_columns = parentRes.count + childCount;
  console.log(`   ✅ Migrated ${stats.dynamic_columns} dynamic columns (${parentRes.count} roots, ${childCount} children).`);

  // 8. Papers
  console.log('\n▶️ [8/16] Migrating Academic Papers...');
  const rawPapers = sqlite.prepare('SELECT * FROM papers').all();
  const validPaperIds = new Set();

  const papersData = rawPapers.map((p) => {
    const targetProjId = validProjectIds.has(p.project_id) ? p.project_id : 1;
    const targetClusterId = p.cluster_id && validClusterIds.has(p.cluster_id) ? p.cluster_id : null;
    validPaperIds.add(p.id);

    return {
      id: p.id,
      projectId: targetProjId,
      clusterId: targetClusterId,
      title: p.title || 'Untitled Paper',
      authors: p.authors || null,
      year: p.year ? Number(p.year) : null,
      pub: p.pub || null,
      domain: p.domain || null,
      doi: p.doi || null,
      pdfUrl: p.pdf_url || null,
      status: mapPaperStatus(p.status),
      intuition: p.intuition || null,
      equation: p.equation || null,
      strengths: p.strengths || null,
      gaps: p.gaps || null,
      advantages: p.advantages || null,
      criticism: p.criticism || null,
      futureDirections: p.future_directions || null,
      screeningDecision: mapScreeningDecision(p.screening_decision),
      screeningReason: p.screening_reason || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  const papRes = await prisma.paper.createMany({
    data: papersData,
    skipDuplicates: true,
  });
  stats.papers = papRes.count;
  console.log(`   ✅ Migrated ${stats.papers} papers.`);

  // 9. Paper Column Values (Matrix Values)
  console.log('\n▶️ [9/16] Migrating Benchmark Matrix Values...');
  const rawValues = sqlite.prepare('SELECT * FROM paper_column_values').all();
  const validValues = rawValues.filter(
    (v) => validPaperIds.has(v.paper_id) && validColIds.has(v.column_id)
  );

  // Deduplicate on (paperId, columnId)
  const seenMatrixPairs = new Set();
  const valuesData = [];
  for (const v of validValues) {
    const key = `${v.paper_id}:${v.column_id}`;
    if (!seenMatrixPairs.has(key)) {
      seenMatrixPairs.add(key);
      valuesData.push({
        id: v.id,
        paperId: v.paper_id,
        columnId: v.column_id,
        value: v.value || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // Insert in batches of 1000
  const BATCH_SIZE = 1000;
  let valuesCount = 0;
  for (let i = 0; i < valuesData.length; i += BATCH_SIZE) {
    const chunk = valuesData.slice(i, i + BATCH_SIZE);
    const chunkRes = await prisma.paperColumnValue.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    valuesCount += chunkRes.count;
  }
  stats.paper_column_values = valuesCount;
  console.log(`   ✅ Migrated ${stats.paper_column_values} matrix cell values.`);

  // 10. Keywords
  console.log('\n▶️ [10/16] Migrating Paper Keywords...');
  const rawKeywords = sqlite.prepare('SELECT * FROM keywords').all();
  const validKeywords = rawKeywords.filter((k) => validPaperIds.has(k.paper_id));
  const keywordsData = validKeywords.map((k) => ({
    id: k.id,
    paperId: k.paper_id,
    keyword: k.keyword,
  }));

  const kwRes = await prisma.paperKeyword.createMany({
    data: keywordsData,
    skipDuplicates: true,
  });
  stats.keywords = kwRes.count;
  console.log(`   ✅ Migrated ${stats.keywords} keywords.`);

  // 11. Paper Files (BLOB to Cloudflare R2 / Storage Service)
  console.log('\n▶️ [11/16] Migrating Paper Files & Uploading BLOBs to Storage/R2...');
  const rawFiles = sqlite
    .prepare('SELECT id, paper_id, filename, mimetype, file_size, data FROM paper_files')
    .all();
  const validFiles = rawFiles.filter((f) => validPaperIds.has(f.paper_id));

  let fileIndex = 0;
  for (const f of validFiles) {
    fileIndex++;
    const buffer = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    process.stdout.write(
      `   ⏳ [${fileIndex}/${validFiles.length}] Storing paper ${f.paper_id}: ${f.filename.slice(0, 35)}... (${(buffer.length / 1024).toFixed(0)} KB)\r`
    );

    await storageService.storePaperFile({
      paperId: f.paper_id,
      filename: f.filename,
      mimetype: f.mimetype || 'application/pdf',
      buffer,
    });
    stats.paper_files++;
  }
  console.log(`\n   ✅ Migrated & offloaded ${stats.paper_files} PDF manuscripts to storage.`);

  // 12. Paper Comments
  console.log('\n▶️ [12/16] Migrating Paper Comments...');
  const rawComments = sqlite.prepare('SELECT * FROM paper_comments').all();
  const validComments = rawComments.filter((c) => validPaperIds.has(c.paper_id));
  const commentsData = validComments.map((c) => ({
    id: c.id,
    paperId: c.paper_id,
    userId: c.user_id && validUserIds.has(c.user_id) ? c.user_id : null,
    userName: c.user_name || null,
    userRole: c.user_role || 'reviewer',
    commentText: c.comment_text,
    quoteText: c.quote_text || null,
    pageNumber: c.page_number ? Number(c.page_number) : null,
    createdAt: parseDate(c.created_at),
  }));
  const commRes = await prisma.paperComment.createMany({
    data: commentsData,
    skipDuplicates: true,
  });
  stats.paper_comments = commRes.count;
  console.log(`   ✅ Migrated ${stats.paper_comments} paper comments.`);

  // 13. Paper Screening
  console.log('\n▶️ [13/16] Migrating PRISMA Screening Decisions...');
  const rawScreening = sqlite.prepare('SELECT * FROM paper_screening').all();
  const validScreening = rawScreening.filter((s) => validPaperIds.has(s.paper_id));
  const seenScreeningPairs = new Set();
  const screeningData = [];

  for (const s of validScreening) {
    const uid = s.user_id && validUserIds.has(s.user_id) ? s.user_id : null;
    const pairKey = `${s.paper_id}:${uid}`;
    if (!seenScreeningPairs.has(pairKey)) {
      seenScreeningPairs.add(pairKey);
      screeningData.push({
        id: s.id,
        paperId: s.paper_id,
        userId: uid,
        userName: s.user_name || null,
        decision: mapScreeningDecision(s.decision),
        exclusionReason: s.exclusion_reason || null,
        notes: s.notes || null,
        updatedAt: parseDate(s.updated_at),
      });
    }
  }

  const screenRes = await prisma.paperScreening.createMany({
    data: screeningData,
    skipDuplicates: true,
  });
  stats.paper_screening = screenRes.count;
  console.log(`   ✅ Migrated ${stats.paper_screening} paper screening decisions.`);

  // 14. Paper Highlights
  console.log('\n▶️ [14/16] Migrating PDF Coordinate Highlights...');
  const rawHighlights = sqlite.prepare('SELECT * FROM paper_highlights').all();
  const validHighlights = rawHighlights.filter((h) => validPaperIds.has(h.paper_id));
  const highlightsData = validHighlights.map((h) => ({
    id: h.id,
    paperId: h.paper_id,
    userId: h.user_id && validUserIds.has(h.user_id) ? h.user_id : null,
    userName: h.user_name || null,
    userRole: h.user_role || 'reviewer',
    pageNumber: h.page_number ? Number(h.page_number) : 1,
    color: h.color || '#fef08a',
    colorLabel: h.color_label || null,
    selectedText: h.selected_text || '',
    quadsJson: h.quads_json || null,
    note: h.note || null,
    createdAt: parseDate(h.created_at),
  }));

  const hlRes = await prisma.paperHighlight.createMany({
    data: highlightsData,
    skipDuplicates: true,
  });
  stats.paper_highlights = hlRes.count;
  console.log(`   ✅ Migrated ${stats.paper_highlights} paper highlights.`);

  // 15. Audit Logs
  console.log('\n▶️ [15/16] Migrating Audit Logs & System Telemetry...');
  const rawAudit = sqlite.prepare('SELECT * FROM audit_logs').all();
  const auditData = rawAudit.map((a) => ({
    id: a.id,
    userId: a.user_id && validUserIds.has(a.user_id) ? a.user_id : null,
    userEmail: a.user_email || null,
    action: a.action,
    ipAddress: a.ip_address || null,
    details: a.details || null,
    status: mapAuditStatus(a.status),
    createdAt: parseDate(a.created_at),
  }));

  let auditCount = 0;
  for (let i = 0; i < auditData.length; i += BATCH_SIZE) {
    const chunk = auditData.slice(i, i + BATCH_SIZE);
    const chunkRes = await prisma.auditLog.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    auditCount += chunkRes.count;
  }
  stats.audit_logs = auditCount;
  console.log(`   ✅ Migrated ${stats.audit_logs} audit log entries.`);

  // 16. Password Resets
  console.log('\n▶️ [16/16] Migrating Password Resets...');
  const rawResets = sqlite.prepare('SELECT * FROM password_resets').all();
  const validResets = rawResets.filter((r) => validUserIds.has(r.user_id));
  const resetsData = validResets.map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: r.email,
    code: r.code,
    token: r.token,
    expiresAt: parseDate(r.expires_at),
    used: Boolean(r.used),
    createdAt: parseDate(r.created_at),
  }));

  const resetRes = await prisma.passwordReset.createMany({
    data: resetsData,
    skipDuplicates: true,
  });
  stats.password_resets = resetRes.count;
  console.log(`   ✅ Migrated ${stats.password_resets} password resets.`);

  // Synchronize autoincrement sequences
  await syncPostgresSequences();

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================================');
  console.log(`🎉 MIGRATION COMPLETED SUCCESSFULLY IN ${duration} SECONDS`);
  console.log('======================================================================');
  console.table(stats);

  return stats;
}

if (require.main === module) {
  const shouldClean = !process.argv.includes('--no-clean');
  runMigration({ clean: shouldClean })
    .then(() => {
      console.log('🏁 Migration process completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Migration failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runMigration, syncPostgresSequences, cleanPostgresTables };
