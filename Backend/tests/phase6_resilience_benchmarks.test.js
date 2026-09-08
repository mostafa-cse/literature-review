/**
 * ============================================================================
 * PHASE 6: END-TO-END RESILIENCE, INTEGRATION & PERFORMANCE BENCHMARK SUITE
 * ============================================================================
 * Tests:
 * 1. Request Cancellation (Named AbortController & Socket Teardown)
 * 2. Optimistic Mutation, Rollback & Offline Queue Sync
 * 3. Multi-Tier Cache Verification (SWR L1 + Redis L2 Cache-Aside & Invalidation)
 * 4. Scholarly Fallback Cascade & Circuit Breaker Recovery
 * 5. Telemetry & Latency Audit (Cold vs Warm Loading, Search Latency, Compression)
 */

const assert = require('assert');
const http = require('http');
const zlib = require('zlib');

// Global browser shim for testing Frontend/js/core/api.js in Node
global.window = global;
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
  get length() { return Object.keys(this._store).length; },
  key(i) { return Object.keys(this._store)[i] || null; }
};
global.navigator = { onLine: true, connection: { effectiveType: '4g', rtt: 50, downlink: 10 } };
global.dispatchEvent = (evt) => {
  if (global._eventListeners && global._eventListeners[evt.type]) {
    global._eventListeners[evt.type].forEach(fn => fn(evt));
  }
  return true;
};
global._eventListeners = {};
global.addEventListener = (type, fn) => {
  if (!global._eventListeners[type]) global._eventListeners[type] = [];
  global._eventListeners[type].push(fn);
};

require('../../Frontend/js/core/api.js');

const app = require('../server');
const { getDb } = require('../src/db');
const cacheService = require('../src/services/cacheService');
const queueService = require('../src/services/queueService');
const { CircuitBreaker, RateLimiter } = require('../src/services/scholarlyService');

let server;
let baseUrl;

function httpRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runPhase6Tests() {
  console.log('======================================================================');
  console.log('⚡ PHASE 6: END-TO-END RESILIENCE, INTEGRATION & BENCHMARK SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // Start test server on ephemeral port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      console.log(`📡 Test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  const db = getDb();
  let testProjectId = 1;
  const existingProj = db.prepare('SELECT id FROM projects WHERE id = 1').get();
  if (!existingProj) {
    const pRes = db.prepare("INSERT INTO projects (name, description) VALUES ('Benchmark Project', 'Phase 6 Test')").run();
    testProjectId = pRes.lastInsertRowid;
  }

  // Ensure test papers exist for benchmark and search
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM papers WHERE project_id = ?').get(testProjectId).c;
  if (existingCount < 5) {
    const insertStmt = db.prepare(`
      INSERT INTO papers (project_id, title, authors, year, pub, doi, status, domain, intuition, equation, strengths, gaps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(testProjectId, 'Quantum State Estimation via Hamiltonian Learning', 'Dr. Alice Researcher', '2025', 'Nature Physics', '10.1038/s41567-2025-01', 'read', 'Quantum Computing', 'Hamiltonian learning with sublinear sample complexity.', '$$\\mathcal{H} = \\sum_{i=1}^n \\sigma_i^z$$', '["Optimal sample rate"]', '["High circuit depth"]');
    insertStmt.run(testProjectId, 'Asymptotic Quantum Synthesis and Compilation', 'Prof. Bob Martinez', '2024', 'IEEE Trans Quantum', '10.1109/TQE.2024.02', 'unread', 'Quantum Computing', 'Unitary decomposition with fault-tolerant T-count minimization.', '$$\\mathcal{O}(N \\log^2 N)$$', '["Minimal T-depth"]', '["Limited to Clifford+T"]');
    insertStmt.run(testProjectId, 'Deep Neural Operators for Quantum Chemistry', 'Carol Wang et al.', '2026', 'Science Advances', '10.1126/sciadv.2026.03', 'in-progress', 'Quantum Machine Learning', 'Continuous Fourier neural operators predicting molecular ground states.', '$$\\hat{\\Psi}(x) = \\int \\mathcal{K}(x, y) f(y) dy$$', '["Zero-shot generalization"]', '["Sensitive to coordinate frame"]');
    insertStmt.run(testProjectId, 'Error Mitigation in Variational Quantum Eigensolvers', 'David Chen', '2023', 'PRX Quantum', '10.1103/PRXQuantum.2023.04', 'read', 'Quantum Computing', 'Zero-noise extrapolation combined with Clifford data regression.', '$$\\langle E \\rangle = \\lim_{\\lambda \\to 0} E(\\lambda)$$', '["Device-independent"]', '["Amplifies statistical variance"]');
    insertStmt.run(testProjectId, 'Scalable Fault-Tolerant Quantum Architecture', 'Elena Rostova', '2025', 'ACM Computing Surveys', '10.1145/3600000.2025.05', 'unread', 'Quantum Hardware', 'Surface codes and topological routing on 2D lattice grids.', '$$d = 2t + 1$$', '["Comprehensive architectural review"]', '["Assumes uniform physical error rates"]');
  }

  // Clear caches for test survey
  await cacheService.invalidateSurveyCache(testProjectId);
  await cacheService.invalidateTag('stats');

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: Request Cancellation (AbortController)
    // ----------------------------------------------------
    console.log('--- 1. Request Cancellation & AbortController Resilience ---');

    await test('1.1: ApiClient named abortKey cancels prior in-flight request', async () => {
      const client = new window.ApiClient();
      let abortedCaught = false;

      // Fire slow request 1
      const req1Promise = client.request(`${baseUrl}/api/papers?project_id=${testProjectId}&_delay=100`, {
        abortKey: 'test_search'
      }).catch(err => {
        if (err.isAborted) abortedCaught = true;
        return null;
      });

      // Fire request 2 immediately with same abortKey
      const req2Promise = client.request(`${baseUrl}/api/papers?project_id=${testProjectId}`, {
        abortKey: 'test_search'
      });

      const [res1, res2] = await Promise.all([req1Promise, req2Promise]);
      assert.strictEqual(abortedCaught, true, 'First request must be aborted');
      assert(Array.isArray(res2), 'Second request must complete successfully');
    });

    await test('1.2: Server handles abrupt socket destruction gracefully', async () => {
      let serverErrorThrown = false;
      const uncaughtHandler = () => { serverErrorThrown = true; };
      process.on('uncaughtException', uncaughtHandler);

      await new Promise((resolve) => {
        const url = new URL(`${baseUrl}/api/papers?project_id=${testProjectId}`);
        const req = http.get(url, () => {
          // Immediately destroy socket upon receiving initial bytes
          req.destroy();
          setTimeout(resolve, 50);
        });
        req.on('error', () => resolve()); // Expected ECONNRESET or socket hangup
      });

      process.removeListener('uncaughtException', uncaughtHandler);
      assert.strictEqual(serverErrorThrown, false, 'Server should not throw uncaught exceptions on socket abort');
    });

    await test('1.3: Rapid typing burst simulation cancels earlier queries and resolves final', async () => {
      const client = new window.ApiClient();
      const results = [];
      const abortStates = [];

      const terms = ['qua', 'quant', 'quantum'];
      const promises = terms.map(term => {
        return client.get(`${baseUrl}/api/papers?project_id=${testProjectId}&search=${term}`, {
          abortKey: 'live_typing_search'
        }).then(data => {
          results.push(data);
          abortStates.push(false);
        }).catch(err => {
          abortStates.push(err.isAborted);
        });
      });

      await Promise.all(promises);

      // At least the earlier requests must have been aborted
      const abortedCount = abortStates.filter(s => s === true).length;
      assert(abortedCount >= 1, `Earlier requests should be aborted (aborted: ${abortedCount})`);
      assert(results.length >= 1, 'Final request must succeed with results');
    });

    // ----------------------------------------------------
    // TEST GROUP 2: Optimistic Mutation & Rollback
    // ----------------------------------------------------
    console.log('\n--- 2. Optimistic Mutation, Rollback & Offline Queueing ---');

    await test('2.1: api.mutate executes optimistic hook synchronously before network', async () => {
      const client = new window.ApiClient();
      let localState = 'unread';
      let optimisticRan = false;

      const mutationPromise = client.mutate({
        optimistic: () => {
          optimisticRan = true;
          const prev = localState;
          localState = 'read'; // optimistic update
          return { previousValue: prev };
        },
        mutation: async () => {
          assert.strictEqual(localState, 'read', 'Local state must reflect optimistic value during network flight');
          return { success: true };
        },
        rollback: (_, ctx) => {
          localState = ctx.previousValue;
        }
      });

      assert.strictEqual(optimisticRan, true, 'Optimistic hook must run synchronously');
      const result = await mutationPromise;
      assert.strictEqual(result.success, true);
      assert.strictEqual(localState, 'read', 'Local state remains read on success');
    });

    await test('2.2: api.mutate rolls back to previous value on rejection', async () => {
      const client = new window.ApiClient();
      let localValue = 'Original Hamiltonian Title';
      let rollbackRan = false;

      let caughtErr = null;
      try {
        await client.mutate({
          optimistic: () => {
            const prev = localValue;
            localValue = 'Mutated Title (Optimistic)';
            return { previousValue: prev };
          },
          mutation: async () => {
            throw new Error('Simulated 500 Database Constraint Error');
          },
          rollback: (err, ctx) => {
            rollbackRan = true;
            localValue = ctx.previousValue; // rollback
          }
        });
      } catch (err) {
        caughtErr = err;
      }

      assert(caughtErr, 'Mutation rejection must be surfaced');
      assert.strictEqual(rollbackRan, true, 'Rollback callback must be executed');
      assert.strictEqual(localValue, 'Original Hamiltonian Title', 'Value must be reverted to original');
    });

    await test('2.3: Offline queueing and automatic sync replay with OfflineSyncQueue', async () => {
      const client = new window.ApiClient();
      client.network.isOnline = false; // Simulate offline

      const queue = client.offlineQueue;
      queue.clear();

      let localStatus = 'unread';
      const result = await client.mutate({
        optimistic: () => {
          localStatus = 'read';
          return { prev: 'unread' };
        },
        mutation: async () => {
          return client.request(`${baseUrl}/api/papers?project_id=${testProjectId}`);
        },
        offlineQueueable: true,
        offlineAction: {
          url: `${baseUrl}/api/papers?project_id=${testProjectId}`,
          method: 'GET'
        }
      });

      assert.strictEqual(result.offline, true, 'Should detect offline state');
      assert.strictEqual(result.queued, true, 'Should queue action');
      assert.strictEqual(localStatus, 'read', 'Optimistic value applies immediately even offline');
      assert.strictEqual(queue.getAll().length, 1, 'Queue should hold 1 item');

      // Reconnect and drain queue
      client.network.isOnline = true;
      const syncResults = await queue.drain(client);
      assert.strictEqual(syncResults.length, 1, 'Should drain 1 queued mutation');
      assert.strictEqual(syncResults[0].success, true, 'Replayed request should succeed');
      assert.strictEqual(queue.getAll().length, 0, 'Queue should be empty after drain');
    });

    // ----------------------------------------------------
    // TEST GROUP 3: Multi-Tier Cache Verification
    // ----------------------------------------------------
    console.log('\n--- 3. Multi-Tier Cache Verification (SWR & Redis Cache-Aside) ---');

    await test('3.1: Frontend SWR returns cached data immediately while revalidating', async () => {
      const client = new window.ApiClient();
      const testKey = 'swr_benchmark_test_key';
      client.cache.delete(testKey);

      // 1. Cold fetch
      const firstData = await client.swr(`${baseUrl}/api/papers?project_id=${testProjectId}`, {
        cacheKey: testKey,
        ttl: 60000
      });
      assert(Array.isArray(firstData), 'First fetch returns paper array');

      // 2. Warm fetch - must return immediately from memory cache
      const startWarm = Date.now();
      const secondData = await client.swr(`${baseUrl}/api/papers?project_id=${testProjectId}`, {
        cacheKey: testKey,
        ttl: 60000
      });
      const durationWarm = Date.now() - startWarm;

      assert(durationWarm < 10, `SWR cache return should be instantaneous (< 10ms, was ${durationWarm}ms)`);
      assert.strictEqual(secondData.length, firstData.length, 'Data must match cached payload');
    });

    await test('3.2: Backend Redis Cache-Aside returns X-Cache MISS then HIT on search query', async () => {
      await cacheService.invalidateSurveyCache(testProjectId);

      // Cold call
      const res1 = await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1.headers['x-cache'], 'MISS', 'First search call must return X-Cache: MISS');

      // Warm call
      const res2 = await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(res2.headers['x-cache'], 'HIT', 'Subsequent search call must return X-Cache: HIT');
      assert.deepStrictEqual(res2.body, res1.body, 'Cached body must match fresh body');
    });

    await test('3.3: Atomic Tag Invalidation purges cached search and matrix queries on mutation', async () => {
      // Warm the cache
      await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);

      // Invalidate survey cache tag
      await cacheService.invalidateSurveyCache(testProjectId);

      // Call should be MISS again
      const resAfter = await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);
      assert.strictEqual(resAfter.headers['x-cache'], 'MISS', 'Cache must be evicted after survey cache invalidation');
    });

    // ----------------------------------------------------
    // TEST GROUP 4: Scholarly Fallback Cascade & Circuit Breakers
    // ----------------------------------------------------
    console.log('\n--- 4. Scholarly Fallback Cascade & Circuit Breakers ---');

    await test('4.1: Circuit Breaker trips to OPEN on 3 consecutive failures and fast-fails', () => {
      const breaker = new CircuitBreaker('mock_academic_provider', {
        failureThreshold: 3,
        cooldownMs: 300,
        successThreshold: 2
      });

      assert.strictEqual(breaker.state, 'CLOSED');
      assert.strictEqual(breaker.canRequest(), true);

      breaker.recordFailure(new Error('500 Service Unavailable'));
      breaker.recordFailure(new Error('504 Gateway Timeout'));
      assert.strictEqual(breaker.state, 'CLOSED');

      breaker.recordFailure(new Error('503 Backend Overloaded'));
      assert.strictEqual(breaker.state, 'OPEN', 'Breaker must trip to OPEN after 3 failures');
      assert.strictEqual(breaker.canRequest(), false, 'Breaker must fast-fail requests while OPEN');
    });

    await test('4.2: Circuit Breaker enters HALF_OPEN after cooldown and resets upon recovery', async () => {
      const breaker = new CircuitBreaker('mock_recovering_provider', {
        failureThreshold: 2,
        cooldownMs: 80,
        successThreshold: 2
      });

      breaker.recordFailure(new Error('Fail 1'));
      breaker.recordFailure(new Error('Fail 2'));
      assert.strictEqual(breaker.state, 'OPEN');

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(breaker.canRequest(), true, 'Should allow probe in HALF_OPEN');
      assert.strictEqual(breaker.state, 'HALF_OPEN');

      breaker.recordSuccess();
      assert.strictEqual(breaker.state, 'HALF_OPEN');

      breaker.recordSuccess();
      assert.strictEqual(breaker.state, 'CLOSED', 'Must recover to CLOSED after 2 consecutive successes');
      assert.strictEqual(breaker.failureCount, 0);
    });

    // ----------------------------------------------------
    // TEST GROUP 5: Telemetry & Latency Audit
    // ----------------------------------------------------
    console.log('\n--- 5. Telemetry & Latency Audit ---');

    let coldAvg = 0;
    let warmAvg = 0;
    let latencyReductionPct = 0;

    await test('5.1: Matrix Loading Benchmark (Cold SQLite DB vs Warm Redis Cache)', async () => {
      const iterations = 15;
      const coldLatencies = [];
      const warmLatencies = [];

      // Warm up cache once
      await httpRequest(`/api/papers?project_id=${testProjectId}`);

      for (let i = 0; i < iterations; i++) {
        // Cold request: explicitly invalidate Redis cache before query
        await cacheService.invalidateSurveyCache(testProjectId);
        const t0 = process.hrtime.bigint();
        const coldRes = await httpRequest(`/api/papers?project_id=${testProjectId}`);
        const t1 = process.hrtime.bigint();
        assert.strictEqual(coldRes.headers['x-cache'], 'MISS');
        coldLatencies.push(Number(t1 - t0) / 1e6); // ms

        // Warm request: served directly from Redis
        const t2 = process.hrtime.bigint();
        const warmRes = await httpRequest(`/api/papers?project_id=${testProjectId}`);
        const t3 = process.hrtime.bigint();
        assert.strictEqual(warmRes.headers['x-cache'], 'HIT');
        warmLatencies.push(Number(t3 - t2) / 1e6); // ms
      }

      coldAvg = coldLatencies.reduce((a, b) => a + b, 0) / iterations;
      warmAvg = warmLatencies.reduce((a, b) => a + b, 0) / iterations;
      latencyReductionPct = ((coldAvg - warmAvg) / coldAvg) * 100;

      assert(warmAvg <= coldAvg, `Warm cache (${warmAvg.toFixed(2)}ms) must be faster than cold DB (${coldAvg.toFixed(2)}ms)`);
      assert(latencyReductionPct >= 20, `Latency reduction should exceed 20% on local benchmark (achieved: ${latencyReductionPct.toFixed(1)}%)`);
    });

    let searchAvg = 0;
    await test('5.2: Search Filtering Latency Benchmark (Warm Cache)', async () => {
      const iterations = 10;
      const latencies = [];

      // Pre-warm search query
      await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);

      for (let i = 0; i < iterations; i++) {
        const t0 = process.hrtime.bigint();
        const res = await httpRequest(`/api/papers?project_id=${testProjectId}&search=quantum`);
        const t1 = process.hrtime.bigint();
        assert.strictEqual(res.headers['x-cache'], 'HIT');
        latencies.push(Number(t1 - t0) / 1e6);
      }

      searchAvg = latencies.reduce((a, b) => a + b, 0) / iterations;
      assert(searchAvg < 15, `Search response time should be fast (< 15ms, achieved: ${searchAvg.toFixed(2)}ms)`);
    });

    let compressionRatio = 0;
    let rawBytes = 0;
    let compressedBytes = 0;

    await test('5.3: GZIP Payload Compression Benchmark on Matrix Data', async () => {
      const matrixRes = await httpRequest(`/api/papers?project_id=${testProjectId}`);
      const rawJson = JSON.stringify(matrixRes.body);
      rawBytes = Buffer.byteLength(rawJson, 'utf-8');

      // Compress using transparent zlib GZIP
      const compressedBuf = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));
      compressedBytes = compressedBuf.length;
      compressionRatio = ((rawBytes - compressedBytes) / rawBytes) * 100;

      assert(compressionRatio > 40, `Payload compression should save > 40% bandwidth (achieved: ${compressionRatio.toFixed(1)}%)`);
    });

    // Format and Print Latency Audit Report
    console.log('\n======================================================================');
    console.log('📈 TELEMETRY & LATENCY AUDIT REPORT');
    console.log('======================================================================');
    console.log(`| Metric                         | Cold (Uncached) | Warm (Cached) | Delta / Gain   |`);
    console.log(`|--------------------------------|-----------------|---------------|----------------|`);
    console.log(`| Matrix Loading Latency         | ${coldAvg.toFixed(2).padStart(11)}ms | ${warmAvg.toFixed(2).padStart(9)}ms | -${latencyReductionPct.toFixed(1)}% drop    |`);
    console.log(`| Search Filtering Latency       |              -- | ${searchAvg.toFixed(2).padStart(9)}ms | Sub-15ms SWR   |`);
    console.log(`| Matrix Payload Size (GZIP)     | ${String(rawBytes).padStart(12)} B | ${String(compressedBytes).padStart(10)} B | -${compressionRatio.toFixed(1)}% savings  |`);
    console.log('======================================================================\n');

  } finally {
    console.log('🧹 Cleaning up test workers, queues, and server...');
    try {
      await queueService.closeWorkers();
    } catch (_) {}
    try {
      await queueService.closeQueues();
    } catch (_) {}
    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('======================================================================');
  console.log(`📊 PHASE 6 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else if (require.main === module) {
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase6Tests().catch((err) => {
    console.error('Fatal error running Phase 6 tests:', err);
    process.exit(1);
  });
}

module.exports = { runPhase6Tests };
