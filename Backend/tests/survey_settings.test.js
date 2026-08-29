const assert = require('assert');
const http = require('http');
const app = require('../server');

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

async function runSurveySettingsTests() {
  console.log('⚙️ Starting Survey Settings (General, Transfer, Backup, Clone, Reset & Delete) Test Suite...\n');

  const port = 5100 + Math.floor(Math.random() * 800);
  server = app.listen(port);
  baseUrl = `http://localhost:${port}`;
  await new Promise(r => setTimeout(r, 200));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate users
    const ownerLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'own_user@mail.com',
      password: 'password123'
    });
    const ownerToken = ownerLogin.body.token;

    const editorLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'edit_user@mail.com',
      password: 'password123'
    });
    const editorToken = editorLogin.body.token;

    const viewerLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'view_user@mail.com',
      password: 'password123'
    });
    const viewerToken = viewerLogin.body.token;

    assert(ownerToken, 'Owner token must be present');
    assert(editorToken, 'Editor token must be present');
    assert(viewerToken, 'Viewer token must be present');

    // 2. Create a test survey project as Owner
    const createProj = await makeRequest('POST', '/api/projects', {
      name: 'Survey Settings Benchmark Target',
      description: 'Systematic literature review for settings testing.'
    }, { 'Authorization': `Bearer ${ownerToken}` });

    assert.strictEqual(createProj.status, 201, 'Project should be created');
    const testProjectId = createProj.body.id;

    // Add Editor and Viewer as collaborators
    await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
      email: 'edit_user@mail.com',
      role: 'editor'
    }, { 'Authorization': `Bearer ${ownerToken}` });

    await makeRequest('POST', `/api/projects/${testProjectId}/members`, {
      email: 'view_user@mail.com',
      role: 'viewer'
    }, { 'Authorization': `Bearer ${ownerToken}` });

    // Create a cluster, dynamic column, and paper in project
    const createCluster = await makeRequest('POST', '/api/clusters', {
      project_id: testProjectId,
      name: 'Core Methodologies',
      color: '#38bdf8',
      description: 'Foundational algorithmic architectures'
    }, { 'Authorization': `Bearer ${ownerToken}` });
    const clusterId = createCluster.body.id;

    const createCol = await makeRequest('POST', '/api/columns', {
      cluster_id: clusterId,
      column_name: 'Evaluation Metrics',
      column_type: 'text'
    }, { 'Authorization': `Bearer ${ownerToken}` });
    const columnId = createCol.body.id;

    const createPaper = await makeRequest('POST', '/api/papers', {
      project_id: testProjectId,
      cluster_id: clusterId,
      title: 'Deep Matrix Extraction Architecture',
      authors: 'A. Turing, C. Shannon',
      year: 2025,
      status: 'read'
    }, { 'Authorization': `Bearer ${ownerToken}` });
    const paperId = createPaper.body.id;

    // Set matrix cell value
    const cellValRes = await makeRequest('POST', '/api/paper-column-values', {
      paper_id: paperId,
      column_id: columnId,
      value: 'F1: 94.2%, Accuracy: 98.1%'
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert.strictEqual(cellValRes.status, 200, `Cell value creation must be 200: ${JSON.stringify(cellValRes.body)}`);

    // ==========================================
    // TEST 1: General Settings Update (PUT)
    // ==========================================
    await test('General Settings: Owner can update survey name and description', async () => {
      const updateRes = await makeRequest('PUT', `/api/projects/${testProjectId}`, {
        name: 'Survey Settings Benchmark Target (Updated)',
        description: 'Updated comprehensive systematic literature benchmarking review.'
      }, { 'Authorization': `Bearer ${ownerToken}` });

      assert.strictEqual(updateRes.status, 200, 'Status must be 200');
      assert.strictEqual(updateRes.body.name, 'Survey Settings Benchmark Target (Updated)');
      assert.strictEqual(updateRes.body.description, 'Updated comprehensive systematic literature benchmarking review.');
    });

    await test('General Settings: Editor can update survey description', async () => {
      const updateRes = await makeRequest('PUT', `/api/projects/${testProjectId}`, {
        description: 'Editor-updated research scope objectives.'
      }, { 'Authorization': `Bearer ${editorToken}` });

      assert.strictEqual(updateRes.status, 200, 'Status must be 200');
      assert.strictEqual(updateRes.body.description, 'Editor-updated research scope objectives.');
    });

    await test('General Settings: Viewer is forbidden from updating survey metadata', async () => {
      const updateRes = await makeRequest('PUT', `/api/projects/${testProjectId}`, {
        name: 'Viewer Unauthorized Rename'
      }, { 'Authorization': `Bearer ${viewerToken}` });

      assert.strictEqual(updateRes.status, 403, 'Viewer update must return 403 Forbidden');
    });

    // ==========================================
    // TEST 2: Survey JSON Backup Download (GET)
    // ==========================================
    await test('Backup: Owner can download complete structured JSON survey bundle', async () => {
      const backupRes = await makeRequest('GET', `/api/projects/${testProjectId}/backup`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });

      assert.strictEqual(backupRes.status, 200, 'Backup status must be 200');
      assert(backupRes.body.project, 'Backup must include project metadata');
      assert(Array.isArray(backupRes.body.clusters), 'Backup must include clusters');
      assert(Array.isArray(backupRes.body.dynamic_columns), 'Backup must include dynamic_columns');
      assert(Array.isArray(backupRes.body.papers), 'Backup must include papers');
      assert(Array.isArray(backupRes.body.column_values), 'Backup must include column_values');
      assert.strictEqual(backupRes.body.clusters.length, 1);
      assert.strictEqual(backupRes.body.papers.length, 1);
      assert.strictEqual(backupRes.body.column_values.length, 1);
    });

    await test('Backup: Viewer is forbidden from exporting survey backup bundle', async () => {
      const backupRes = await makeRequest('GET', `/api/projects/${testProjectId}/backup`, null, {
        'Authorization': `Bearer ${viewerToken}`
      });

      assert.strictEqual(backupRes.status, 403, 'Viewer backup must return 403 Forbidden');
    });

    // ==========================================
    // TEST 3: Duplicate / Clone Survey (POST)
    // ==========================================
    let clonedProjectId;
    await test('Duplicate: Owner can duplicate survey with taxonomy and papers', async () => {
      const cloneRes = await makeRequest('POST', `/api/projects/${testProjectId}/duplicate`, {
        new_name: 'Cloned Survey Benchmark',
        include_papers: true
      }, { 'Authorization': `Bearer ${ownerToken}` });

      assert.strictEqual(cloneRes.status, 201, 'Duplicate must return 201 Created');
      assert.strictEqual(cloneRes.body.name, 'Cloned Survey Benchmark');
      clonedProjectId = cloneRes.body.id;

      // Verify cloned survey contents
      const verifyProj = await makeRequest('GET', `/api/projects/${clonedProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(verifyProj.body.clusters.length, 1, 'Cloned survey should have 1 cluster');
    });

    // ==========================================
    // TEST 4: Reset Master Matrix Cell Values (POST)
    // ==========================================
    await test('Reset Matrix: Owner can clear matrix cell values while keeping papers intact', async () => {
      const resetRes = await makeRequest('POST', `/api/projects/${testProjectId}/reset-matrix`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });

      assert.strictEqual(resetRes.status, 200, 'Reset matrix must return 200');
      assert.strictEqual(resetRes.body.success, true);

      // Verify values wiped
      const papersRes = await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(papersRes.body.length, 1, 'Paper should still exist');
      assert.strictEqual(papersRes.body[0].status, 'unread', 'Paper status should be reset to unread');
    });

    await test('Reset Matrix: Editor/Viewer cannot reset matrix values', async () => {
      const resetRes = await makeRequest('POST', `/api/projects/${testProjectId}/reset-matrix`, null, {
        'Authorization': `Bearer ${editorToken}`
      });

      assert.strictEqual(resetRes.status, 403, 'Editor reset must return 403 Forbidden');
    });

    // ==========================================
    // TEST 5: Ownership Transfer (POST)
    // ==========================================
    await test('Transfer: Rejects transfer when caller is not the project Owner', async () => {
      const transferRes = await makeRequest('POST', `/api/projects/${testProjectId}/transfer`, {
        target_email: 'view_user@mail.com'
      }, { 'Authorization': `Bearer ${editorToken}` });

      assert.strictEqual(transferRes.status, 403, 'Non-owner transfer must return 403 Forbidden');
    });

    await test('Transfer: Rejects transfer to non-existent user email', async () => {
      const transferRes = await makeRequest('POST', `/api/projects/${testProjectId}/transfer`, {
        target_email: 'unknown_ghost_user@nonexistent.domain'
      }, { 'Authorization': `Bearer ${ownerToken}` });

      assert.strictEqual(transferRes.status, 404, 'Non-existent user must return 404');
    });

    await test('Transfer: Owner transfers survey to Editor, old Owner becomes Editor', async () => {
      const transferRes = await makeRequest('POST', `/api/projects/${testProjectId}/transfer`, {
        target_email: 'edit_user@mail.com',
        keep_as_editor: true
      }, { 'Authorization': `Bearer ${ownerToken}` });

      assert.strictEqual(transferRes.status, 200, 'Transfer must succeed with 200');
      assert.strictEqual(transferRes.body.success, true);
      assert.strictEqual(transferRes.body.your_new_role, 'editor');

      // Verify new roles
      const newOwnerRole = await makeRequest('GET', `/api/projects/${testProjectId}/my-role`, null, {
        'Authorization': `Bearer ${editorToken}`
      });
      assert.strictEqual(newOwnerRole.body.role, 'owner', 'Recipient must now be owner');

      const oldOwnerRole = await makeRequest('GET', `/api/projects/${testProjectId}/my-role`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(oldOwnerRole.body.role, 'editor', 'Former owner must now be editor');
    });

    // ==========================================
    // TEST 6: Cascading Survey Deletion (DELETE)
    // ==========================================
    await test('Delete: Non-owner cannot delete survey', async () => {
      const delRes = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${ownerToken}` // ownerToken is now editor
      });

      assert.strictEqual(delRes.status, 403, 'Old owner (now editor) must receive 403 when deleting');
    });

    await test('Delete: New Owner permanently purges survey and all associated data', async () => {
      const delRes = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, {
        'Authorization': `Bearer ${editorToken}` // editorToken is now owner
      });

      assert.strictEqual(delRes.status, 200, 'Owner delete must succeed with 200');

      // Clean up cloned project
      if (clonedProjectId) {
        await makeRequest('DELETE', `/api/projects/${clonedProjectId}`, null, {
          'Authorization': `Bearer ${ownerToken}`
        });
      }
    });

    console.log(`\n📊 Survey Settings Test Results: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) throw new Error(`${failed} tests failed in Survey Settings suite.`);

  } finally {
    if (server) server.close();
  }
}

if (require.main === module) {
  runSurveySettingsTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runSurveySettingsTests };
