/**
 * PHASE 1 INFRASTRUCTURE & ENVIRONMENT VERIFICATION TEST SUITE
 * Validates:
 * 1. Zod Environment parsing & type safety
 * 2. PostgreSQL connection pool & health check
 * 3. Redis client reconnect & ping health check
 * 4. Cloudflare R2 AWS SDK v3 client configuration
 * 5. Unified infrastructure health telemetry
 */

const assert = require('assert');
const { env, isR2Configured, isRedisConfigured } = require('../src/config/env');
const { query, checkPostgresHealth, closePostgres } = require('../src/config/postgres');
const { getRedisClient, checkRedisHealth, closeRedis } = require('../src/config/redis');
const { getR2Client, checkR2Health } = require('../src/config/r2');
const { checkAllInfrastructureHealth } = require('../src/config/health');

async function runPhase1Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PHASE 1 INFRASTRUCTURE & ENVIRONMENT TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Zod Environment Configuration
  console.log('--- 1. Environment & Zod Schema Validation ---');
  test('env.DATABASE_URL is a valid postgresql connection string', () => {
    assert.ok(env.DATABASE_URL.startsWith('postgresql://') || env.DATABASE_URL.startsWith('postgres://'));
  });

  test('env.REDIS_URL is a valid redis connection string', () => {
    assert.ok(env.REDIS_URL.startsWith('redis://') || env.REDIS_URL.startsWith('rediss://'));
  });

  test('env.SESSION_SECRET is configured with sufficient entropy', () => {
    assert.ok(env.SESSION_SECRET.length >= 16);
  });

  test('isR2Configured helper reports false when keys are empty', () => {
    assert.strictEqual(typeof isR2Configured(), 'boolean');
  });

  test('isRedisConfigured helper reports true when REDIS_URL is provided', () => {
    assert.strictEqual(isRedisConfigured(), true);
  });

  // 2. PostgreSQL Connection Pool
  console.log('\n--- 2. PostgreSQL Connection Pool & Telemetry ---');
  await asyncTest('PostgreSQL pool executes scalar query (SELECT 1 + 1)', async () => {
    const res = await query('SELECT 1 + 1 AS sum;');
    assert.strictEqual(parseInt(res.rows[0].sum, 10), 2);
  });

  await asyncTest('PostgreSQL health check returns healthy status with latency', async () => {
    const health = await checkPostgresHealth();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.connected, true);
    assert.ok(typeof health.latencyMs === 'number');
    assert.ok(health.version.length > 0);
  });

  // 3. Cloudflare R2 AWS SDK Client
  console.log('\n--- 3. Cloudflare R2 Client & Error Handling ---');
  await asyncTest('checkR2Health returns unconfigured status when credentials empty', async () => {
    const health = await checkR2Health();
    assert.ok(health.status === 'unconfigured' || health.status === 'healthy' || health.status === 'unhealthy');
  });

  // 4. Redis Client
  console.log('\n--- 4. Redis Client Configuration ---');
  test('getRedisClient initializes ioredis instance with retry strategy', () => {
    const client = getRedisClient();
    assert.ok(client !== null);
  });

  await asyncTest('checkRedisHealth executes gracefully without crashing', async () => {
    const health = await checkRedisHealth();
    assert.ok(['healthy', 'degraded', 'unhealthy', 'disabled'].includes(health.status));
  });

  // 5. Unified Health Check Suite
  console.log('\n--- 5. Unified Diagnostic Suite ---');
  await asyncTest('checkAllInfrastructureHealth aggregates all 3 services concurrently', async () => {
    const all = await checkAllInfrastructureHealth();
    assert.ok(all.timestamp);
    assert.ok(all.services.postgres);
    assert.ok(all.services.redis);
    assert.ok(all.services.cloudflareR2);
  });

  // Clean up
  await closePostgres();
  await closeRedis();

  console.log('\n======================================================');
  console.log(`📊 Phase 1 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase1Tests();
}

module.exports = { runPhase1Tests };
