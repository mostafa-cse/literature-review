const { PrismaClient } = require('@prisma/client');
const { env } = require('./env');

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : ['error'],
  });

if (env.NODE_ENV === 'development') {
  // Optional query latency listener in dev
  prisma.$on?.('query', (e) => {
    if (e.duration > 250) {
      console.warn(`[Prisma] Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Live health check via Prisma Client
 */
async function checkPrismaHealth() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1 AS alive;`;
    const latencyMs = Date.now() - start;
    return {
      status: 'healthy',
      connected: true,
      latencyMs,
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
 * Disconnect Prisma Client gracefully
 */
async function closePrisma() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  checkPrismaHealth,
  closePrisma,
};
