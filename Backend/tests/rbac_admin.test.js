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

async function runTests() {
  console.log('🧪 Starting RBAC, Authentication & System Administration Test Suite...\n');

  // Start test server on random port
  const port = 4100 + Math.floor(Math.random() * 800);
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
    let researcherToken = '';
    let adminToken = '';

    // 1. Auth: Researcher Login
    await test('POST /api/auth/login with pre-seeded researcher credentials', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'researcher@litsphere.ac',
        password: 'researcher123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'user');
      researcherToken = res.body.token;
    });

    // 2. Auth: Admin Login
    await test('POST /api/auth/login with pre-seeded admin credentials', async () => {
      const res = await makeRequest('POST', '/api/auth/login', {
        email: 'admin@litsphere.ac',
        password: 'admin123'
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'admin');
      adminToken = res.body.token;
    });

    // 3. Auth: Registration of new student user
    await test('POST /api/auth/register creates new account and returns token', async () => {
      const timestamp = Date.now();
      const testEmail = `student_${timestamp}@litsphere.ac`;
      const testUsername = `alex_student_${timestamp}`;
      const res = await makeRequest('POST', '/api/auth/register', {
        username: testUsername,
        name: 'Alex Student',
        email: testEmail,
        password: 'studentpassword123',
        institution: 'University CS Dept'
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'user');
    });

    // 4. Auth: Profile inspection & Token Quotas
    await test('GET /api/auth/me returns authenticated researcher profile & quota', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, 'researcher@litsphere.ac');
      assert.ok(res.body.user.ai_token_quota >= 100000);
    });

    // 5. RBAC: Researcher blocked from Admin endpoints (403 Forbidden)
    await test('RBAC Guard: Researcher denied access to /api/admin/users (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/api/admin/users', null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes('Access Denied'));
    });

    // 6. RBAC: Admin granted access to User Management
    await test('RBAC Guard: Admin retrieves user list from /api/admin/users (HTTP 200)', async () => {
      const res = await makeRequest('GET', '/api/admin/users', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.users));
      assert.ok(res.body.summary.total_users >= 2);
    });

    // 7. System Health Telemetry
    await test('GET /api/admin/system/health returns CPU, Heap, WAL and DB Record metrics', async () => {
      const res = await makeRequest('GET', '/api/admin/system/health', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'OPERATIONAL');
      assert.ok(res.body.database.engine.includes('SQLite WAL'));
      assert.ok(res.body.database.counts);
    });

    // 8. Maintenance Mode Activation & Non-Admin Interception
    await test('Maintenance Mode: Toggle ON and intercept non-admin API calls (HTTP 503)', async () => {
      // 1. Enable maintenance mode
      const setRes = await makeRequest('PUT', '/api/admin/system/settings', {
        settings: { maintenance_mode: 'true', maintenance_message: 'Lab upgrade in progress' }
      }, { 'Authorization': `Bearer ${adminToken}` });
      assert.strictEqual(setRes.status, 200);

      // 2. Unauthenticated / Researcher request receives 503
      const checkRes = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(checkRes.status, 503);
      assert.strictEqual(checkRes.body.error, 'System Under Maintenance');

      // 3. Admin request bypasses maintenance mode
      const adminBypass = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(adminBypass.status, 200);

      // 4. Disable maintenance mode
      await makeRequest('PUT', '/api/admin/system/settings', {
        settings: { maintenance_mode: 'false' }
      }, { 'Authorization': `Bearer ${adminToken}` });

      // 5. Verify normal operation restored
      const restored = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(restored.status, 200);
    });

    // 9. Master Benchmark Templates & 1-Click Project Cloning
    await test('Master Templates: Retrieve templates & clone into full project hierarchy', async () => {
      const tRes = await makeRequest('GET', '/api/templates');
      assert.strictEqual(tRes.status, 200);
      assert.ok(tRes.body.templates.length >= 2);

      const template = tRes.body.templates[0];
      const cloneRes = await makeRequest('POST', '/api/projects/clone-template', {
        template_id: template.id,
        project_name: 'Cloned Benchmark Survey 2026'
      }, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(cloneRes.status, 201);
      assert.ok(cloneRes.body.project.id);

      // Verify clusters and dynamic columns were populated
      const pRes = await makeRequest('GET', `/api/projects/${cloneRes.body.project.id}`, null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(pRes.status, 200);
      assert.strictEqual(pRes.body.clusters.length, template.clusters.length);
    });

    // 10. Supervisor Public Read-Only Share Link
    await test('POST /api/projects/:id/share & GET /api/public/shared/:token', async () => {
      const pList = await makeRequest('GET', '/api/projects', null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.ok(pList.body.length > 0);
      const testProjId = pList.body[0].id;

      const shareRes = await makeRequest('POST', `/api/projects/${testProjId}/share`, null, {
        'Authorization': `Bearer ${researcherToken}`
      });
      assert.strictEqual(shareRes.status, 200);
      assert.ok(shareRes.body.share_token);

      const previewRes = await makeRequest('GET', `/api/public/shared/${shareRes.body.share_token}`);
      assert.strictEqual(previewRes.status, 200);
      assert.strictEqual(previewRes.body.read_only, true);
      assert.ok(previewRes.body.project.name);
    });

    // 11. Audit Logs Verification
    await test('GET /api/admin/audit-logs records security and maintenance events', async () => {
      const logRes = await makeRequest('GET', '/api/admin/audit-logs', null, {
        'Authorization': `Bearer ${adminToken}`
      });
      assert.strictEqual(logRes.status, 200);
      assert.ok(logRes.body.logs.length > 0);
    });

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log(`\n=======================================================`);
  console.log(`RBAC & Admin Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`=======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
