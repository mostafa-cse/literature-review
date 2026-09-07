const assert = require('assert');
const http = require('http');
const app = require('../server');
const { getDb } = require('../src/db');
const { generateToken } = require('../src/utils/auth');

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

async function runClusterReorderTests() {
  console.log('🔄 Starting Cluster Repositioning & Reorder Test Suite...\n');

  const port = 5400 + Math.floor(Math.random() * 500);
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
      console.error(err);
      failed++;
    }
  }

  try {
    const db = getDb();

    // 1. Create a dedicated test project and users
    let adminUser = db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get() || db.prepare("SELECT * FROM users LIMIT 1").get();
    let adminId;
    if (!adminUser) {
      const aRes = db.prepare("INSERT INTO users (username, name, email, password_hash, role, status) VALUES ('admin_reorder', 'Platform Admin', 'admin_reorder@litsphere.ac', 'hash', 'admin', 'active')").run();
      adminId = aRes.lastInsertRowid;
      adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    } else {
      adminId = adminUser.id;
    }
    const ownerToken = generateToken(adminUser);

    let viewerUser = db.prepare("SELECT * FROM users WHERE email = 'test_viewer_reorder@litsphere.ac'").get();
    let viewerId;
    if (!viewerUser) {
      const vRes = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Viewer Test', 'test_viewer_reorder@litsphere.ac', 'hash', 'user')").run();
      viewerId = vRes.lastInsertRowid;
      viewerUser = db.prepare("SELECT * FROM users WHERE id = ?").get(viewerId);
    } else {
      viewerId = viewerUser.id;
    }
    const viewerToken = generateToken(viewerUser || { id: viewerId, email: 'test_viewer_reorder@litsphere.ac', role: 'user', name: 'Viewer Test' });

    // Create a new test project
    const pRes = db.prepare("INSERT INTO projects (name, description, owner_id) VALUES ('Cluster Reorder Test Project', 'Testing cluster repositioning', ?)").run(adminId);
    const testProjectId = pRes.lastInsertRowid;
    db.prepare("INSERT OR REPLACE INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").run(testProjectId, adminId);
    db.prepare("INSERT OR REPLACE INTO project_members (project_id, user_id, role) VALUES (?, ?, 'viewer')").run(testProjectId, viewerId);

    // 2. Create 3 clusters
    const c1Res = await makeRequest('POST', '/api/clusters', {
      project_id: testProjectId,
      name: 'Alpha Cluster',
      color: '#38bdf8'
    }, { Authorization: `Bearer ${ownerToken}` });
    assert.strictEqual(c1Res.status, 201);
    const c1Id = c1Res.body.id;

    const c2Res = await makeRequest('POST', '/api/clusters', {
      project_id: testProjectId,
      name: 'Beta Cluster',
      color: '#10b981'
    }, { Authorization: `Bearer ${ownerToken}` });
    assert.strictEqual(c2Res.status, 201);
    const c2Id = c2Res.body.id;

    const c3Res = await makeRequest('POST', '/api/clusters', {
      project_id: testProjectId,
      name: 'Gamma Cluster',
      color: '#f59e0b'
    }, { Authorization: `Bearer ${ownerToken}` });
    assert.strictEqual(c3Res.status, 201);
    const c3Id = c3Res.body.id;

    await test('Initial GET /api/clusters preserves creation position sequence [Alpha, Beta, Gamma]', async () => {
      const res = await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, { Authorization: `Bearer ${ownerToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.length, 3);
      assert.strictEqual(res.body[0].id, c1Id);
      assert.strictEqual(res.body[1].id, c2Id);
      assert.strictEqual(res.body[2].id, c3Id);
    });

    await test('Viewer role cannot reorder clusters (RBAC check -> 403 Forbidden)', async () => {
      const res = await makeRequest('PUT', '/api/clusters/reorder', {
        project_id: testProjectId,
        cluster_ids: [c3Id, c1Id, c2Id]
      }, { Authorization: `Bearer ${viewerToken}` });
      assert.strictEqual(res.status, 403);
    });

    await test('Owner can reorder clusters: [Gamma, Alpha, Beta]', async () => {
      const reorderRes = await makeRequest('PUT', '/api/clusters/reorder', {
        project_id: testProjectId,
        cluster_ids: [c3Id, c1Id, c2Id]
      }, { Authorization: `Bearer ${ownerToken}` });
      assert.strictEqual(reorderRes.status, 200);
      assert.strictEqual(reorderRes.body.success, true);
      assert.strictEqual(reorderRes.body.reordered, 3);

      // Verify GET returns the new order
      const getRes = await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, { Authorization: `Bearer ${ownerToken}` });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.length, 3);
      assert.strictEqual(getRes.body[0].id, c3Id); // Gamma first
      assert.strictEqual(getRes.body[1].id, c1Id); // Alpha second
      assert.strictEqual(getRes.body[2].id, c2Id); // Beta third
    });

    await test('Creating a 4th cluster appends to the end of the custom position sequence', async () => {
      const c4Res = await makeRequest('POST', '/api/clusters', {
        project_id: testProjectId,
        name: 'Delta Cluster',
        color: '#a855f7'
      }, { Authorization: `Bearer ${ownerToken}` });
      assert.strictEqual(c4Res.status, 201);
      const c4Id = c4Res.body.id;

      const getRes = await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, { Authorization: `Bearer ${ownerToken}` });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.length, 4);
      assert.strictEqual(getRes.body[0].id, c3Id);
      assert.strictEqual(getRes.body[1].id, c1Id);
      assert.strictEqual(getRes.body[2].id, c2Id);
      assert.strictEqual(getRes.body[3].id, c4Id); // Delta appended
    });

    // Cleanup test project
    db.prepare("DELETE FROM projects WHERE id = ?").run(testProjectId);

  } finally {
    if (server) server.close();
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

if (require.main === module) {
  runClusterReorderTests();
}

module.exports = { runClusterReorderTests };
