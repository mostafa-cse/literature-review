const Redis = require('ioredis');
const { env, isRedisConfigured } = require('./env');

// Deduplicate repetitive BullMQ eviction policy warnings across multiple queue/worker connections
if (!global.__bullmq_eviction_warning_deduped) {
  global.__bullmq_eviction_warning_deduped = true;
  const originalWarn = console.warn;
  let evictionWarned = false;
  console.warn = function (...args) {
    if (typeof args[0] === 'string' && args[0].includes('Eviction policy is')) {
      if (!evictionWarned) {
        evictionWarned = true;
        const match = args[0].match(/is\s+([^\.]+)/);
        const policy = match ? match[1].trim() : 'volatile-lru';
        originalWarn.call(
          console,
          `ℹ️ [BullMQ] Redis eviction policy is '${policy}'. (Recommended: 'noeviction' in Redis Cloud settings for production queue durability; safely supported in dev/cloud).`
        );
      }
      return; // Suppress duplicate console spam
    }
    return originalWarn.apply(console, args);
  };
}

let redisClient = null;

function getRedisClient() {
  if (!redisClient && isRedisConfigured()) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 20000,
      keepAlive: 15000,
      family: 4,
      retryStrategy(times) {
        // Exponential backoff with jitter up to max 3000ms
        const delay = Math.min(times * 150, 3000);
        if (times > 10 && env.NODE_ENV === 'development') {
          // In development, stop hammering if Redis is not running locally
          return null;
        }
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
        return targetErrors.some(target => (err && err.message ? err.message.includes(target) : false));
      },
      lazyConnect: false,
    });

    redisClient.on('connect', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('⚡ [Redis] Connecting to cache cluster...');
      }
    });

    redisClient.on('ready', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('✅ [Redis] Cache cluster connection ready');
      }
    });

    redisClient.on('error', (err) => {
      if (env.NODE_ENV !== 'test') {
        console.warn('⚠️ [Redis] Client connection warning:', err.message);
      }
    });

    redisClient.on('close', () => {
      // Connection closed
    });

    redisClient.on('reconnecting', (delay) => {
      if (env.NODE_ENV !== 'test') {
        console.log(`🔄 [Redis] Reconnecting in ${delay}ms...`);
      }
    });
  }
  return redisClient;
}

/**
 * Ping health-check to verify Redis connectivity and roundtrip latency
 */
async function checkRedisHealth() {
  const start = Date.now();
  try {
    const client = getRedisClient();
    if (!client) {
      return {
        status: 'disabled',
        connected: false,
        message: 'Redis URL not configured',
      };
    }

    const pong = await client.ping();
    const latencyMs = Date.now() - start;

    let memoryUsedHuman = 'N/A';
    try {
      const memInfo = await client.info('memory');
      const match = memInfo.match(/used_memory_human:(.+)/);
      if (match) memoryUsedHuman = match[1].trim();
    } catch {
      // Info parsing optional
    }

    return {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      connected: true,
      latencyMs,
      memoryUsed: memoryUsedHuman,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error.message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Connection options required for BullMQ queues, workers, and events
 * (BullMQ mandates maxRetriesPerRequest: null)
 */
function getBullMQConnectionOptions() {
  if (!isRedisConfigured()) {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      connectTimeout: 20000,
      keepAlive: 15000,
      family: 4,
    };
  }

  try {
    const parsed = new URL(env.REDIS_URL);
    const isTls = parsed.protocol === 'rediss:';
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || '6379', 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 30000,
      keepAlive: 15000,
      family: 4,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy(times) {
        // Capped exponential retry strategy up to 5000ms
        return Math.min(times * 250, 5000);
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
        return targetErrors.some(target => (err && err.message ? err.message.includes(target) : false));
      },
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
      connectTimeout: 20000,
      keepAlive: 15000,
      family: 4,
    };
  }
}

/**
 * Gracefully disconnect Redis
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit().catch(() => redisClient.disconnect());
    redisClient = null;
  }
}

module.exports = {
  getRedisClient,
  getBullMQConnectionOptions,
  checkRedisHealth,
  closeRedis,
};
