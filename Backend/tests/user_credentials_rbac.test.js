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

function ensureTestUsers() {
  const db = getDb();
  const testUsers = [
    { username: 'ownerUser', email: 'own_user@mail.com', name: 'Main Owner User', role: 'user' },
    { username: 'editorUser', email: 'edit_user@mail.com', name: 'Editor User', role: 'user' },
    { username: 'reviewerUser', email: 'review_user@mail.com', name: 'Reviewer User', role: 'user' },
    { username: 'viewerUser', email: 'view_user@mail.com', name: 'Viewer User', role: 'user' }
  ];

  const defaultPassword = 'password123';
  const passHash = hashPassword(defaultPassword);

  for (const u of testUsers) {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(u.email.toLowerCase(), u.username.toLowerCase());
    if (!existing) {
      db.prepare(`
        INSERT INTO users (username, name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, 'Academic Testing Lab', 'active', 100000, 500)
      `).run(u.username, u.name, u.email, passHash, u.role);
    } else {
      db.prepare(`
        UPDATE users SET username = ?, name = ?, password_hash = ?, status = 'active'
        WHERE id = ?
      `).run(u.username, u.name, passHash, existing.id);
    }
  }
}

async function runUserCredentialsTestSuite() {
  console.log('======================================================================');
  console.log('🧪 MULTI-USER CREDENTIALS & FINE-GRAINED RBAC UNIT/INTEGRATION SUITE');
  console.log('======================================================================\n');
  console.log('Target Users:');
  console.log('  1. Main User (Owner):    username: ownerUser    | email: own_user@mail.com');
  console.log('  2. Editor:               username: editorUser   | email: edit_user@mail.com');
  console.log('  3. Reviewer:             username: reviewerUser | email: review_user@mail.com');
  console.log('  4. Viewer:               username: viewerUser   | email: view_user@mail.com\n');

  ensureTestUsers();

  const port = 5200 + Math.floor(Math.random() * 500);
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

    let ownerUser = null;
    let editorUser = null;
    let reviewerUser = null;
    let viewerUser = null;

    let testProjectId = null;
    let testClusterId = null;
    let testColumnId = null;
    let testPaperId = null;

    // =========================================================================
    // SECTION 1: AUTHENTICATION VIA EMAIL & USERNAME FOR ALL 4 USERS
    // =========================================================================
    console.log('--- 1. Authentication & Profile Verification for 4 User Roles ---');

    // 1.1 Main User Login via Email
    await test('1.1 Main User login via Email (own_user@mail.com / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'own_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token, 'Token must be returned');
      assert.strictEqual(res.body.user.email, 'own_user@mail.com');
      assert.strictEqual(res.body.user.username, 'ownerUser');
      ownerToken = res.body.token;
      ownerUser = res.body.user;
    });

    // 1.2 Main User Login via Username
    await test('1.2 Main User login via Username (ownerUser / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'ownerUser',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
    });

    // 1.3 Editor Login via Email
    await test('1.3 Editor User login via Email (edit_user@mail.com / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'edit_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'edit_user@mail.com');
      assert.strictEqual(res.body.user.username, 'editorUser');
      editorToken = res.body.token;
      editorUser = res.body.user;
    });

    // 1.4 Editor Login via Username
    await test('1.4 Editor User login via Username (editorUser / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'editorUser',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
    });

    // 1.5 Reviewer Login via Email
    await test('1.5 Reviewer User login via Email (review_user@mail.com / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'review_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'review_user@mail.com');
      assert.strictEqual(res.body.user.username, 'reviewerUser');
      reviewerToken = res.body.token;
      reviewerUser = res.body.user;
    });

    // 1.6 Reviewer Login via Username
    await test('1.6 Reviewer User login via Username (reviewerUser / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'reviewerUser',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
    });

    // 1.7 Viewer Login via Email
    await test('1.7 Viewer User login via Email (view_user@mail.com / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'view_user@mail.com',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'view_user@mail.com');
      assert.strictEqual(res.body.user.username, 'viewerUser');
      viewerToken = res.body.token;
      viewerUser = res.body.user;
    });

    // 1.8 Viewer Login via Username
    await test('1.8 Viewer User login via Username (viewerUser / password123)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        username: 'viewerUser',
        password: 'password123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
    });

    // 1.9 Profile Verification (GET /api/auth/me)
    await test('1.9 GET /api/auth/me profile verification for all 4 accounts', async () => {
      const meOwner = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(meOwner.status, 200);
      assert.strictEqual(meOwner.body.user.username, 'ownerUser');

      const meEditor = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(meEditor.status, 200);
      assert.strictEqual(meEditor.body.user.username, 'editorUser');

      const meReviewer = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(meReviewer.status, 200);
      assert.strictEqual(meReviewer.body.user.username, 'reviewerUser');

      const meViewer = await makeRequest('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${viewerToken}` });
      assert.strictEqual(meViewer.status, 200);
      assert.strictEqual(meViewer.body.user.username, 'viewerUser');
    });

    // 1.10 Invalid Credentials Protection
    await test('1.10 Auth Guard: Rejects wrong password with HTTP 401 Unauthorized', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'own_user@mail.com',
        password: 'WrongPassword999!'
      });
      assert.strictEqual(res.status, 401);
      assert.ok(res.body.error);
    });

    // =========================================================================
    // SECTION 2: PROJECT CREATION & TEAM INVITATIONS BY OWNER
    // =========================================================================
    console.log('\n--- 2. Project Hierarchy Creation & Multi-User Invitations by Owner ---');

    // 2.1 Owner creates project
    await test('2.1 Owner creates research project', async () => {
      const res = await makeRequest('POST', '/api/projects', {
        name: 'Genomic Biomarker Feature Selection Benchmark',
        description: 'Empirical PRISMA systematic literature survey'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
      testProjectId = res.body.id;
    });

    // 2.2 Owner creates taxonomy cluster
    await test('2.2 Owner creates taxonomy cluster (Filter Methods)', async () => {
      const res = await makeRequest('POST', '/api/clusters', {
        project_id: testProjectId,
        name: 'Filter Methods (mRMR & ReliefF)',
        description: 'Mutual information and correlation ranking algorithms',
        color: '#38bdf8'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
      testClusterId = res.body.id;
    });

    // 2.3 Owner creates dynamic column
    await test('2.3 Owner creates dynamic column & splits into sub-columns', async () => {
      const colRes = await makeRequest('POST', '/api/dynamic-columns', {
        cluster_id: testClusterId,
        column_name: 'Computational Complexity'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(colRes.status, 201);
      testColumnId = colRes.body.id;

      // Split column into Time Complexity (TC) and Space Complexity (SC)
      const splitRes = await makeRequest('POST', '/api/dynamic-columns/split', {
        cluster_id: testClusterId,
        parent_column_name: 'Computational Complexity',
        sub_columns: ['Time Complexity (TC)', 'Space Complexity (SC)']
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(splitRes.status, 201);
      assert.strictEqual(splitRes.body.sub_columns.length, 2);
    });

    // 2.4 Owner ingests/creates research paper
    await test('2.4 Owner creates and assigns paper to cluster', async () => {
      const res = await makeRequest('POST', '/api/papers', {
        project_id: testProjectId,
        cluster_id: testClusterId,
        title: 'Feature selection based on mutual information criteria of max-dependency, max-relevance',
        authors: 'Hanchuan Peng, Fuhui Long, C. Ding',
        year: 2005,
        pub: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
        domain: 'CSC engnr',
        doi: '10.1109/TPAMI.2005.159',
        status: 'unread'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.id);
      testPaperId = res.body.id;
    });

    // 2.5 Owner invites Editor, Reviewer, and Viewer with explicit roles
    await test('2.5 Owner invites editorUser, reviewerUser, and viewerUser', async () => {
      // Invite editor
      const invEditor = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'edit_user@mail.com',
        role: 'editor'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invEditor.status, 201);
      assert.strictEqual(invEditor.body.role, 'editor');

      // Invite reviewer
      const invReviewer = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'review_user@mail.com',
        role: 'reviewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invReviewer.status, 201);
      assert.strictEqual(invReviewer.body.role, 'reviewer');

      // Invite viewer
      const invViewer = await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
        email: 'view_user@mail.com',
        role: 'viewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invViewer.status, 201);
      assert.strictEqual(invViewer.body.role, 'viewer');

      // Verify membership list contains all 4 members
      const mList = await makeRequest('GET', `/api/projects/${testProjectId}/members`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(mList.status, 200);
      assert.ok(mList.body.members.some(m => m.email === 'edit_user@mail.com' && m.project_role === 'editor'));
      assert.ok(mList.body.members.some(m => m.email === 'review_user@mail.com' && m.project_role === 'reviewer'));
      assert.ok(mList.body.members.some(m => m.email === 'view_user@mail.com' && m.project_role === 'viewer'));
    });

    // =========================================================================
    // SECTION 3: EDITOR USER PERMISSIONS & RESTRICTIONS
    // =========================================================================
    console.log('\n--- 3. Editor User Permissions & Enforcement ---');

    // 3.1 Editor can update paper details
    await test('3.1 Editor can edit paper core metadata (status, intuition, strengths)', async () => {
      const res = await makeRequest('PUT', `/api/papers/${testPaperId}`, {
        status: 'in_progress',
        intuition: 'Combines max-relevance and min-redundancy to filter redundant biomarkers.',
        strengths: ['Robust across microarray and RNA-seq high-dimensional data']
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'in_progress');
    });

    // 3.2 Editor can edit dynamic cell values
    await test('3.2 Editor can write extracted column values (O(N*K))', async () => {
      const res = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: testPaperId,
        column_id: testColumnId,
        value: 'O(|S| \\cdot |F|)'
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.value, 'O(|S| \\cdot |F|)');
    });

    // 3.3 Editor restriction: Cannot delete the project
    await test('3.3 RBAC Guard: Editor forbidden from deleting project (HTTP 403)', async () => {
      const res = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${editorToken}`
      });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes('Only the project Owner'));
    });

    // =========================================================================
    // SECTION 4: REVIEWER USER PERMISSIONS & RESTRICTIONS
    // =========================================================================
    console.log('\n--- 4. Reviewer User Permissions & Enforcement ---');

    // 4.1 Reviewer can submit blind PRISMA screening decision
    await test('4.1 Reviewer can submit PRISMA blind screening vote (included + reason)', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/screening`, {
        decision: 'included',
        reason: 'Meets benchmark sample size and reproducible validation protocol',
        notes: 'High empirical quality score.'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.decision, 'included');
      assert.strictEqual(res.body.reason, 'Meets benchmark sample size and reproducible validation protocol');
    });

    // 4.2 Reviewer can retrieve screening decisions
    await test('4.2 Reviewer can fetch screening decisions timeline', async () => {
      const res = await makeRequest('GET', `/api/papers/${testPaperId}/screening`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.decisions.length >= 1);
      assert.strictEqual(res.body.decisions[0].decision, 'included');
    });

    // 4.3 Reviewer can post annotations and comments
    await test('4.3 Reviewer can add peer review annotation and quote comment', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/comments`, {
        comment_text: 'Please confirm if runtime scales quadratically when gene count > 20,000.',
        quote_text: 'O(|S| \\cdot |F|)',
        page_number: 3
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.comment.id);
      assert.strictEqual(res.body.comment.quote_text, 'O(|S| \\cdot |F|)');
    });

    // 4.4 Reviewer restriction: Cannot mutate extracted matrix cell values
    await test('4.4 RBAC Guard: Reviewer forbidden from editing cell values (HTTP 403)', async () => {
      const res = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: testPaperId,
        column_id: testColumnId,
        value: 'Unauthorized Mutation By Reviewer'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes('Access Denied'));
    });

    // 4.5 Reviewer restriction: Cannot edit paper core metadata
    await test('4.5 RBAC Guard: Reviewer forbidden from updating paper metadata (HTTP 403)', async () => {
      const res = await makeRequest('PUT', `/api/papers/${testPaperId}`, {
        title: 'Tampered Title by Reviewer'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes('Access Denied'));
    });

    // 4.6 Reviewer restriction: Cannot delete paper or project
    await test('4.6 RBAC Guard: Reviewer forbidden from deleting paper/project (HTTP 403)', async () => {
      const delPaper = await makeRequest('DELETE', `/api/papers/${testPaperId}`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(delPaper.status, 403);

      const delProj = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${reviewerToken}`
      });
      assert.strictEqual(delProj.status, 403);
    });

    // =========================================================================
    // SECTION 5: VIEWER USER PERMISSIONS & RESTRICTIONS
    // =========================================================================
    console.log('\n--- 5. Viewer User Permissions & Enforcement ---');

    // 5.1 Viewer can read project details & matrix
    await test('5.1 Viewer can read project hierarchy and cluster list', async () => {
      const res = await makeRequest('GET', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${viewerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, testProjectId);
      assert.strictEqual(res.body.clusters.length, 1);
    });

    // 5.2 Viewer can read papers
    await test('5.2 Viewer can read papers in project', async () => {
      const res = await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, {
        'Authorization': `Bearer ${viewerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.strictEqual(res.body.length, 1);
    });

    // 5.3 Viewer restriction: Cannot edit cell values
    await test('5.3 RBAC Guard: Viewer forbidden from modifying cell values (HTTP 403)', async () => {
      const res = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: testPaperId,
        column_id: testColumnId,
        value: 'Unauthorized Mutation By Viewer'
      }, { 'Authorization': `Bearer ${viewerToken}` });
      assert.strictEqual(res.status, 403);
    });

    // 5.4 Viewer restriction: Cannot submit PRISMA screening decision
    await test('5.4 RBAC Guard: Viewer forbidden from submitting screening vote (HTTP 403)', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/screening`, {
        decision: 'excluded',
        reason: 'Attempted viewer override'
      }, { 'Authorization': `Bearer ${viewerToken}` });
      assert.strictEqual(res.status, 403);
    });

    // 5.5 Viewer restriction: Cannot post review comments
    await test('5.5 RBAC Guard: Viewer forbidden from posting comments (HTTP 403)', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/comments`, {
        comment_text: 'Viewer unauthorized comment'
      }, { 'Authorization': `Bearer ${viewerToken}` });
      assert.strictEqual(res.status, 403);
    });

    // =========================================================================
    // SECTION 6: DASHBOARD STATS & SYNTHESIS FOR ALL ROLES
    // =========================================================================
    console.log('\n--- 6. Dashboard Stats & Cross-Role Metrics ---');

    await test('6.1 Owner dashboard stats reflects created survey & paper', async () => {
      const res = await makeRequest('GET', '/api/user/dashboard-stats', null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.total_surveys >= 1);
      assert.ok(res.body.total_papers >= 1);
    });

    await test('6.2 Editor dashboard stats reflects shared survey membership', async () => {
      const res = await makeRequest('GET', '/api/user/dashboard-stats', null, {
        'Authorization': `Bearer ${editorToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.total_surveys >= 1);
    });

    // =========================================================================
    // SECTION 7: CLEANUP & TEARDOWN
    // =========================================================================
    console.log('\n--- 7. Cleanup & Project Deletion by Owner ---');

    await test('7.1 Owner can delete the test project cleanly', async () => {
      const res = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('7.2 Deleted project is no longer accessible (HTTP 404)', async () => {
      const res = await makeRequest('GET', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(res.status, 404);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runUserCredentialsTestSuite();
}

module.exports = { runUserCredentialsTestSuite };
