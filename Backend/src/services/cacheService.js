const crypto = require('crypto');
const { getRedisClient } = require('../config/redis');
const { env } = require('../config/env');

// Key prefixes
const PREFIX_SURVEY = 'litsphere:survey:';
const PREFIX_STATS = 'litsphere:stats:';
const PREFIX_LOCK = 'litsphere:lock:';

// Default TTL configurations (in seconds)
const TTL_MATRIX = 3600;       // 1 hour
const TTL_CLUSTERS = 3600;     // 1 hour
const TTL_COLUMNS = 3600;      // 1 hour
const TTL_STATS = 300;         // 5 minutes
const TTL_DEFAULT = 600;       // 10 minutes

// In-memory fallback store if Redis is offline
const memoryCache = new Map();
const memoryExpiry = new Map();
const memoryLocks = new Map();

/**
 * Check if an in-memory key has expired
 */
function isMemoryExpired(key) {
  const expiresAt = memoryExpiry.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    memoryCache.delete(key);
    memoryExpiry.delete(key);
    return true;
  }
  return false;
}

/**
 * Low-level GET with fallback
 */
async function get(key) {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    try {
      const data = await redis.get(key);
      if (data === null || data === undefined) return null;
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`⚠️ [Cache] Redis GET failed for "${key}":`, err.message);
      }
    }
  }

  // Fallback to in-memory store
  if (isMemoryExpired(key)) return null;
  return memoryCache.has(key) ? memoryCache.get(key) : null;
}

/**
 * Low-level SET with TTL and fallback
 */
async function set(key, value, ttlSeconds = TTL_DEFAULT) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const redis = getRedisClient();

  if (redis && redis.status === 'ready') {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await redis.set(key, serialized);
      }
      return true;
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`⚠️ [Cache] Redis SET failed for "${key}":`, err.message);
      }
    }
  }

  // Fallback to in-memory store
  memoryCache.set(key, value);
  if (ttlSeconds && ttlSeconds > 0) {
    memoryExpiry.set(key, Date.now() + ttlSeconds * 1000);
  } else {
    memoryExpiry.delete(key);
  }
  return true;
}

/**
 * Low-level DEL with fallback
 */
async function del(...keys) {
  if (!keys || keys.length === 0) return 0;
  const flatKeys = keys.flat().filter(Boolean);
  if (flatKeys.length === 0) return 0;

  let deletedCount = 0;
  const redis = getRedisClient();

  if (redis && redis.status === 'ready') {
    try {
      deletedCount = await redis.del(...flatKeys);
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.warn('⚠️ [Cache] Redis DEL failed:', err.message);
      }
    }
  }

  // Also clean memory store
  for (const k of flatKeys) {
    if (memoryCache.has(k)) {
      memoryCache.delete(k);
      memoryExpiry.delete(k);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Delete keys matching a pattern (e.g. "litsphere:survey:1:*")
 */
async function delByPattern(pattern) {
  const redis = getRedisClient();
  let deletedCount = 0;

  if (redis && redis.status === 'ready') {
    try {
      let cursor = '0';
      do {
        const [nextCursor, matchedKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (matchedKeys && matchedKeys.length > 0) {
          const removed = await redis.del(...matchedKeys);
          deletedCount += removed;
        }
      } while (cursor !== '0');
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`⚠️ [Cache] Redis scan/delete pattern "${pattern}" failed:`, err.message);
      }
    }
  }

  // Clean memory store matching regex
  const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const k of memoryCache.keys()) {
    if (regexPattern.test(k)) {
      memoryCache.delete(k);
      memoryExpiry.delete(k);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * High-performance Cache-Aside strategy helper.
 * 1. Checks Redis cache.
 * 2. On cache hit: returns cached payload immediately (sub-millisecond).
 * 3. On cache miss: executes fetcherFn(), writes result to Redis with TTL, returns data.
 */
async function getOrSet(key, ttlSeconds, fetcherFn) {
  const cached = await get(key);
  if (cached !== null && cached !== undefined) {
    return { data: cached, cached: true };
  }

  // Cache miss: execute fetcher
  const freshData = await fetcherFn();
  if (freshData !== null && freshData !== undefined) {
    await set(key, freshData, ttlSeconds);
  }
  return { data: freshData, cached: false };
}

// ==========================================
// DOMAIN-SPECIFIC CACHE GETTERS & SETTERS
// ==========================================

/**
 * Survey benchmark matrix cache-aside
 * Key: litsphere:survey:{id}:matrix
 */
async function getSurveyMatrix(surveyId, fetcherFn) {
  const key = `${PREFIX_SURVEY}${surveyId}:matrix`;
  return getOrSet(key, TTL_MATRIX, fetcherFn);
}

/**
 * Taxonomy cluster hierarchy cache-aside
 * Key: litsphere:survey:{id}:clusters
 */
async function getSurveyClusters(surveyId, fetcherFn) {
  const key = `${PREFIX_SURVEY}${surveyId}:clusters`;
  return getOrSet(key, TTL_CLUSTERS, fetcherFn);
}

/**
 * Dynamic column schema cache-aside
 * Key: litsphere:survey:{id}:columns:{clusterId || 'all'}
 */
async function getSurveyColumns(surveyId, clusterId, fetcherFn) {
  const key = `${PREFIX_SURVEY}${surveyId}:columns:${clusterId || 'all'}`;
  return getOrSet(key, TTL_COLUMNS, fetcherFn);
}

/**
 * Live platform & dashboard telemetry stats cache-aside
 * Global key: litsphere:stats:global
 * Survey key: litsphere:stats:survey:{id}
 */
async function getStats(surveyId, fetcherFn) {
  const key = surveyId ? `${PREFIX_STATS}survey:${surveyId}` : `${PREFIX_STATS}global`;
  return getOrSet(key, TTL_STATS, fetcherFn);
}

// ==========================================
// GRANULAR CACHE INVALIDATION
// ==========================================

/**
 * Granularly invalidate all cache keys associated with a survey:
 * - litsphere:survey:{id}:matrix
 * - litsphere:survey:{id}:clusters
 * - litsphere:survey:{id}:columns:*
 * - litsphere:stats:survey:{id}
 * - litsphere:stats:global
 */
async function invalidateSurveyCache(surveyId) {
  if (!surveyId) {
    return invalidateGlobalStats();
  }
  const sid = String(surveyId);
  const keysToDel = [
    `${PREFIX_SURVEY}${sid}:matrix`,
    `${PREFIX_SURVEY}${sid}:clusters`,
    `${PREFIX_STATS}survey:${sid}`,
    `${PREFIX_STATS}global`
  ];

  // Remove exact keys
  await del(...keysToDel);

  // Remove wildcard keys (e.g. columns for different clusters)
  await delByPattern(`${PREFIX_SURVEY}${sid}:*`);
}

/**
 * Invalidate only the matrix for a survey (e.g. on cell value edits)
 */
async function invalidateSurveyMatrix(surveyId) {
  if (!surveyId) return;
  const sid = String(surveyId);
  await del(`${PREFIX_SURVEY}${sid}:matrix`);
}

/**
 * Invalidate taxonomy clusters and matrix
 */
async function invalidateSurveyClusters(surveyId) {
  if (!surveyId) return;
  const sid = String(surveyId);
  await del(
    `${PREFIX_SURVEY}${sid}:clusters`,
    `${PREFIX_SURVEY}${sid}:matrix`,
    `${PREFIX_STATS}survey:${sid}`,
    `${PREFIX_STATS}global`
  );
}

/**
 * Invalidate dynamic columns schema and matrix
 */
async function invalidateSurveyColumns(surveyId) {
  if (!surveyId) return;
  const sid = String(surveyId);
  await del(`${PREFIX_SURVEY}${sid}:matrix`);
  await delByPattern(`${PREFIX_SURVEY}${sid}:columns:*`);
}

/**
 * Invalidate platform-wide telemetry stats
 */
async function invalidateGlobalStats() {
  await del(`${PREFIX_STATS}global`);
  await delByPattern(`${PREFIX_STATS}*`);
}

// ==========================================
// DISTRIBUTED LOCKING (Redlock / SET NX EX)
// ==========================================

// Lua script to release lock atomically ONLY if the token matches
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire a distributed lock on a resource.
 * @param {string} resourceKey - Name of resource (e.g. "survey:1:matrix")
 * @param {number} ttlSeconds - Time-to-live before auto-expiry (preventing deadlocks)
 * @param {object} options - Options { maxWaitMs: 3000, retryIntervalMs: 50 }
 * @returns {Promise<{ acquired: boolean, token: string|null, key: string }>}
 */
async function acquireLock(resourceKey, ttlSeconds = 10, options = {}) {
  const maxWaitMs = options.maxWaitMs !== undefined ? options.maxWaitMs : 3000;
  const retryIntervalMs = options.retryIntervalMs !== undefined ? options.retryIntervalMs : 50;
  const lockKey = `${PREFIX_LOCK}${resourceKey}`;
  const token = crypto.randomUUID();
  const startTime = Date.now();

  const redis = getRedisClient();

  while (true) {
    if (redis && redis.status === 'ready') {
      try {
        const result = await redis.set(lockKey, token, 'NX', 'EX', ttlSeconds);
        if (result === 'OK') {
          return { acquired: true, token, key: lockKey };
        }
      } catch (err) {
        if (env.NODE_ENV !== 'test') {
          console.warn(`⚠️ [Lock] Redis SET NX failed for "${lockKey}":`, err.message);
        }
      }
    } else {
      // In-memory fallback mutex
      const current = memoryLocks.get(lockKey);
      if (!current || Date.now() > current.expiresAt) {
        memoryLocks.set(lockKey, {
          token,
          expiresAt: Date.now() + ttlSeconds * 1000
        });
        return { acquired: true, token, key: lockKey };
      }
    }

    // Check if timeout exceeded
    if (Date.now() - startTime >= maxWaitMs) {
      return { acquired: false, token: null, key: lockKey, error: 'Lock acquisition timed out' };
    }

    // Wait with small randomized jitter before retry
    const jitter = Math.floor(Math.random() * 20);
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs + jitter));
  }
}

/**
 * Release a distributed lock safely using an atomic Lua script.
 * Prevents releasing a lock that has expired and been acquired by another worker.
 * @param {string} resourceKey - Name of resource (e.g. "survey:1:matrix")
 * @param {string} token - The unique token returned when acquiring the lock
 * @returns {Promise<boolean>} - True if lock was owned and deleted, false otherwise
 */
async function releaseLock(resourceKey, token) {
  if (!token) return false;
  const lockKey = resourceKey.startsWith(PREFIX_LOCK) ? resourceKey : `${PREFIX_LOCK}${resourceKey}`;
  const redis = getRedisClient();

  if (redis && redis.status === 'ready') {
    try {
      const res = await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, token);
      return Number(res) === 1;
    } catch (err) {
      if (env.NODE_ENV !== 'test') {
        console.warn(`⚠️ [Lock] Lua release failed for "${lockKey}":`, err.message);
      }
    }
  }

  // Memory fallback release
  const current = memoryLocks.get(lockKey);
  if (current && current.token === token) {
    memoryLocks.delete(lockKey);
    return true;
  }
  return false;
}

/**
 * High-level wrapper executing an async callback with distributed lock protection.
 * Automatically acquires and releases the lock in a try/finally block.
 */
async function withLock(resourceKey, ttlSeconds, fn, options = {}) {
  const lock = await acquireLock(resourceKey, ttlSeconds, options);
  if (!lock.acquired) {
    const error = new Error(`Failed to acquire distributed lock for resource: ${resourceKey}`);
    error.statusCode = 423; // HTTP 423 Locked
    throw error;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(resourceKey, lock.token);
  }
}

module.exports = {
  // Low-level primitives
  get,
  set,
  del,
  delByPattern,
  getOrSet,

  // Domain cache getters
  getSurveyMatrix,
  getSurveyClusters,
  getSurveyColumns,
  getStats,

  // Granular invalidation
  invalidateSurveyCache,
  invalidateSurveyMatrix,
  invalidateSurveyClusters,
  invalidateSurveyColumns,
  invalidateGlobalStats,

  // Distributed locking
  acquireLock,
  releaseLock,
  withLock,

  // Constants
  PREFIX_SURVEY,
  PREFIX_STATS,
  PREFIX_LOCK,
  TTL_MATRIX,
  TTL_CLUSTERS,
  TTL_COLUMNS,
  TTL_STATS,
};
