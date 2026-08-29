const assert = require('assert');
const http = require('http');
const app = require('../server');
const { getDb, hashPassword } = require('../src/db');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function ensureDatabaseUsers() {
  const db = getDb();
  const testUsers = [
    { username: 'ownerUser', email: 'own_user@mail.com', name: 'Main Owner User', role: 'user' },
    { username: 'editorUser', email: 'edit_user@mail.com', name: 'Editor User', role: 'user' },
    { username: 'reviewerUser', email: 'review_user@mail.com', name: 'Reviewer User', role: 'user' },
    { username: 'viewerUser', email: 'view_user@mail.com', name: 'Viewer User', role: 'user' },
    { username: 'adminUser', email: 'admin@litnexis.ac', name: 'System Administrator', role: 'admin' }
  ];

  const defaultPassword = 'password123';
  const passHash = hashPassword(defaultPassword);

  for (const u of testUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(u.email.toLowerCase(), u.username.toLowerCase());
    if (!existing) {
      db.prepare(`
        INSERT INTO users (username, name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, 'Academic Testing Institute', 'active', 150000, 1000)
      `).run(u.username, u.name, u.email, u.email === 'admin@litnexis.ac' ? hashPassword('admin123') : passHash, u.role);
    } else {
      db.prepare(`
        UPDATE users SET username = ?, name = ?, password_hash = ?, status = 'active', role = ?
        WHERE id = ?
      `).run(u.username, u.name, u.email === 'admin@litnexis.ac' ? hashPassword('admin123') : passHash, u.role, existing.id);
    }
  }
}

async function runFullAppE2ETesting() {
  console.log('======================================================================');
  console.log('🧪 COMPREHENSIVE MULTI-ROLE FULL-APP & MODAL UNIT & INTEGRATION SUITE');
  console.log('======================================================================');
  console.log('Rules Enforced:');
  console.log('  🚫 Always Skipping: Homepage (/) | About Page (/about) | Footer');
  console.log('  🎯 Active Target Scopes:');
  console.log('     1. Auth & Session Management (/api/auth)');
  console.log('     2. Researcher Dashboard (/api/projects & /api/user/dashboard-stats)');
  console.log('     3. Master Workspace, Matrix & Modals (Clusters, Columns, Papers, Team, PRISMA, Comments)');
  console.log('     4. Researcher Profile & Account Settings (/api/auth/profile & /api/auth/password)');
  console.log('     5. System Admin Control Center (/api/admin)\n');

  ensureDatabaseUsers();

  const port = 5400 + Math.floor(Math.random() * 400);
  server = app.listen(port);
  baseUrl = `http://localhost:${port}`;
  await new Promise(r => setTimeout(r, 200));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}\n`);
      failed++;
    }
  }

  try {
    let ownerToken = '';
    let editorToken = '';
    let reviewerToken = '';
    let viewerToken = '';
    let adminToken = '';

    let testProjectId = null;
    let testClusterId = null;
    let testColumnId = null;
    let testSubCol1Id = null;
    let testSubCol2Id = null;
    let testPaperId = null;
    let testCommentId = null;

    // =========================================================================
    // MODULE 1: AUTHENTICATION & SESSION FLOW (Auth Page / Modals)
    // =========================================================================
    console.log('\n--- 1. Authentication, Sessions & Security (Auth Page & Modals) ---');

    await test('1.1 Registration validation: Rejects duplicate email (HTTP 409)', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'unique_user_99',
        email: 'own_user@mail.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      assert.strictEqual(res.status, 409);
      assert.ok(res.body.error.includes('already exists'));
    });

    await test('1.2 Registration validation: Rejects short password < 6 chars (HTTP 400)', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'short_pass_user',
        email: 'short_pass@mail.com',
        password: '123',
        confirmPassword: '123'
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('at least 6 characters'));
    });

    await test('1.3 Registration validation: Rejects password mismatch (HTTP 400)', async () => {
      const res = await makeRequest('POST', '/api/auth/register', {
        username: 'mismatch_user',
        email: 'mismatch@mail.com',
        password: 'password123',
        confirmPassword: 'differentPassword123'
      });
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.error.includes('do not match'));
    });

    await test('1.4 Main User login via Email (own_user@mail.com)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'own_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.username, 'ownerUser');
      ownerToken = res.body.token;
    });

    await test('1.5 Editor User login via Email (edit_user@mail.com)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'edit_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.username, 'editorUser');
      editorToken = res.body.token;
    });

    await test('1.6 Reviewer User login via Email (review_user@mail.com)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'review_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.username, 'reviewerUser');
      reviewerToken = res.body.token;
    });

    await test('1.7 Viewer User login via Email (view_user@mail.com)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'view_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.username, 'viewerUser');
      viewerToken = res.body.token;
    });

    await test('1.8 Admin User login (admin@litnexis.ac / admin123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'admin@litnexis.ac',
        password: 'admin123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'admin');
      adminToken = res.body.token;
    });

    await test('1.9 GET /api/auth/me returns accurate profile payload for all authenticated users', async () => {
      for (const [name, token, expectedUser] of [
        ['Owner', ownerToken, 'ownerUser'],
        ['Editor', editorToken, 'editorUser'],
        ['Reviewer', reviewerToken, 'reviewerUser'],
        ['Viewer', viewerToken, 'viewerUser'],
        ['Admin', adminToken, 'adminUser']
      ]) {
        const res = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${token}` });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.user.username, expectedUser, `Username match for ${name}`);
        assert.ok(res.body.user.ai_token_quota > 0);
      }
    });

    // =========================================================================
    // MODULE 2: USER PROFILE & ACCOUNT PREFERENCES (Profile Page)
    // =========================================================================
    console.log('\n--- 2. Researcher Profile & Preferences (Profile Page) ---');

    await test('2.1 Update profile bio, institution, ORCID, and scholar link (PUT /api/auth/profile)', async () => {
      const res = await makeRequest('PUT', '/api/auth/profile', {
        name: 'Lead Principal Investigator',
        email: 'own_user@mail.com',
        institution: 'Genomics & AI Research Lab',
        bio: 'Benchmarking feature selection in ultra-high dimensional cancer datasets.',
        orcid: '0000-0002-1825-0097',
        google_scholar: 'https://scholar.google.com/citations?user=test_owner'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.name, 'Lead Principal Investigator');
      assert.strictEqual(res.body.user.orcid, '0000-0002-1825-0097');
    });

    await test('2.2 Password change flow (PUT /api/auth/password) and verification', async () => {
      // Change to temp password
      const changeRes = await makeRequest('PUT', '/api/auth/password', {
        currentPassword: 'password123',
        newPassword: 'newSecurePassword2026!'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(changeRes.status, 200);

      // Verify login with new password
      const verifyLogin = await makeRequest('POST', '/api/auth/login', {
        email: 'own_user@mail.com',
        password: 'newSecurePassword2026!'
      });
      assert.strictEqual(verifyLogin.status, 200);
      ownerToken = verifyLogin.body.token; // Refresh token

      // Revert back cleanly to password123 for test reproducibility
      const revertRes = await makeRequest('PUT', '/api/auth/password', {
        currentPassword: 'newSecurePassword2026!',
        newPassword: 'password123'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(revertRes.status, 200);

      const restoreLogin = await makeRequest('POST', '/api/auth/login', {
        email: 'own_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(restoreLogin.status, 200);
      ownerToken = restoreLogin.body.token;
    });

    await test('2.3 Real-time PDF Document Storage Telemetry (GET /api/auth/storage-stats)', async () => {
      const res = await makeRequest('GET', '/api/auth/storage-stats', null, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.storage_quota_mb >= 500);
      assert.ok(typeof res.body.storage_used_mb === 'number');
      assert.ok(Array.isArray(res.body.projects_breakdown));
    });

    await test('2.4 Multi-Device Session Revocation (POST /api/auth/revoke-sessions)', async () => {
      const oldToken = ownerToken;
      const res = await makeRequest('POST', '/api/auth/revoke-sessions', null, { 'Authorization': `Bearer ${oldToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      assert.notStrictEqual(res.body.token, oldToken);
      ownerToken = res.body.token; // Update to fresh token

      // Verify old token is now strictly revoked (HTTP 401)
      const oldTokenCheck = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${oldToken}` });
      assert.strictEqual(oldTokenCheck.status, 401);
      assert.ok(oldTokenCheck.body.error.includes('revoked'));

      // Verify new token works normally (HTTP 200)
      const newTokenCheck = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(newTokenCheck.status, 200);
    });

    // =========================================================================
    // MODULE 3: RESEARCHER DASHBOARD (Dashboard Page)
    // =========================================================================
    console.log('\n--- 3. Researcher Dashboard, Surveys & Templates (Dashboard Page) ---');

    await test('3.1 Dashboard stats returns aggregated metrics for Owner', async () => {
      const res = await makeRequest('GET', '/api/user/dashboard-stats', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(typeof res.body.total_surveys, 'number');
      assert.strictEqual(typeof res.body.completion_rate, 'number');
    });

    await test('3.2 Templates API: Fetch list of master domain templates', async () => {
      const res = await makeRequest('GET', '/api/templates', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 200);
      const list = res.body.templates || res.body;
      assert.ok(Array.isArray(list));
      assert.ok(list.length >= 1);
    });

    await test('3.3 Owner creates new systematic review survey from Dashboard modal', async () => {
      const res = await makeRequest('POST', '/api/projects', {
        name: 'Cancer Genomics Systematic Review 2026',
        description: 'Comprehensive taxonomy comparing Filter, Wrapper, Embedded, and Deep feature selection.'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id > 0);
      testProjectId = res.body.id;
    });

    // =========================================================================
    // MODULE 4: WORKSPACE MATRIX, CLUSTERS, COLUMNS & PAPERS (Workspace & Modals)
    // =========================================================================
    console.log('\n--- 4. Master Workspace Hierarchy, Matrix & Modals (Workspace Page) ---');

    await test('4.1 Add Cluster Modal: Owner creates 2 taxonomy clusters', async () => {
      const c1 = await makeRequest('POST', '/api/clusters', {
        project_id: testProjectId,
        name: 'Filter Methods (mRMR & ReliefF)',
        description: 'Mutual information, Chi-Square, and Correlation ranking algorithms',
        color: '#38bdf8'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(c1.status, 201);
      testClusterId = c1.body.id;

      const c2 = await makeRequest('POST', '/api/clusters', {
        project_id: testProjectId,
        name: 'Metaheuristic Swarm Wrappers (PSO & GA)',
        description: 'Binary Particle Swarm Optimization and Genetic Algorithms',
        color: '#a855f7'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(c2.status, 201);
    });

    await test('4.2 Add Column & Split Column Modal: Owner creates and splits dynamic columns', async () => {
      // Add parent column
      const colRes = await makeRequest('POST', '/api/dynamic-columns', {
        cluster_id: testClusterId,
        column_name: 'Computational Complexity'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(colRes.status, 201);
      testColumnId = colRes.body.id;

      // Split into Time Complexity (TC) and Space Complexity (SC)
      const splitRes = await makeRequest('POST', '/api/dynamic-columns/split', {
        cluster_id: testClusterId,
        parent_column_name: 'Computational Complexity',
        sub_columns: ['Time Complexity (TC)', 'Space Complexity (SC)']
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(splitRes.status, 201);
      assert.strictEqual(splitRes.body.sub_columns.length, 2);

      // Verify columns for cluster
      const listCols = await makeRequest('GET', `/api/dynamic-columns?cluster_id=${testClusterId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(listCols.status, 200);
      assert.ok(listCols.body.length >= 2);
    });

    await test('4.3 Add Paper Modal: Owner creates paper with full academic metadata', async () => {
      const res = await makeRequest('POST', '/api/papers', {
        project_id: testProjectId,
        cluster_id: testClusterId,
        title: 'Feature selection based on mutual information criteria of max-dependency, max-relevance',
        authors: 'Hanchuan Peng, Fuhui Long, C. Ding',
        year: 2005,
        pub: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
        domain: 'CSC engnr',
        doi: '10.1109/TPAMI.2005.159',
        status: 'unread',
        intuition: 'Proposes max-dependency, max-relevance, and min-redundancy criteria.',
        equation: 'max_{S} \\left[ \\frac{1}{|S|} \\sum_{x_i \\in S} I(x_i; y) - \\frac{1}{|S|^2} \\sum_{x_i, x_j \\in S} I(x_i; x_j) \\right]',
        strengths: ['Effective for high-dimensional microarray data', 'Information-theoretic grounded'],
        gaps: ['Continuous feature discretization sensitivity']
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
      testPaperId = res.body.id;
    });

    await test('4.4 Team Collaborators Modal: Owner invites Editor, Reviewer, and Viewer', async () => {
      // Invite Editor
      const invEdit = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'edit_user@mail.com',
        role: 'editor'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invEdit.status, 201);

      // Invite Reviewer
      const invRev = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'review_user@mail.com',
        role: 'reviewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invRev.status, 201);

      // Invite Viewer
      const invView = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'view_user@mail.com',
        role: 'viewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invView.status, 201);

      // Check member roster
      const roster = await makeRequest('GET', `/api/projects/${testProjectId}/members`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(roster.status, 200);
      assert.strictEqual(roster.body.members.length, 4);
    });

    await test('4.5 Share Link Token: Generate share token and verify supervisor read-only view', async () => {
      const shareRes = await makeRequest('POST', `/api/projects/${testProjectId}/share`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(shareRes.status, 200);
      assert.ok(shareRes.body.share_token);

      const token = shareRes.body.share_token;
      const publicView = await makeRequest('GET', `/api/public/shared/${token}`);
      assert.strictEqual(publicView.status, 200);
      assert.strictEqual(publicView.body.project.name, 'Cancer Genomics Systematic Review 2026');
      assert.strictEqual(publicView.body.clusters.length, 2);
    });

    await test('4.6 Matrix Cell Editing: Editor writes extracted values via POST /api/paper-column-values', async () => {
      const res = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: testPaperId,
        column_id: testColumnId,
        value: 'O(|S| \\cdot |F|)'
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.value, 'O(|S| \\cdot |F|)');
    });

    await test('4.7 Matrix Batch Cell Editing: Editor writes multiple cell values in single batch', async () => {
      const res = await makeRequest('POST', '/api/paper-column-values/batch', {
        paper_id: testPaperId,
        values: [
          { column_name: 'Time Complexity (TC)', value: 'O(N \\cdot K)' },
          { column_name: 'Space Complexity (SC)', value: 'O(N + K)' }
        ]
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('4.8 Edit Paper Modal: Editor updates reading status to in_progress (PUT /api/papers/:id)', async () => {
      const res = await makeRequest('PUT', `/api/papers/${testPaperId}`, {
        status: 'in_progress',
        intuition: 'Optimized minimum redundancy maximum relevance implementation with incremental mutual info estimation.'
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'in_progress');
    });

    await test('4.9 PRISMA Blind Screening Modal: Reviewer submits inclusion vote with criteria reason', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/screening`, {
        decision: 'included',
        reason: 'Meets benchmark sample size and cross-validated gene ranking protocol',
        notes: 'High empirical quality score on micro-array benchmarks.'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.decision, 'included');
      assert.strictEqual(res.body.reason, 'Meets benchmark sample size and cross-validated gene ranking protocol');

      // Fetch screening history
      const listScreen = await makeRequest('GET', `/api/papers/${testPaperId}/screening`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(listScreen.status, 200);
      assert.ok(listScreen.body.decisions.length >= 1);
    });

    await test('4.10 Comments & Annotations Modal: Reviewer leaves quote annotation & comment', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/comments`, {
        comment_text: 'Verify whether mutual information estimation uses Kraskov k-NN estimator for continuous gene expressions.',
        quote_text: 'max_{S} \\left[ \\frac{1}{|S|} \\sum I(x_i; y) \\right]',
        page_number: 2
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.comment.id);
      testCommentId = res.body.comment.id;

      // Fetch comments timeline
      const listComments = await makeRequest('GET', `/api/papers/${testPaperId}/comments`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(listComments.status, 200);
      assert.strictEqual(listComments.body.comments.length, 1);
    });

    await test('4.11 Comments Modal: Reviewer deletes their own comment cleanly', async () => {
      const res = await makeRequest('DELETE', `/api/papers/comments/${testCommentId}`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.message, 'Comment deleted successfully.');
    });

    await test('4.12 Synthesis & Insights: Fetch cluster insights and synthesis markdown summary', async () => {
      const clusterInsights = await makeRequest('GET', `/api/clusters/${testClusterId}/insights`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(clusterInsights.status, 200);

      const summary = await makeRequest('GET', `/api/synthesis/summary?project_id=${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(summary.status, 200);
      assert.ok(summary.body.synthesis_markdown);
    });

    await test('4.13 Export Modal: Multi-format export (JSON, CSV, Excel XLSX)', async () => {
      // JSON export
      const jsonExp = await makeRequest('GET', `/api/export?project_id=${testProjectId}&format=json`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(jsonExp.status, 200);
      assert.ok(Array.isArray(jsonExp.body));
      assert.ok(jsonExp.body.length >= 1);

      // CSV export
      const csvExp = await makeRequest('GET', `/api/export?project_id=${testProjectId}&format=csv`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(csvExp.status, 200);
      assert.ok(typeof csvExp.body === 'string' && csvExp.body.includes('Paper Title'));

      // XLSX export
      const xlsxExp = await makeRequest('GET', `/api/export?project_id=${testProjectId}&format=xlsx`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(xlsxExp.status, 200);
    });

    // =========================================================================
    // MODULE 5: SYSTEM ADMIN CONTROL CENTER (Admin Page & Maintenance)
    // =========================================================================
    console.log('\n--- 5. Admin Control Center, Telemetry & Guardrails (Admin Page) ---');

    await test('5.1 RBAC Guard: Non-admin (ownerUser) blocked from /api/admin (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/api/admin/users', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 403);
    });

    await test('5.2 Admin accesses system health telemetry (/api/admin/system/health)', async () => {
      const res = await makeRequest('GET', '/api/admin/system/health', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.db_counts.users >= 4);
      assert.ok(res.body.memory.heapUsed > 0);
    });

    await test('5.3 Admin accesses user list & manages quotas (/api/admin/users)', async () => {
      const res = await makeRequest('GET', '/api/admin/users', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.users));

      // Update quota for editorUser
      const target = res.body.users.find(u => u.username === 'editorUser');
      assert.ok(target);

      const quotaRes = await makeRequest('PUT', `/api/admin/users/${target.id}/quota`, {
        ai_token_quota: 250000,
        storage_quota_mb: 1024
      }, { 'Authorization': `Bearer ${adminToken}` });
      assert.strictEqual(quotaRes.status, 200);
      assert.strictEqual(quotaRes.body.user.ai_token_quota, 250000);
    });

    await test('5.4 Maintenance Mode: Admin toggles ON and non-admin requests are intercepted with HTTP 503', async () => {
      // Toggle Maintenance ON
      const toggleOn = await makeRequest('POST', '/api/admin/system/maintenance', {
        enabled: true,
        message: 'Under scheduled system audit.'
      }, { 'Authorization': `Bearer ${adminToken}` });
      assert.strictEqual(toggleOn.status, 200);

      // Verify non-admin gets 503
      const blocked = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(blocked.status, 503);
      assert.strictEqual(blocked.body.maintenance_active, true);

      // Verify admin bypasses maintenance mode
      const adminPass = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(adminPass.status, 200);

      // Toggle Maintenance OFF
      const toggleOff = await makeRequest('POST', '/api/admin/system/maintenance', {
        enabled: false
      }, { 'Authorization': `Bearer ${adminToken}` });
      assert.strictEqual(toggleOff.status, 200);

      // Verify normal access restored
      const restored = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(restored.status, 200);
    });

    await test('5.5 Admin accesses audit security logs (/api/admin/audit-logs)', async () => {
      const res = await makeRequest('GET', '/api/admin/audit-logs', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.logs));
      assert.ok(res.body.logs.length >= 1);
    });

    // =========================================================================
    // MODULE 6: TEARDOWN & REPOSITORY INTEGRITY
    // =========================================================================
    console.log('\n--- 6. Cleanup & Cascading Teardown ---');

    await test('6.1 Owner deletes test survey with cascading deletion of clusters, columns, papers', async () => {
      const res = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 FULL E2E SUITE RESULT: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runFullAppE2ETesting();
}

module.exports = { runFullAppE2ETesting };
