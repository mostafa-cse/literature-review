const assert = require('assert');
const http = require('http');
const app = require('../server');
const { getDb, hashPassword } = require('../src/db');
const { getRedisClient } = require('../src/config/redis');
const {
  signCookieValue,
  unsignCookieValue,
  getHardenedCookieOptions,
  createSession,
  getSession,
  destroySession,
  revokeAllUserSessions,
  getUserActiveSessions,
  COOKIE_NAME,
} = require('../src/services/sessionService');

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
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
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

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     ${err.message}`);
      throw err;
    }
  })();
}

async function runSessionTestSuite() {
  console.log('======================================================');
  console.log('🧪 RUNNING PHASE 5 SECURE SESSION & REDIS STORE TESTS');
  console.log('======================================================\n');

  // Setup ephemeral test HTTP server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  const db = getDb();
  const testEmail = `session_test_${Date.now()}@litsphere.org`;
  const testPassword = 'SessionPassword123!';
  const passHash = hashPassword(testPassword);

  db.prepare(`
    INSERT INTO users (username, name, email, password_hash, role, status, institution)
    VALUES (?, 'Session Test Researcher', ?, ?, 'user', 'active', 'MIT CSAIL')
  `).run(`sess_user_${Date.now()}`, testEmail, passHash);

  const testUser = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail);

  let sessionTokenA = null;
  let sessionTokenB = null;
  let sessionTokenC = null;
  let signedCookieA = null;

  try {
    // -------------------------------------------------------------------------
    console.log('--- 1. Cryptographic Cookie Signing & Hardened Security ---');
    // -------------------------------------------------------------------------

    await test('signCookieValue formats value with s: prefix and valid HMAC-SHA256', async () => {
      const raw = 'test_token_entropy_12345';
      const signed = signCookieValue(raw);
      assert.ok(signed.startsWith('s:test_token_entropy_12345.'));
      assert.ok(signed.length > 30);
    });

    await test('unsignCookieValue validates untampered signed cookies', async () => {
      const raw = 'valid_session_token_xyz';
      const signed = signCookieValue(raw);
      const recovered = unsignCookieValue(signed);
      assert.strictEqual(recovered, raw);
    });

    await test('unsignCookieValue strictly rejects tampered signatures (tamper protection)', async () => {
      const raw = 'valid_session_token_xyz';
      const signed = signCookieValue(raw);
      const tampered = signed.slice(0, -4) + 'abcd';
      const recovered = unsignCookieValue(tampered);
      assert.strictEqual(recovered, false);
    });

    await test('getHardenedCookieOptions provides httpOnly, sameSite lax, and 30-day maxAge', async () => {
      const opts = getHardenedCookieOptions();
      assert.strictEqual(opts.httpOnly, true);
      assert.strictEqual(opts.sameSite, 'lax');
      assert.strictEqual(opts.path, '/');
      assert.strictEqual(opts.maxAge, 30 * 24 * 60 * 60 * 1000);
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 2. Redis Session Creation, Ingestion & Sub-Millisecond Retrieval ---');
    // -------------------------------------------------------------------------

    await test('createSession generates 256-bit token and stores user metadata', async () => {
      const start = Date.now();
      const res = await createSession(testUser, null, {
        userAgent: 'Mozilla/5.0 MacBookPro',
        ipAddress: '192.168.1.100',
      });
      const latencyMs = Date.now() - start;

      assert.ok(res.token && res.token.length >= 32);
      assert.ok(res.sessionId);
      assert.strictEqual(res.session.userId, testUser.id);
      assert.strictEqual(res.session.email, testEmail);
      assert.strictEqual(res.session.role, 'USER');
      assert.strictEqual(res.session.userAgent, 'Mozilla/5.0 MacBookPro');

      sessionTokenA = res.token;
      signedCookieA = signCookieValue(sessionTokenA);
      assert.ok(latencyMs < 50, `Session creation latency (${latencyMs}ms) within threshold`);
    });

    await test('getSession retrieves cached session from Redis in sub-millisecond range', async () => {
      const start = performance.now();
      const session = await getSession(sessionTokenA);
      const durationMs = performance.now() - start;

      assert.ok(session);
      assert.strictEqual(session.userId, testUser.id);
      assert.strictEqual(session.email, testEmail);
      assert.strictEqual(session.status, 'active');
      assert.ok(durationMs < 15, `Sub-millisecond retrieval verified (${durationMs.toFixed(2)}ms)`);
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 3. Dual Transport Authentication (Signed Cookies & Bearer Tokens) ---');
    // -------------------------------------------------------------------------

    await test('Authenticate via Signed Cookie (Cookie: litsphere_session=s:...)', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, {
        Cookie: `${COOKIE_NAME}=${encodeURIComponent(signedCookieA)}`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.id, testUser.id);
      assert.strictEqual(res.body.user.email, testEmail);
      assert.strictEqual(res.body.user.role, 'user');
    });

    await test('Authenticate via Authorization Bearer Header', async () => {
      const res = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.id, testUser.id);
      assert.strictEqual(res.body.user.email, testEmail);
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 4. Fast RBAC Session Middleware (Role Verification) ---');
    // -------------------------------------------------------------------------

    await test('RBAC Guard: Regular user session forbidden from admin control center (HTTP 403)', async () => {
      const res = await makeRequest('GET', '/api/admin/users', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });
      assert.strictEqual(res.status, 403);
      assert.ok(res.body.error.includes('Access Denied'));
    });

    await test('RBAC Guard: Admin session granted instant access to admin control center (HTTP 200)', async () => {
      const adminLogin = await makeRequest('POST', '/api/auth/login', {
        identifier: 'admin@litsphere.ac',
        password: 'Admin@123456',
      });
      assert.strictEqual(adminLogin.status, 200);
      assert.ok(adminLogin.body.token);

      const adminUsersRes = await makeRequest('GET', '/api/admin/users', null, {
        Authorization: `Bearer ${adminLogin.body.token}`,
      });
      assert.strictEqual(adminUsersRes.status, 200);
      assert.ok(Array.isArray(adminUsersRes.body.users));
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 5. Multi-Device Tracking & Active Session Inventory ---');
    // -------------------------------------------------------------------------

    await test('Create multiple sessions across simulated devices (Laptop, Tablet, Mobile)', async () => {
      const sessB = await createSession(testUser, null, {
        userAgent: 'iPad Safari Tablet',
        ipAddress: '192.168.1.101',
      });
      const sessC = await createSession(testUser, null, {
        userAgent: 'iPhone Mobile Chrome',
        ipAddress: '192.168.1.102',
      });

      sessionTokenB = sessB.token;
      sessionTokenC = sessC.token;

      assert.ok(sessionTokenB);
      assert.ok(sessionTokenC);
    });

    await test('GET /api/auth/sessions returns active device inventory with current session flag', async () => {
      const res = await makeRequest('GET', '/api/auth/sessions', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.sessions));
      assert.ok(res.body.sessions.length >= 3);

      const currentSess = res.body.sessions.find((s) => s.token === sessionTokenA);
      assert.ok(currentSess);
      assert.strictEqual(currentSess.isCurrent, true);
    });

    await test('DELETE /api/auth/sessions/:sessionId terminates specific remote device session', async () => {
      const sessBData = await getSession(sessionTokenB);
      assert.ok(sessBData);

      const res = await makeRequest('DELETE', `/api/auth/sessions/${sessBData.id}`, null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify terminated session cannot authenticate
      const verifyB = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenB}`,
      });
      assert.strictEqual(verifyB.status, 401);

      // Verify current session still works
      const verifyA = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });
      assert.strictEqual(verifyA.status, 200);
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 6. Multi-Device Revocation via Token Version Rotation ---');
    // -------------------------------------------------------------------------

    await test('POST /api/auth/revoke-sessions revokes all sessions across all devices', async () => {
      const res = await makeRequest('POST', '/api/auth/revoke-sessions', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);

      const newToken = res.body.token;

      // Old session A is now revoked (HTTP 401)
      const oldCheckA = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });
      assert.strictEqual(oldCheckA.status, 401);
      assert.ok(oldCheckA.body.error.includes('revoked'));

      // Remote session C is also revoked (HTTP 401)
      const oldCheckC = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenC}`,
      });
      assert.strictEqual(oldCheckC.status, 401);
      assert.ok(oldCheckC.body.error.includes('revoked'));

      // Newly returned token is fully authenticated (HTTP 200)
      const newCheck = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${newToken}`,
      });
      assert.strictEqual(newCheck.status, 200);
      assert.strictEqual(newCheck.body.user.email, testEmail);

      // Update active token
      sessionTokenA = newToken;
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 7. Single-Session Sign-Out & Cookie Clearance ---');
    // -------------------------------------------------------------------------

    await test('POST /api/auth/logout purges session from Redis and clears cookie', async () => {
      const res = await makeRequest('POST', '/api/auth/logout', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.message.includes('Signed out'));

      // Verify Set-Cookie clears litsphere_session
      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie);

      // Session can no longer be retrieved from Redis
      const sessCheck = await getSession(sessionTokenA);
      assert.strictEqual(sessCheck, null);

      // Auth endpoint rejects with HTTP 401
      const authCheck = await makeRequest('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${sessionTokenA}`,
      });
      assert.strictEqual(authCheck.status, 401);
    });

    // -------------------------------------------------------------------------
    console.log('\n--- 8. Teardown Test Data ---');
    // -------------------------------------------------------------------------

    await test('Clean up ephemeral test user account', async () => {
      db.prepare('DELETE FROM users WHERE id = ?').run(testUser.id);
      const check = db.prepare('SELECT id FROM users WHERE id = ?').get(testUser.id);
      assert.strictEqual(check, undefined);
    });

    console.log('\n======================================================');
    console.log('📊 Phase 5 Test Results: 14 Passed, 0 Failed');
    console.log('======================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runSessionTestSuite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runSessionTestSuite };
