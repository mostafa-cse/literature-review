const { checkPostgresHealth, closePostgres } = require('./postgres');
const { checkRedisHealth, closeRedis } = require('./redis');
const { checkR2Health } = require('./r2');
const { env } = require('./env');

/**
 * Check health of all infrastructure services concurrently
 */
async function checkAllInfrastructureHealth() {
  const [pgResult, redisResult, r2Result] = await Promise.allSettled([
    checkPostgresHealth(),
    checkRedisHealth(),
    checkR2Health(),
  ]);

  const postgres =
    pgResult.status === 'fulfilled'
      ? pgResult.value
      : { status: 'error', error: pgResult.reason?.message };

  const redis =
    redisResult.status === 'fulfilled'
      ? redisResult.value
      : { status: 'error', error: redisResult.reason?.message };

  const r2 =
    r2Result.status === 'fulfilled'
      ? r2Result.value
      : { status: 'error', error: r2Result.reason?.message };

  const allHealthy =
    postgres.status === 'healthy' &&
    (redis.status === 'healthy' || redis.status === 'disabled') &&
    (r2.status === 'healthy' || r2.status === 'unconfigured');

  return {
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    overallStatus: allHealthy ? 'HEALTHY' : 'DEGRADED',
    services: {
      postgres,
      redis,
      cloudflareR2: r2,
    },
  };
}

// Standalone CLI diagnostic runner
if (require.main === module) {
  (async () => {
    console.log('\n======================================================');
    console.log('🧪 LITSPHERE INFRASTRUCTURE DIAGNOSTIC & HEALTH SUITE');
    console.log('======================================================\n');

    const health = await checkAllInfrastructureHealth();

    console.log(`[Status] Overall: ${health.overallStatus === 'HEALTHY' ? '🟢 HEALTHY' : '🟡 DEGRADED'}`);
    console.log(`[Env]    Environment: ${health.environment}\n`);

    // PostgreSQL
    console.log('--- 1. PostgreSQL Database ---');
    if (health.services.postgres.status === 'healthy') {
      console.log(`  ✅ Status:   CONNECTED (${health.services.postgres.latencyMs}ms)`);
      console.log(`  ℹ️  Version:  ${health.services.postgres.version}`);
      console.log(`  📊 Pool:     ${health.services.postgres.poolTotal} total connections`);
    } else {
      console.log(`  ❌ Status:   DISCONNECTED (${health.services.postgres.error})`);
    }

    // Redis
    console.log('\n--- 2. Redis Cache Cluster ---');
    if (health.services.redis.status === 'healthy') {
      console.log(`  ✅ Status:   CONNECTED (${health.services.redis.latencyMs}ms)`);
      console.log(`  ℹ️  Memory:   ${health.services.redis.memoryUsed}`);
    } else if (health.services.redis.status === 'disabled') {
      console.log(`  ⚪ Status:   DISABLED (REDIS_URL not configured)`);
    } else {
      console.log(`  ⚠️ Status:   NOT REACHABLE (${health.services.redis.error || 'Check local Redis instance'})`);
    }

    // Cloudflare R2
    console.log('\n--- 3. Cloudflare R2 Object Storage ---');
    if (health.services.cloudflareR2.status === 'healthy') {
      console.log(`  ✅ Status:   AUTHENTICATED & ACCESSIBLE (${health.services.cloudflareR2.latencyMs}ms)`);
      console.log(`  ℹ️  Bucket:   ${health.services.cloudflareR2.bucket}`);
    } else if (health.services.cloudflareR2.status === 'unconfigured') {
      console.log(`  ⚪ Status:   NOT CONFIGURED (Provide R2_* credentials in .env to activate)`);
    } else {
      console.log(`  ⚠️ Status:   ERROR (${health.services.cloudflareR2.error})`);
    }

    console.log('\n======================================================\n');

    // Clean up connections for CLI exit
    await closePostgres();
    await closeRedis();
    process.exit(0);
  })();
}

module.exports = {
  checkAllInfrastructureHealth,
};
