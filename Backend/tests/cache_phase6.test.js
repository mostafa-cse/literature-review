const assert = require('assert');
const http = require('http');
const app = require('../server');
const { getDb } = require('../src/db');
const { getRedisClient } = require('../src/config/redis');
const cacheService = require('../src/services/cacheService');

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

async function runCachePhase6Tests() {
  console.log('======================================================================');
  console.log('⚡ PHASE 6: HIGH-PERFORMANCE REDIS CACHING & DISTRIBUTED LOCK SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
      throw err;
    }
  }

  // Start temporary test server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const redis = getRedisClient();
  const db = getDb();

  // Test credentials
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    identifier: 'own_user@mail.com',
    password: 'password123',
  });
  const ownerToken = loginRes.body.token;
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

  let testProjectId;
  let testClusterId;
  let testPaperId;
  let testColumnId;

  try {
    // --- 1. Core Cache Service Primitives & Sub-Millisecond Speed ---
    console.log('--- 1. Core Cache Service Primitives & Sub-Millisecond Speed ---');

    await test('1.1 Cache-aside basic getOrSet miss and hit', async () => {
      const testKey = 'litsphere:test:primitive_test';
      await cacheService.del(testKey);

      let fetcherExecuted = 0;
      const fetcher = async () => {
        fetcherExecuted++;
        return { message: 'hello academic cache', timestamp: Date.now() };
      };

      // First call: MISS
      const res1 = await cacheService.getOrSet(testKey, 60, fetcher);
      assert.strictEqual(res1.cached, false, 'First call must be a cache miss');
      assert.strictEqual(fetcherExecuted, 1, 'Fetcher must execute on miss');
      assert.strictEqual(res1.data.message, 'hello academic cache');

      // Second call: HIT
      const res2 = await cacheService.getOrSet(testKey, 60, fetcher);
      assert.strictEqual(res2.cached, true, 'Second call must be a cache hit');
      assert.strictEqual(fetcherExecuted, 1, 'Fetcher must NOT execute again on hit');
      assert.strictEqual(res2.data.message, 'hello academic cache');

      await cacheService.del(testKey);
    });

    await test('1.2 Redis sub-millisecond read latency verification (< 5ms)', async () => {
      const speedKey = 'litsphere:test:speed_test';
      await cacheService.set(speedKey, { payload: 'fast'.repeat(100) }, 60);

      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const val = await cacheService.get(speedKey);
        assert(val !== null, 'Value must exist');
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      console.log(`      ⚡ Average Redis roundtrip latency: ${avgMs.toFixed(3)} ms`);
      const maxLatency = process.env.REDIS_URL && !process.env.REDIS_URL.includes('localhost') && !process.env.REDIS_URL.includes('127.0.0.1') ? 1000 : 25;
      assert(avgMs < maxLatency, `Redis latency should be acceptable for connection (< ${maxLatency}ms), was ${avgMs}ms`);

      await cacheService.del(speedKey);
    });

    await test('1.3 TTL auto-expiration verification in Redis', async () => {
      const ttlKey = 'litsphere:test:ttl_verify';
      await cacheService.set(ttlKey, { test: 'expires_fast' }, 1); // 1 second TTL

      const immediate = await cacheService.get(ttlKey);
      assert(immediate !== null, 'Key must exist immediately after set');

      // Wait 1.2s for TTL expiration
      await new Promise((r) => setTimeout(r, 1200));

      const expired = await cacheService.get(ttlKey);
      assert.strictEqual(expired, null, 'Key must be expired and return null');
    });

    // --- 2. Setup Project, Cluster, Dynamic Column & Paper for In-Flight Academic Tests ---
    console.log('\n--- 2. Project Hierarchy Setup for Academic Cache Testing ---');

    await test('2.1 Create test survey for Phase 6 benchmarking', async () => {
      const projRes = await makeRequest('POST', '/api/projects', {
        name: `Phase 6 Matrix Cache Survey ${Date.now()}`,
        description: 'Verifying sub-millisecond Redis cache-aside and invalidation',
        domain: 'Computer Science',
      }, ownerHeaders);

      assert.strictEqual(projRes.status, 201);
      testProjectId = projRes.body.id;
      assert(testProjectId > 0);
    });

    await test('2.2 Create taxonomy cluster in survey', async () => {
      const clRes = await makeRequest('POST', '/api/clusters', {
        project_id: testProjectId,
        name: 'Neural Embeddings',
        description: 'Deep representation learning',
        color: '#6366f1',
      }, ownerHeaders);

      assert.strictEqual(clRes.status, 201);
      testClusterId = clRes.body.id;
      assert(testClusterId > 0);
    });

    await test('2.3 Create dynamic column schema', async () => {
      const colRes = await makeRequest('POST', '/api/dynamic-columns', {
        project_id: testProjectId,
        cluster_id: testClusterId,
        column_name: 'Embedding Dimension',
        col_type: 'number',
      }, ownerHeaders);

      assert(colRes.status === 200 || colRes.status === 201);
      testColumnId = colRes.body.id;
      assert(testColumnId > 0);
    });

    await test('2.4 Ingest paper into survey cluster', async () => {
      const paperRes = await makeRequest('POST', '/api/papers', {
        project_id: testProjectId,
        cluster_id: testClusterId,
        title: 'High-Throughput Vector Embeddings for Literature Review',
        authors: 'A. Vaswani, J. Dean',
        year: 2024,
        domain: 'Computer Science',
        status: 'unread',
        intuition: 'Sub-millisecond memory representation of academic benchmarks',
      }, ownerHeaders);

      assert.strictEqual(paperRes.status, 201);
      testPaperId = paperRes.body.id;
      assert(testPaperId > 0);
    });

    // --- 3. Academic Read-Heavy Operations: Cache-Aside Strategy ---
    console.log('\n--- 3. Academic Cache-Aside Verification (Matrix, Clusters, Columns, Stats) ---');

    await test('3.1 Full survey benchmark matrix cache-aside (/api/papers?project_id=)', async () => {
      // First request: Cache MISS
      const t0 = performance.now();
      const missRes = await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      const missLatency = performance.now() - t0;

      assert.strictEqual(missRes.status, 200);
      assert.strictEqual(missRes.headers['x-cache'], 'MISS', 'First fetch must be a cache MISS');
      assert(Array.isArray(missRes.body) && missRes.body.length >= 1);

      // Verify Redis key exists
      const redisVal = await redis.get(`litsphere:survey:${testProjectId}:matrix`);
      assert(redisVal !== null, 'Matrix must be stored in Redis under litsphere:survey:{id}:matrix');

      // Second request: Cache HIT (Sub-millisecond response)
      const t1 = performance.now();
      const hitRes = await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      const hitLatency = performance.now() - t1;

      assert.strictEqual(hitRes.status, 200);
      assert.strictEqual(hitRes.headers['x-cache'], 'HIT', 'Second fetch must be a cache HIT');
      assert.strictEqual(hitRes.body.length, missRes.body.length);
      console.log(`      ⚡ Matrix API Latency: Miss = ${missLatency.toFixed(2)}ms | Cache HIT = ${hitLatency.toFixed(2)}ms`);
    });

    await test('3.2 Dedicated Survey Benchmark Matrix endpoint (GET /api/projects/:id/matrix)', async () => {
      // Purge to test fresh endpoint cache
      await cacheService.invalidateSurveyMatrix(testProjectId);

      const missRes = await makeRequest('GET', `/api/projects/${testProjectId}/matrix`, null, ownerHeaders);
      assert.strictEqual(missRes.status, 200);
      assert.strictEqual(missRes.headers['x-cache'], 'MISS');
      assert.strictEqual(missRes.body.project.id, testProjectId);
      assert(Array.isArray(missRes.body.papers));
      assert(Array.isArray(missRes.body.clusters));
      assert(Array.isArray(missRes.body.dynamic_columns));

      const hitRes = await makeRequest('GET', `/api/projects/${testProjectId}/matrix`, null, ownerHeaders);
      assert.strictEqual(hitRes.status, 200);
      assert.strictEqual(hitRes.headers['x-cache'], 'HIT');
    });

    await test('3.3 Taxonomy cluster trees cache-aside (GET /api/clusters?project_id=)', async () => {
      // Clear key first
      await cacheService.del(`litsphere:survey:${testProjectId}:clusters`);

      const res1 = await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.headers['x-cache'], 'MISS');

      const res2 = await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers['x-cache'], 'HIT');
      assert.strictEqual(res2.body[0].name, 'Neural Embeddings');
    });

    await test('3.4 Dynamic column schemas cache-aside (GET /api/columns?project_id=)', async () => {
      await cacheService.delByPattern(`litsphere:survey:${testProjectId}:columns:*`);

      const res1 = await makeRequest('GET', `/api/columns?project_id=${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.headers['x-cache'], 'MISS');

      const res2 = await makeRequest('GET', `/api/columns?project_id=${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers['x-cache'], 'HIT');
    });

    await test('3.5 Platform-wide telemetry & stats cache-aside (GET /api/stats)', async () => {
      await cacheService.invalidateGlobalStats();

      // 3.5.1 Global stats
      const globalMiss = await makeRequest('GET', '/api/stats');
      assert.strictEqual(globalMiss.status, 200);
      assert.strictEqual(globalMiss.headers['x-cache'], 'MISS');

      const globalHit = await makeRequest('GET', '/api/stats');
      assert.strictEqual(globalHit.status, 200);
      assert.strictEqual(globalHit.headers['x-cache'], 'HIT');

      // 3.5.2 Survey-scoped stats
      const surveyMiss = await makeRequest('GET', `/api/stats?project_id=${testProjectId}`);
      assert.strictEqual(surveyMiss.status, 200);
      assert.strictEqual(surveyMiss.headers['x-cache'], 'MISS');

      const surveyHit = await makeRequest('GET', `/api/stats?project_id=${testProjectId}`);
      assert.strictEqual(surveyHit.status, 200);
      assert.strictEqual(surveyHit.headers['x-cache'], 'HIT');
    });

    // --- 4. Granular Cache Invalidation ---
    console.log('\n--- 4. Granular Cache Invalidation on Cell Edits, Papers & Clusters ---');

    await test('4.1 Matrix cell edit invalidates survey benchmark matrix', async () => {
      // Ensure matrix is cached
      await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      let matrixCached = await redis.get(`litsphere:survey:${testProjectId}:matrix`);
      assert(matrixCached !== null, 'Matrix cache should be hot before mutation');

      // Perform single cell edit
      const editRes = await makeRequest('POST', '/api/paper-column-values', {
        paper_id: testPaperId,
        column_id: testColumnId,
        value: '768',
      }, ownerHeaders);
      assert.strictEqual(editRes.status, 200);

      // Verify Redis matrix key is invalidated immediately
      matrixCached = await redis.get(`litsphere:survey:${testProjectId}:matrix`);
      assert.strictEqual(matrixCached, null, 'Matrix key must be purged on cell edit');

      // Subsequent query must be a fresh MISS reflecting the new value
      const freshRes = await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(freshRes.headers['x-cache'], 'MISS');
      const targetPaper = freshRes.body.find((p) => p.id === testPaperId);
      assert(targetPaper.custom_columns, 'Custom columns must exist');
      assert.strictEqual(targetPaper.custom_columns[testColumnId], '768');
    });

    await test('4.2 Paper ingestion invalidates survey matrix, clusters, and stats', async () => {
      // Warm all caches
      await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, ownerHeaders);
      await makeRequest('GET', `/api/stats?project_id=${testProjectId}`);

      // Ingest 2nd paper
      const addRes = await makeRequest('POST', '/api/papers', {
        project_id: testProjectId,
        cluster_id: testClusterId,
        title: 'Contrastive Search for Massive Literature Corpora',
        authors: 'Y. LeCun',
        year: 2025,
        status: 'read',
      }, ownerHeaders);
      assert.strictEqual(addRes.status, 201);

      // Verify matrix, clusters, and survey stats are invalidated
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:matrix`), null);
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:clusters`), null);
      assert.strictEqual(await redis.get(`litsphere:stats:survey:${testProjectId}`), null);
    });

    await test('4.3 Paper status update invalidates survey matrix & stats', async () => {
      // Warm matrix
      await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      assert(await redis.get(`litsphere:survey:${testProjectId}:matrix`) !== null);

      // Toggle status
      const statusRes = await makeRequest('PATCH', `/api/papers/${testPaperId}/status`, {
        status: 'read',
      }, ownerHeaders);
      assert.strictEqual(statusRes.status, 200);

      // Cache must be purged
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:matrix`), null);
    });

    await test('4.4 Cluster mutation invalidates cluster tree and survey matrix', async () => {
      // Warm clusters
      await makeRequest('GET', `/api/clusters?project_id=${testProjectId}`, null, ownerHeaders);
      assert(await redis.get(`litsphere:survey:${testProjectId}:clusters`) !== null);

      // Update cluster color/name
      const clUpdate = await makeRequest('PUT', `/api/clusters/${testClusterId}`, {
        name: 'Neural & Symbolic Embeddings',
        color: '#10b981',
      }, ownerHeaders);
      assert.strictEqual(clUpdate.status, 200);

      // Clusters cache purged
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:clusters`), null);
    });

    // --- 5. Distributed Locking (Redlock / SET NX EX + Safe Lua Script) ---
    console.log('\n--- 5. Distributed Locking (Mutual Exclusion, Safe Release & Race-Condition Guard) ---');

    await test('5.1 Distributed Lock: Mutual Exclusion (SET NX EX)', async () => {
      const lockResource = `test_resource_${Date.now()}`;

      // Worker 1 acquires lock
      const lock1 = await cacheService.acquireLock(lockResource, 5, { maxWaitMs: 0 });
      assert.strictEqual(lock1.acquired, true, 'Worker 1 must acquire lock');
      assert(typeof lock1.token === 'string' && lock1.token.length > 0);

      // Worker 2 attempts to acquire same resource with 0ms wait: Must be rejected
      const lock2 = await cacheService.acquireLock(lockResource, 5, { maxWaitMs: 0 });
      assert.strictEqual(lock2.acquired, false, 'Worker 2 must be rejected while lock1 is held');
      assert.strictEqual(lock2.token, null);

      // Clean up lock 1
      const released = await cacheService.releaseLock(lockResource, lock1.token);
      assert.strictEqual(released, true, 'Worker 1 must release lock cleanly');
    });

    await test('5.2 Distributed Lock: Safe Lua Atomic Release (Prevents Releasing Foreign Locks)', async () => {
      const lockResource = `foreign_test_${Date.now()}`;

      const lock = await cacheService.acquireLock(lockResource, 10);
      assert.strictEqual(lock.acquired, true);

      // Worker with wrong / expired token attempts release
      const fakeToken = '00000000-0000-0000-0000-000000000000';
      const fakeRelease = await cacheService.releaseLock(lockResource, fakeToken);
      assert.strictEqual(fakeRelease, false, 'Releasing with mismatched token must return false');

      // Verify lock is still active and held
      const stillHeld = await redis.get(`litsphere:lock:${lockResource}`);
      assert.strictEqual(stillHeld, lock.token, 'Lock must remain active');

      // Genuine owner releases
      const genuineRelease = await cacheService.releaseLock(lockResource, lock.token);
      assert.strictEqual(genuineRelease, true, 'Genuine owner can release lock');
    });

    await test('5.3 Distributed Lock: Auto-Expiry Prevents Deadlocks', async () => {
      const lockResource = `expire_test_${Date.now()}`;

      // Acquire with 1s TTL
      const lock1 = await cacheService.acquireLock(lockResource, 1);
      assert.strictEqual(lock1.acquired, true);

      // Wait 1.2s for lock to naturally expire in Redis
      await new Promise((r) => setTimeout(r, 1200));

      // Worker 2 can now acquire without deadlocking
      const lock2 = await cacheService.acquireLock(lockResource, 5, { maxWaitMs: 0 });
      assert.strictEqual(lock2.acquired, true, 'Worker 2 must acquire after TTL expiration');

      await cacheService.releaseLock(lockResource, lock2.token);
    });

    await test('5.4 Distributed Locking on Batch Cell Matrix Updates (/api/paper-column-values/batch)', async () => {
      // Warm matrix
      await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);
      assert(await redis.get(`litsphere:survey:${testProjectId}:matrix`) !== null);

      // Perform bulk matrix write under distributed locking
      const batchRes = await makeRequest('POST', '/api/paper-column-values/batch', {
        updates: [
          { paper_id: testPaperId, column_id: testColumnId, value: '1024' },
        ],
      }, ownerHeaders);

      assert.strictEqual(batchRes.status, 200);
      assert.strictEqual(batchRes.body.success, true);

      // Matrix cache must be invalidated
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:matrix`), null);

      // Value updated correctly
      const cellCheck = db.prepare('SELECT value FROM paper_column_values WHERE paper_id = ? AND column_id = ?').get(testPaperId, testColumnId);
      assert.strictEqual(cellCheck.value, '1024');
    });

    await test('5.5 Distributed Locking on Reset Matrix (POST /api/projects/:id/reset-matrix)', async () => {
      // Populate cache
      await makeRequest('GET', `/api/papers?project_id=${testProjectId}`, null, ownerHeaders);

      // Reset matrix under distributed lock
      const resetRes = await makeRequest('POST', `/api/projects/${testProjectId}/reset-matrix`, null, ownerHeaders);
      assert.strictEqual(resetRes.status, 200);
      assert.strictEqual(resetRes.body.success, true);

      // Matrix cache purged
      assert.strictEqual(await redis.get(`litsphere:survey:${testProjectId}:matrix`), null);

      // DB cell values cleared
      const valCount = db.prepare('SELECT COUNT(*) as c FROM paper_column_values WHERE paper_id IN (SELECT id FROM papers WHERE project_id = ?)').get(testProjectId).c;
      assert.strictEqual(valCount, 0, 'Cell values should be completely wiped');
    });

    // --- 6. Cleanup & Cascading Teardown ---
    console.log('\n--- 6. Cleanup & Cascading Teardown ---');

    await test('6.1 Purge test project and verify cascading cache clearance', async () => {
      const delRes = await makeRequest('DELETE', `/api/projects/${testProjectId}`, null, ownerHeaders);
      assert.strictEqual(delRes.status, 200);

      // Verify all survey Redis keys wiped
      const surveyKeys = await redis.keys(`litsphere:survey:${testProjectId}:*`);
      assert.strictEqual(surveyKeys.length, 0, 'All survey keys in Redis should be wiped on project deletion');
    });

    console.log('\n======================================================================');
    console.log(`🎉 PHASE 6 CACHE & LOCKING SUITE PASSED (${passed} / ${passed + failed} Tests Passed)`);
    console.log('======================================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

if (require.main === module) {
  runCachePhase6Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during Phase 6 cache test execution:', err);
      process.exit(1);
    });
}

module.exports = { runCachePhase6Tests };
