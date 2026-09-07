const crypto = require('crypto');
const { getRedisClient } = require('../config/redis');
const { env } = require('../config/env');
const { getPrismaClient } = require('../config/prisma');
const { getDb } = require('../db');

// Session configuration constants
const COOKIE_NAME = 'litsphere_session';
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_SESSION_TTL_MS = DEFAULT_SESSION_TTL_SECONDS * 1000;
const SESSION_PREFIX = 'litsphere:session:';
const USER_SESSIONS_PREFIX = 'litsphere:user_sessions:';
const USER_VERSION_PREFIX = 'litsphere:user_version:';
const SLIDING_TOUCH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// In-memory fallback map if Redis is temporarily unreachable in dev/test
const memoryStore = new Map();
const memoryUserSessions = new Map();
const memoryUserVersions = new Map();

/**
 * Generate a 256-bit cryptographically secure session token
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Sign a cookie value using HMAC-SHA256 (compatible with Express cookie-parser signed cookies)
 * Format: s:<val>.<signature>
 */
function signCookieValue(val, secret = env.SESSION_SECRET) {
  if (!val || typeof val !== 'string') return '';
  const sig = crypto
    .createHmac('sha256', secret)
    .update(val)
    .digest('base64')
    .replace(/=+$/, '');
  return `s:${val}.${sig}`;
}

/**
 * Unsign a signed cookie value. Returns the original value if valid, or false if tampered/invalid.
 */
function unsignCookieValue(val, secret = env.SESSION_SECRET) {
  if (!val || typeof val !== 'string') return false;
  let str = val;
  if (str.startsWith('s:')) {
    str = str.slice(2);
  }
  const lastDot = str.lastIndexOf('.');
  if (lastDot === -1) return false;

  const rawVal = str.slice(0, lastDot);
  const sig = str.slice(lastDot + 1);

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(rawVal)
    .digest('base64')
    .replace(/=+$/, '');

  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return false;

  return rawVal;
}

/**
 * Get hardened cookie security options
 */
function getHardenedCookieOptions(overrides = {}) {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_SESSION_TTL_MS,
    ...overrides,
  };
}

/**
 * Attach hardened session cookie to Express response
 */
function attachSessionCookie(res, token, overrides = {}) {
  const options = getHardenedCookieOptions(overrides);
  // Express handles signing when signed: true is provided
  res.cookie(COOKIE_NAME, token, {
    ...options,
    signed: true,
  });
}

/**
 * Clear session cookie from Express response
 */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
}

/**
 * Normalize role string to uppercase standard
 */
function normalizeRole(role) {
  if (!role) return 'USER';
  return String(role).toUpperCase().trim();
}

/**
 * Create a new session in Redis and mirror to PostgreSQL / SQLite
 */
async function createSession(user, req = null, options = {}) {
  const token = generateSessionToken();
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlMs || DEFAULT_SESSION_TTL_MS));
  const ttlSeconds = Math.floor((options.ttlMs || DEFAULT_SESSION_TTL_MS) / 1000);

  const ipAddress = req
    ? req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || options.ipAddress || '127.0.0.1'
    : options.ipAddress || '127.0.0.1';
  const userAgent = req
    ? req.headers?.['user-agent'] || req.userAgent || options.userAgent || 'Unknown'
    : options.userAgent || 'API Client';

  const role = normalizeRole(user.role);
  const tokenVersion = Number(user.token_version || user.tokenVersion || 1);

  const sessionData = {
    id: sessionId,
    token,
    userId: Number(user.id),
    username: user.username || (user.email ? user.email.split('@')[0] : ''),
    name: user.name || user.username || 'Researcher',
    email: (user.email || '').toLowerCase(),
    role,
    status: user.status || 'ACTIVE',
    institution: user.institution || 'Academic Research Institute',
    tokenVersion,
    avatarUrl: user.avatar_url || user.avatarUrl || '',
    aiTokenQuota: Number(user.ai_token_quota !== undefined ? user.ai_token_quota : (user.aiTokenQuota !== undefined ? user.aiTokenQuota : 100000)),
    aiTokensUsed: Number(user.ai_tokens_used !== undefined ? user.ai_tokens_used : (user.aiTokensUsed !== undefined ? user.aiTokensUsed : 0)),
    storageQuotaMb: Number(user.storage_quota_mb !== undefined ? user.storage_quota_mb : (user.storageQuotaMb !== undefined ? user.storageQuotaMb : 500)),
    storageUsedMb: Number(user.storage_used_mb !== undefined ? user.storage_used_mb : (user.storageUsedMb !== undefined ? user.storageUsedMb : 0)),
    ipAddress,
    userAgent,
    createdAt: now.toISOString(),
    lastActive: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Always write to memoryStore for local resilience and connection warmup
  memoryStore.set(token, { data: sessionData, expiresAt: expiresAt.getTime() });
  if (!memoryUserSessions.has(user.id)) memoryUserSessions.set(user.id, new Set());
  memoryUserSessions.get(user.id).add(token);
  memoryUserVersions.set(user.id, tokenVersion);

  const redis = getRedisClient();
  if (redis) {
    try {
      const sessionKey = `${SESSION_PREFIX}${token}`;
      const userSessionsKey = `${USER_SESSIONS_PREFIX}${user.id}`;
      const userVersionKey = `${USER_VERSION_PREFIX}${user.id}`;

      const pipeline = redis.pipeline();
      pipeline.set(sessionKey, JSON.stringify(sessionData), 'EX', ttlSeconds);
      pipeline.sadd(userSessionsKey, token);
      pipeline.expire(userSessionsKey, ttlSeconds);
      pipeline.set(userVersionKey, tokenVersion, 'EX', ttlSeconds);
      await pipeline.exec();
    } catch {
      // Memory store is already populated
    }
  }

  // Dual-write to PostgreSQL / Prisma if available (non-blocking)
  try {
    const prisma = getPrismaClient();
    if (prisma && prisma.session) {
      prisma.session
        .create({
          data: {
            id: sessionId,
            userId: Number(user.id),
            token,
            expiresAt,
            ipAddress,
            userAgent,
            createdAt: now,
          },
        })
        .catch((err) => {
          // Non-fatal if DB mirroring fails
          if (env.NODE_ENV !== 'test') {
            console.warn('DB session mirroring notice:', err.message);
          }
        });
    }
  } catch {
    // Graceful catch for test environment
  }

  return {
    token,
    sessionId,
    expiresAt,
    session: sessionData,
  };
}

/**
 * Retrieve session synchronously from fast in-memory map
 */
function getSessionSync(token) {
  if (!token || typeof token !== 'string') return null;
  const mem = memoryStore.get(token);
  if (mem) {
    if (Date.now() > mem.expiresAt) {
      memoryStore.delete(token);
      return null;
    }
    return mem.data;
  }
  return null;
}

/**
 * Retrieve session by token with sub-millisecond lookup from Redis
 */
async function getSession(token) {
  if (!token || typeof token !== 'string') return null;

  let session = null;
  const redis = getRedisClient();

  if (redis && redis.status === 'ready') {
    try {
      const raw = await redis.get(`${SESSION_PREFIX}${token}`);
      if (raw) {
        session = JSON.parse(raw);
      }
    } catch {
      // Redis error fallback
    }
  }

  // If not found in Redis, check memoryStore fallback
  if (!session) {
    const mem = memoryStore.get(token);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        memoryStore.delete(token);
        return null;
      }
      session = mem.data;
      // If Redis is now ready, backfill to Redis
      if (redis && redis.status === 'ready') {
        const ttl = Math.max(60, Math.floor((mem.expiresAt - Date.now()) / 1000));
        redis.set(`${SESSION_PREFIX}${token}`, JSON.stringify(session), 'EX', ttl).catch(() => {});
      }
    }
  }

  if (!session) {
    // Fallback: check PostgreSQL Prisma session
    try {
      const prisma = getPrismaClient();
      if (prisma && prisma.session) {
        const dbSession = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });

        if (dbSession && new Date(dbSession.expiresAt).getTime() > Date.now()) {
          const u = dbSession.user;
          session = {
            id: dbSession.id,
            token: dbSession.token,
            userId: dbSession.userId,
            username: u.username || u.email.split('@')[0],
            name: u.name,
            email: u.email,
            role: normalizeRole(u.role),
            status: u.status,
            institution: u.institution,
            tokenVersion: u.tokenVersion,
            ipAddress: dbSession.ipAddress,
            userAgent: dbSession.userAgent,
            createdAt: dbSession.createdAt.toISOString(),
            lastActive: new Date().toISOString(),
            expiresAt: dbSession.expiresAt.toISOString(),
          };

          // Populate back into Redis cache
          if (redis && redis.status === 'ready') {
            const ttl = Math.max(
              60,
              Math.floor((new Date(dbSession.expiresAt).getTime() - Date.now()) / 1000)
            );
            await redis.set(`${SESSION_PREFIX}${token}`, JSON.stringify(session), 'EX', ttl);
          }
        }
      }
    } catch {
      // Prisma query optional
    }
  }

  if (!session) return null;

  // Verify account status
  if (session.status === 'DEACTIVATED' || session.status === 'BANNED' || session.status === 'deactivated' || session.status === 'banned') {
    await destroySession(token);
    return null;
  }

  // Fast token version validation: check Redis or memory
  let currentVersion = null;
  if (redis && redis.status === 'ready') {
    const ver = await redis.get(`${USER_VERSION_PREFIX}${session.userId}`);
    if (ver !== null) currentVersion = Number(ver);
  } else {
    currentVersion = memoryUserVersions.get(session.userId);
  }

  if (currentVersion !== null && session.tokenVersion < currentVersion) {
    await destroySession(token);
    return null;
  }

  // Sliding idle window update
  const lastActiveTime = new Date(session.lastActive).getTime();
  if (Date.now() - lastActiveTime > SLIDING_TOUCH_THRESHOLD_MS) {
    session.lastActive = new Date().toISOString();
    if (redis && redis.status === 'ready') {
      redis
        .set(
          `${SESSION_PREFIX}${token}`,
          JSON.stringify(session),
          'EX',
          DEFAULT_SESSION_TTL_SECONDS
        )
        .catch(() => {});
    } else {
      const mem = memoryStore.get(token);
      if (mem) {
        mem.data.lastActive = session.lastActive;
        mem.expiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;
      }
    }
  }

  return session;
}

/**
 * Destroy an individual session (single-device sign-out)
 */
async function destroySession(token) {
  if (!token) return;

  let session = null;

  // 1. Always purge from local memoryStore
  const mem = memoryStore.get(token);
  if (mem) {
    session = mem.data;
    memoryStore.delete(token);
    if (session && session.userId && memoryUserSessions.has(session.userId)) {
      memoryUserSessions.get(session.userId).delete(token);
    }
  }

  // 2. Purge from Redis
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    if (!session) {
      try {
        const raw = await redis.get(`${SESSION_PREFIX}${token}`);
        if (raw) session = JSON.parse(raw);
      } catch {}
    }

    const pipeline = redis.pipeline();
    pipeline.del(`${SESSION_PREFIX}${token}`);
    if (session && session.userId) {
      pipeline.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, token);
    }
    await pipeline.exec();
  }

  // 3. Mirror delete to PostgreSQL / Prisma
  try {
    const prisma = getPrismaClient();
    if (prisma && prisma.session) {
      prisma.session.deleteMany({ where: { token } }).catch(() => {});
    }
  } catch {}

  return true;
}

/**
 * Revoke all active sessions for a user across all devices (multi-device revocation)
 * Optionally retains the current session token if provided.
 */
async function revokeAllUserSessions(userId, keepToken = null) {
  const numericUserId = Number(userId);
  if (!numericUserId) return;

  const redis = getRedisClient();
  let tokens = [];

  if (redis && redis.status === 'ready') {
    tokens = await redis.smembers(`${USER_SESSIONS_PREFIX}${numericUserId}`);
  }
  if (memoryUserSessions.has(numericUserId)) {
    const memTokens = Array.from(memoryUserSessions.get(numericUserId));
    tokens = Array.from(new Set([...tokens, ...memTokens]));
  }

  // Update token version in DB
  let newVersion = 2;
  try {
    const db = getDb();
    const userRow = db.prepare('SELECT token_version FROM users WHERE id = ?').get(numericUserId);
    newVersion = ((userRow && userRow.token_version) || 1) + 1;
    db.prepare('UPDATE users SET token_version = ? WHERE id = ?').run(newVersion, numericUserId);
  } catch {}

  try {
    const prisma = getPrismaClient();
    if (prisma && prisma.user) {
      const u = await prisma.user.findUnique({ where: { id: numericUserId } });
      if (u) {
        newVersion = (u.tokenVersion || 1) + 1;
        await prisma.user.update({
          where: { id: numericUserId },
          data: { tokenVersion: newVersion },
        });
      }
    }
  } catch {}

  // 1. Always purge from local memoryStore
  for (const tok of tokens) {
    if (tok !== keepToken) {
      memoryStore.delete(tok);
      if (memoryUserSessions.has(numericUserId)) {
        memoryUserSessions.get(numericUserId).delete(tok);
      }
    }
  }
  if (keepToken && memoryStore.has(keepToken)) {
    memoryStore.get(keepToken).data.tokenVersion = newVersion;
  }
  memoryUserVersions.set(numericUserId, newVersion);

  // 2. Invalidate Redis sessions
  if (redis && redis.status === 'ready') {
    const pipeline = redis.pipeline();
    for (const tok of tokens) {
      if (tok !== keepToken) {
        pipeline.del(`${SESSION_PREFIX}${tok}`);
        pipeline.srem(`${USER_SESSIONS_PREFIX}${numericUserId}`, tok);
      }
    }

    if (keepToken) {
      // Update token version inside the retained session
      const raw = await redis.get(`${SESSION_PREFIX}${keepToken}`);
      if (raw) {
        try {
          const sess = JSON.parse(raw);
          sess.tokenVersion = newVersion;
          pipeline.set(
            `${SESSION_PREFIX}${keepToken}`,
            JSON.stringify(sess),
            'EX',
            DEFAULT_SESSION_TTL_SECONDS
          );
        } catch {}
      }
    } else {
      pipeline.del(`${USER_SESSIONS_PREFIX}${numericUserId}`);
    }

    pipeline.set(`${USER_VERSION_PREFIX}${numericUserId}`, newVersion, 'EX', DEFAULT_SESSION_TTL_SECONDS);
    await pipeline.exec();
  }

  // Mirror delete to PostgreSQL
  try {
    const prisma = getPrismaClient();
    if (prisma && prisma.session) {
      if (keepToken) {
        prisma.session
          .deleteMany({
            where: {
              userId: numericUserId,
              token: { not: keepToken },
            },
          })
          .catch(() => {});
      } else {
        prisma.session.deleteMany({ where: { userId: numericUserId } }).catch(() => {});
      }
    }
  } catch {}

  return newVersion;
}

/**
 * List all active sessions for a user (device inventory)
 */
async function getUserActiveSessions(userId, currentToken = null) {
  const numericUserId = Number(userId);
  if (!numericUserId) return [];

  const redis = getRedisClient();
  let tokens = [];

  if (redis && redis.status === 'ready') {
    tokens = await redis.smembers(`${USER_SESSIONS_PREFIX}${numericUserId}`);
  } else if (memoryUserSessions.has(numericUserId)) {
    tokens = Array.from(memoryUserSessions.get(numericUserId));
  }

  const activeSessions = [];
  for (const tok of tokens) {
    const session = await getSession(tok);
    if (session) {
      activeSessions.push({
        id: session.id,
        token: tok,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActive: session.lastActive,
        isCurrent: tok === currentToken,
      });
    }
  }

  // Sort by last active descending
  activeSessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  return activeSessions;
}

module.exports = {
  COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  signCookieValue,
  unsignCookieValue,
  getHardenedCookieOptions,
  attachSessionCookie,
  clearSessionCookie,
  normalizeRole,
  createSession,
  getSession,
  getSessionSync,
  destroySession,
  revokeAllUserSessions,
  getUserActiveSessions,
};
