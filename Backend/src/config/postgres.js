const { Pool } = require('pg');
const { env } = require('./env');

let pool = null;

function getPostgresPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected client error on idle connection:', err.message);
    });

    pool.on('connect', () => {
      // Optional debug logging
    });
  }
  return pool;
}

/**
 * Execute a SQL query with parameter binding and latency tracking
 */
async function query(text, params = []) {
  const start = Date.now();
  const client = getPostgresPool();
  try {
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    if (duration > 250 && env.NODE_ENV !== 'test') {
      console.warn(`[PostgreSQL] Slow query detected (${duration}ms):`, text);
    }
    return res;
  } catch (error) {
    console.error('[PostgreSQL] Query execution error:', error.message);
    throw error;
  }
}

/**
 * Retrieve a dedicated client from the pool for multi-statement transactions
 */
async function getClient() {
  const p = getPostgresPool();
  return await p.connect();
}

/**
 * Perform a live ping health-check on the PostgreSQL database
 */
async function checkPostgresHealth() {
  const start = Date.now();
  try {
    const p = getPostgresPool();
    const result = await p.query('SELECT 1 AS alive, version() AS version;');
    const latencyMs = Date.now() - start;
    return {
      status: 'healthy',
      connected: true,
      latencyMs,
      version: result.rows[0]?.version?.split(' ')?.[1] || 'PostgreSQL 14+',
      poolTotal: p.totalCount,
      poolIdle: p.idleCount,
      poolWaiting: p.waitingCount,
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
 * Gracefully close the PostgreSQL connection pool
 */
async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPostgresPool,
  query,
  getClient,
  checkPostgresHealth,
  closePostgres,
};
