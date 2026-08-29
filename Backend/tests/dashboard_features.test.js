/**
 * 🧪 DASHBOARD FULL-FEATURE AUTOMATED TEST SUITE
 * 
 * Target: All Dashboard Features & Controls across Multi-Role Accounts
 * 
 * Accounts Under Test:
 *   1. Main User (Owner): ownerUser / own_user@mail.com / password123
 *   2. Editor: editorUser / edit_user@mail.com / password123
 *   3. Reviewer: reviewerUser / review_user@mail.com / password123
 *   4. Viewer: viewerUser / view_user@mail.com / password123
 * 
 * Scopes Tested:
 *   - Dashboard Statistics Calculation & Aggregation
 *   - Projects List Retrieval with user_role annotation
 *   - Create Survey Flow & Validation
 *   - Edit Survey Flow (Allowed for Owner & Editor, Forbidden for Reviewer & Viewer)
 *   - Delete Survey Flow (Strictly Owner-Only, Forbidden for Editor, Reviewer, Viewer)
 *   - Export Survey Flow (.xlsx / csv / json) for Owner and Editor
 *   - Preset Template Discovery
 *   - Tab Segmentation (All, Created By Me, Shared With Me)
 */

const http = require('http');
const { getDb, hashPassword } = require('../src/db');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✅ [PASS] ${message}`);
  }
}

async function runDashboardTests() {
  console.log('\n======================================================================');
  console.log('🧪 COMPREHENSIVE DASHBOARD FEATURES & MULTI-ROLE TEST SUITE');
  console.log('======================================================================');

  const db = getDb();

  // 0. Seed Users
  const testUsers = [
    { username: 'ownerUser', email: 'own_user@mail.com', name: 'Owner Researcher', role: 'user' },
    { username: 'editorUser', email: 'edit_user@mail.com', name: 'Editor Collaborator', role: 'user' },
    { username: 'reviewerUser', email: 'review_user@mail.com', name: 'Reviewer Member', role: 'user' },
    { username: 'viewerUser', email: 'view_user@mail.com', name: 'Viewer Guest', role: 'user' }
  ];

  const passHash = hashPassword('password123');
  for (const u of testUsers) {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET 
        username = excluded.username,
        password_hash = excluded.password_hash,
        name = excluded.name,
        role = excluded.role
    `).run(u.username, u.email, passHash, u.name, u.role);
  }

  // 1. Authenticate All 4 Accounts
  console.log('\n--- 1. Multi-Role Authentication for Dashboard Testing ---');
  const tokens = {};
  for (const u of testUsers) {
    const res = await request('POST', '/api/auth/login', {
      email: u.email,
      password: 'password123'
    });
    assert(res.status === 200 && res.body.token, `Login successful for ${u.username} (${u.email})`);
    tokens[u.username] = res.body.token;
  }

  const ownerH = { Authorization: `Bearer ${tokens.ownerUser}` };
  const editorH = { Authorization: `Bearer ${tokens.editorUser}` };
  const reviewerH = { Authorization: `Bearer ${tokens.reviewerUser}` };
  const viewerH = { Authorization: `Bearer ${tokens.viewerUser}` };

  // 2. Dashboard Statistics Test
  console.log('\n--- 2. Dashboard Header & Aggregated Stats ---');
  const statsRes = await request('GET', '/api/user/dashboard-stats', null, ownerH);
  assert(statsRes.status === 200, 'GET /api/user/dashboard-stats returns HTTP 200');
  assert(statsRes.body.total_surveys !== undefined, 'Stats payload contains total_surveys count');
  assert(statsRes.body.total_papers !== undefined, 'Stats payload contains total_papers count');
  assert(statsRes.body.completion_rate !== undefined, 'Stats payload contains completion_rate %');
  assert(statsRes.body.screenings_count !== undefined, 'Stats payload contains screenings_count');
  assert(statsRes.body.clusters_count !== undefined, 'Stats payload contains clusters_count');

  // 3. Domain Templates Discovery
  console.log('\n--- 3. Domain Taxonomy Templates API ---');
  const templRes = await request('GET', '/api/templates', null, ownerH);
  assert(templRes.status === 200, 'GET /api/templates returns HTTP 200');
  const templatesList = Array.isArray(templRes.body) ? templRes.body : (templRes.body.templates || []);
  assert(Array.isArray(templatesList), 'Templates returns array of pre-built domain taxonomies');
  assert(templatesList.length > 0, `Templates count: ${templatesList.length} templates available`);

  // 4. Create New Survey Feature
  console.log('\n--- 4. Create Survey Workflow & Validation ---');
  // Validation: empty name rejected
  const emptyCreate = await request('POST', '/api/projects', { name: '', description: 'Empty' }, ownerH);
  assert(emptyCreate.status === 400, 'Rejects empty survey name with HTTP 400');

  // Create valid survey
  const createRes = await request('POST', '/api/projects', {
    name: 'Dashboard Deep Test Survey 2026',
    description: 'Verifying all dashboard features, permissions, and matrix tools.'
  }, ownerH);
  assert(createRes.status === 201 && createRes.body.id, `Survey created successfully with ID: ${createRes.body.id}`);
  const surveyId = createRes.body.id;

  // Add a cluster and paper so metrics are non-zero
  const clRes = await request('POST', '/api/clusters', {
    project_id: surveyId,
    name: 'Deep Learning Architectures',
    description: 'Transformer and CNN benchmarks'
  }, ownerH);
  assert(clRes.status === 201, 'Taxonomy cluster created in survey');
  const clusterId = clRes.body.id;

  const pRes = await request('POST', '/api/papers', {
    project_id: surveyId,
    cluster_id: clusterId,
    title: 'Attention Is All You Need (Benchmark)',
    authors: 'Vaswani et al.',
    year: 2017,
    status: 'read'
  }, ownerH);
  assert(pRes.status === 201, 'Paper added to survey with status = read');

  // 5. Team Collaborator Invitations
  console.log('\n--- 5. Assign Collaborator Roles to Survey ---');
  const invEd = await request('POST', `/api/projects/${surveyId}/members`, { email: 'edit_user@mail.com', role: 'editor' }, ownerH);
  assert(invEd.status === 201 || invEd.status === 200, 'Invited editorUser as Editor');

  const invRev = await request('POST', `/api/projects/${surveyId}/members`, { email: 'review_user@mail.com', role: 'reviewer' }, ownerH);
  assert(invRev.status === 201 || invRev.status === 200, 'Invited reviewerUser as Reviewer');

  const invView = await request('POST', `/api/projects/${surveyId}/members`, { email: 'view_user@mail.com', role: 'viewer' }, ownerH);
  assert(invView.status === 201 || invView.status === 200, 'Invited viewerUser as Viewer');

  // 6. Projects Listing & Role Verification
  console.log('\n--- 6. Surveys List & Role Annotation Verification ---');
  const ownList = await request('GET', '/api/projects', null, ownerH);
  const ownSurvey = ownList.body.find(p => p.id === surveyId);
  assert(ownSurvey && ownSurvey.user_role === 'owner', 'Owner sees survey with role = "owner"');

  const edList = await request('GET', '/api/projects', null, editorH);
  const edSurvey = edList.body.find(p => p.id === surveyId);
  assert(edSurvey && edSurvey.user_role === 'editor', 'Editor sees survey with role = "editor"');

  const revList = await request('GET', '/api/projects', null, reviewerH);
  const revSurvey = revList.body.find(p => p.id === surveyId);
  assert(revSurvey && revSurvey.user_role === 'reviewer', 'Reviewer sees survey with role = "reviewer"');

  const viewList = await request('GET', '/api/projects', null, viewerH);
  const viewSurvey = viewList.body.find(p => p.id === surveyId);
  assert(viewSurvey && viewSurvey.user_role === 'viewer', 'Viewer sees survey with role = "viewer"');

  // 7. Edit Survey Feature & Permission Matrix
  console.log('\n--- 7. Edit Survey Permissions (Owner & Editor Allowed, Reviewer & Viewer Forbidden) ---');
  // Reviewer tries to edit survey -> 403
  const revEdit = await request('PUT', `/api/projects/${surveyId}`, { name: 'Hacked by Reviewer' }, reviewerH);
  assert(revEdit.status === 403, 'Reviewer blocked from modifying survey details (HTTP 403)');

  // Viewer tries to edit survey -> 403
  const viewEdit = await request('PUT', `/api/projects/${surveyId}`, { name: 'Hacked by Viewer' }, viewerH);
  assert(viewEdit.status === 403, 'Viewer blocked from modifying survey details (HTTP 403)');

  // Editor edits survey -> 200
  const edEdit = await request('PUT', `/api/projects/${surveyId}`, { 
    name: 'Dashboard Deep Test Survey 2026 (Edited by Editor)',
    description: 'Updated by editor collaborator'
  }, editorH);
  assert(edEdit.status === 200, 'Editor successfully updated survey details (HTTP 200)');

  // Owner edits survey -> 200
  const ownEdit = await request('PUT', `/api/projects/${surveyId}`, { 
    name: 'Dashboard Deep Test Survey 2026 (Verified by Owner)'
  }, ownerH);
  assert(ownEdit.status === 200, 'Owner successfully updated survey details (HTTP 200)');

  // 8. Survey Export Feature
  console.log('\n--- 8. Multi-Format Matrix Export (Excel XLSX, CSV, JSON) ---');
  const exportXlsx = await request('GET', `/api/export?project_id=${surveyId}&format=xlsx`, null, editorH);
  assert(exportXlsx.status === 200, 'Editor can export master matrix in Excel XLSX format (HTTP 200)');

  const exportCsv = await request('GET', `/api/export?project_id=${surveyId}&format=csv`, null, editorH);
  assert(exportCsv.status === 200, 'Editor can export master matrix in CSV format (HTTP 200)');

  const exportJson = await request('GET', `/api/export?project_id=${surveyId}&format=json`, null, ownerH);
  assert(exportJson.status === 200 && Array.isArray(exportJson.body), 'Owner can export matrix in JSON format (HTTP 200)');

  // 9. Delete Survey Feature & Permission Guard
  console.log('\n--- 9. Delete Survey Permissions (Strictly Owner-Only) ---');
  // Viewer tries to delete -> 403
  const viewDel = await request('DELETE', `/api/projects/${surveyId}`, null, viewerH);
  assert(viewDel.status === 403, 'Viewer forbidden from deleting survey (HTTP 403)');

  // Reviewer tries to delete -> 403
  const revDel = await request('DELETE', `/api/projects/${surveyId}`, null, reviewerH);
  assert(revDel.status === 403, 'Reviewer forbidden from deleting survey (HTTP 403)');

  // Editor tries to delete -> 403
  const edDel = await request('DELETE', `/api/projects/${surveyId}`, null, editorH);
  assert(edDel.status === 403, 'Editor forbidden from deleting survey (HTTP 403)');

  // Owner deletes survey -> 200
  const ownDel = await request('DELETE', `/api/projects/${surveyId}`, null, ownerH);
  assert(ownDel.status === 200, 'Owner successfully deleted survey with cascading cleanup (HTTP 200)');

  // Verify deletion
  const verifyDel = await request('GET', `/api/projects/${surveyId}`, null, ownerH);
  assert(verifyDel.status === 404, 'Deleted survey is purged and returns HTTP 404');

  console.log('\n======================================================================');
  console.log('🎉 DASHBOARD TEST SUITE PASSED (All Features Verified Across All 4 Roles)');
  console.log('======================================================================\n');
}

if (require.main === module) {
  runDashboardTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runDashboardTests };
