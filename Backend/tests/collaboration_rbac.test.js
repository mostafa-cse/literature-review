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

async function runCollaborationTests() {
  console.log('👥 Starting Granular Collaboration Sub-Roles (Owner, Editor, Reviewer, Viewer) Test Suite...\n');

  const port = 4900 + Math.floor(Math.random() * 800);
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
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(`     Error: ${err.message}\n`);
      failed++;
    }
  }

  try {
    let ownerToken = '';
    let editorToken = '';
    let reviewerToken = '';
    let guestToken = ''; // unauthenticated viewer

    // 1. Sign in as Owner (researcher@litsphere.ac)
    await test('Sign in as Project Owner (researcher@litsphere.ac)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'researcher@litsphere.ac',
        password: 'researcher123'
      });
      assert.strictEqual(res.status, 200);
      ownerToken = res.body.token;
    });

    // 2. Sign in as Co-Author (coauthor@litsphere.ac)
    await test('Sign in as Co-Author (coauthor@litsphere.ac)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'coauthor@litsphere.ac',
        password: 'coauthor123'
      });
      assert.strictEqual(res.status, 200);
      editorToken = res.body.token;
    });

    // 3. Sign in as Advisor Reviewer (advisor@litsphere.ac)
    await test('Sign in as Advisor / Reviewer (advisor@litsphere.ac)', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'advisor@litsphere.ac',
        password: 'advisor123'
      });
      assert.strictEqual(res.status, 200);
      reviewerToken = res.body.token;
    });

    // 4. Create a test project as Owner
    let projectId;
    let clusterId;
    let colId;
    let paperId;

    await test('Owner creates collaborative test project & cluster', async () => {
      const pRes = await makeRequest('POST', '/api/projects', {
        name: 'Collaborative Benchmarking Survey',
        description: 'Multi-author research testing fine-grained RBAC'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(pRes.status, 201);
      projectId = pRes.body.id;

      const cRes = await makeRequest('POST', '/api/clusters', {
        project_id: projectId,
        name: 'Deep Graph Neural Networks',
        color: '#6366f1'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(cRes.status, 201);
      clusterId = cRes.body.id;

      const colRes = await makeRequest('POST', '/api/dynamic-columns', {
        cluster_id: clusterId,
        column_name: 'Message Passing Bound'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(colRes.status, 201);
      colId = colRes.body.id;

      const paperRes = await makeRequest('POST', '/api/papers', {
        project_id: projectId,
        cluster_id: clusterId,
        title: 'Graph Attention Networks for Manifold Regularization',
        authors: 'Petar Veličković et al.',
        year: 2024
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(paperRes.status, 201);
      paperId = paperRes.body.id;
    });

    // 5. Owner invites Co-Author as 'editor' and Advisor as 'reviewer'
    await test('Owner invites Co-Author as Editor and Advisor as Reviewer', async () => {
      const invEditor = await makeRequest('POST', `/api/projects/${projectId}/members`, {
        email: 'coauthor@litsphere.ac',
        role: 'editor'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invEditor.status, 201);
      assert.strictEqual(invEditor.body.role, 'editor');

      const invReviewer = await makeRequest('POST', `/api/projects/${projectId}/members`, {
        email: 'advisor@litsphere.ac',
        role: 'reviewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });
      assert.strictEqual(invReviewer.status, 201);
      assert.strictEqual(invReviewer.body.role, 'reviewer');

      // Verify members list
      const mList = await makeRequest('GET', `/api/projects/${projectId}/members`);
      assert.strictEqual(mList.status, 200);
      assert.ok(mList.body.members.some(m => m.project_role === 'editor' && m.email === 'coauthor@litsphere.ac'));
      assert.ok(mList.body.members.some(m => m.project_role === 'reviewer' && m.email === 'advisor@litsphere.ac'));
    });

    // 6. Editor permissions: Can edit cell values & update papers
    await test('Editor (Co-Author) can edit cell values inline & update papers', async () => {
      const valRes = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: paperId,
        column_id: colId,
        value: 'O(V \\cdot D + E \\cdot F)'
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(valRes.status, 200);
      assert.strictEqual(valRes.body.value, 'O(V \\cdot D + E \\cdot F)');

      const updateRes = await makeRequest('PUT', `/api/papers/${paperId}`, {
        status: 'in_progress',
        intuition: 'Self-attention over node graph neighborhoods'
      }, { 'Authorization': `Bearer ${editorToken}` });
      assert.strictEqual(updateRes.status, 200);
    });

    // 7. Editor restriction: Cannot delete the project
    await test('Editor restriction: Cannot delete project (HTTP 403 Forbidden)', async () => {
      const delRes = await makeRequest('DELETE', `/api/projects/${projectId}`, null, {
        'Authorization': `Bearer ${editorToken}`
      });
      assert.strictEqual(delRes.status, 403);
      assert.ok(delRes.body.error.includes('Only the project Owner can delete'));
    });

    // 8. Reviewer permissions: Can perform blind screening & leave annotations
    await test('Reviewer (Advisor) can submit blind PRISMA screening decision', async () => {
      const screenRes = await makeRequest('POST', `/api/papers/${paperId}/screening`, {
        decision: 'included',
        notes: 'High empirical relevance to GNN feature selection benchmark'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(screenRes.status, 200);
      assert.strictEqual(screenRes.body.decision, 'included');

      const checkScreen = await makeRequest('GET', `/api/papers/${paperId}/screening`);
      assert.strictEqual(checkScreen.status, 200);
      assert.strictEqual(checkScreen.body.decisions[0].decision, 'included');
    });

    await test('Reviewer (Advisor) can add paper comments & source-quote annotations', async () => {
      const commentRes = await makeRequest('POST', `/api/papers/${paperId}/comments`, {
        comment_text: 'Please check if spatial complexity scales linearly with edges.',
        quote_text: 'O(V \\cdot D + E \\cdot F)',
        page_number: 4
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(commentRes.status, 201);
      assert.ok(commentRes.body.comment.id);
      assert.strictEqual(commentRes.body.comment.quote_text, 'O(V \\cdot D + E \\cdot F)');

      const cList = await makeRequest('GET', `/api/papers/${paperId}/comments`);
      assert.strictEqual(cList.status, 200);
      assert.strictEqual(cList.body.comments.length, 1);
    });

    // 9. Reviewer restriction: Cannot modify extracted table cells or delete papers
    await test('Reviewer restriction: Cannot edit cell values (HTTP 403 Forbidden)', async () => {
      const editValRes = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: paperId,
        column_id: colId,
        value: 'Malicious Overwrite By Reviewer'
      }, { 'Authorization': `Bearer ${reviewerToken}` });
      assert.strictEqual(editValRes.status, 403);
      assert.ok(editValRes.body.error.includes('Access Denied'));
    });

    // 10. Viewer (Public Guest) permissions: Read-only access, cannot mutate
    await test('Viewer (Guest) can read matrix data but cannot edit or comment', async () => {
      // Register or ensure viewer user exists
      await makeRequest('POST', '/api/auth/register', {
        username: 'viewerGuest',
        email: 'viewer@test.com',
        password: 'password123',
        name: 'Viewer Guest'
      });

      // Invite a dedicated viewer user
      await makeRequest('POST', `/api/projects/${projectId}/members`, {
        email: 'viewer@test.com',
        role: 'viewer'
      }, { 'Authorization': `Bearer ${ownerToken}` });

      // Sign in as viewer
      const viewLogin = await makeRequest('POST', '/api/auth/login', {
        email: 'viewer@test.com',
        password: 'password123'
      });
      guestToken = viewLogin.body.token;

      // Can read with viewer token
      const getMatrix = await makeRequest('GET', `/api/projects/${projectId}`, null, {
        'Authorization': `Bearer ${guestToken}`
      });
      assert.strictEqual(getMatrix.status, 200);

      // Cannot edit cells with viewer token
      const guestEdit = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: paperId,
        column_id: colId,
        value: 'Guest Edit'
      }, { 'Authorization': `Bearer ${guestToken}` });
      assert.strictEqual(guestEdit.status, 403);
    });

    // 11. Cleanup test project as Owner
    await test('Owner deletes test project successfully', async () => {
      const pDel = await makeRequest('DELETE', `/api/projects/${projectId}`, null, {
        'Authorization': `Bearer ${ownerToken}`
      });
      assert.strictEqual(pDel.status, 200);
      assert.strictEqual(pDel.body.success, true);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log(`\n=======================================================`);
  console.log(`Collaboration RBAC Results: ${passed} Passed, ${failed} Failed`);
  console.log(`=======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCollaborationTests();
}

module.exports = { runCollaborationTests };
