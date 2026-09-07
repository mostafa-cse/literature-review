const { z } = require('zod');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters')
    .default('litsphere-academic-secure-session-token-32bytes-key-2026'),

  // PostgreSQL Configuration
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid connection URL')
    .default('postgresql://postgres:postgres@localhost:5432/litsphere'),

  // Redis Configuration
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid connection URL')
    .default('redis://localhost:6379'),

  // Cloudflare R2 / Supabase S3 Storage Credentials
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET_NAME: z.string().default('litsphere-papers'),
  R2_PUBLIC_DOMAIN: z.string().default(''),
  R2_S3_ENDPOINT: z.string().default(''),
  R2_REGION: z.string().default(''),

  // Nodemailer Email Delivery
  EMAIL_HOST: z.string().default('smtp.gmail.com'),
  EMAIL_PORT: z.coerce.number().default(587),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('LitSphere Research <noreply@litsphere.org>'),
});

let parsedEnv;
try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment configuration error:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    // In test environment, fallback to defaults rather than exiting
    if (process.env.NODE_ENV === 'test') {
      parsedEnv = envSchema.parse({});
    } else {
      process.exit(1);
    }
  } else {
    throw error;
  }
}

const isR2Configured = () => {
  return Boolean(
    (parsedEnv.R2_ACCOUNT_ID || parsedEnv.R2_S3_ENDPOINT) &&
    parsedEnv.R2_ACCESS_KEY_ID &&
    parsedEnv.R2_SECRET_ACCESS_KEY &&
    parsedEnv.R2_BUCKET_NAME
  );
};

const isRedisConfigured = () => {
  return Boolean(parsedEnv.REDIS_URL);
};

module.exports = {
  env: parsedEnv,
  isR2Configured,
  isRedisConfigured,
};
