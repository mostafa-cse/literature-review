const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const { env, isR2Configured } = require('./env');

let r2Client = null;

function getR2Client() {
  if (!r2Client && isR2Configured()) {
    const endpoint = env.R2_S3_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const region = env.R2_REGION || 'auto';
    r2Client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return r2Client;
}

/**
 * Health-check testing Cloudflare R2 bucket accessibility and credentials
 */
async function checkR2Health() {
  const start = Date.now();
  if (!isR2Configured()) {
    return {
      status: 'unconfigured',
      configured: false,
      message: 'Cloudflare R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)',
    };
  }

  try {
    const client = getR2Client();
    // Test bucket existence & access
    await client.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        MaxKeys: 1,
      })
    );

    const latencyMs = Date.now() - start;
    return {
      status: 'healthy',
      connected: true,
      bucket: env.R2_BUCKET_NAME,
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      bucket: env.R2_BUCKET_NAME,
      error: error.message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Generate a pre-signed PUT URL for client-side direct upload to Cloudflare R2
 */
async function getPresignedUploadUrl(objectKey, contentType = 'application/pdf', expiresIn = 900) {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return {
    uploadUrl: url,
    objectKey,
    bucket: env.R2_BUCKET_NAME,
    expiresIn,
  };
}

/**
 * Generate a pre-signed GET URL for secure, temporary manuscript access
 */
async function getPresignedDownloadUrl(objectKey, expiresIn = 3600) {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Upload a raw file buffer directly to Cloudflare R2
 */
async function uploadBuffer(objectKey, buffer, contentType = 'application/pdf') {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType,
    Metadata: {
      sha256,
      uploadedAt: new Date().toISOString(),
    },
  });

  const result = await client.send(command);
  return {
    objectKey,
    bucket: env.R2_BUCKET_NAME,
    eTag: result.ETag,
    sha256,
    fileSize: buffer.length,
    publicUrl: env.R2_PUBLIC_DOMAIN ? `${env.R2_PUBLIC_DOMAIN}/${objectKey}` : null,
  };
}

/**
 * Delete an object from Cloudflare R2
 */
async function deleteObject(objectKey) {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: objectKey,
  });

  return await client.send(command);
}

module.exports = {
  getR2Client,
  checkR2Health,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  uploadBuffer,
  deleteObject,
};
