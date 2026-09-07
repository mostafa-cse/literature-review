const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const {
  getR2Client,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  uploadBuffer: r2UploadBuffer,
  deleteObject: r2DeleteObject,
} = require('../config/r2');
const { env, isR2Configured } = require('../config/env');
const { prisma } = require('../config/prisma');
const { GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Local fallback directory for offline development when Cloudflare R2 is unconfigured
const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../../uploads/papers');
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

/**
 * Compute SHA-256 hash of a file buffer for integrity and deduplication
 */
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sanitize filename to avoid invalid characters in S3/R2 keys
 */
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Store or ingest a paper manuscript file with SHA-256 content deduplication
 */
async function storePaperFile({ paperId, filename, mimetype = 'application/pdf', buffer }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('A valid file Buffer is required.');
  }

  const sha256 = calculateFileHash(buffer);
  const fileSize = buffer.length;
  const cleanName = sanitizeFilename(filename || `paper_${paperId}.pdf`);

  // 1. Content Deduplication Check: Look for an existing paper file with identical hash
  const existingDuplicate = await prisma.paperFile.findFirst({
    where: { sha256 },
  });

  let r2ObjectKey = null;
  let r2Bucket = env.R2_BUCKET_NAME || 'litsphere-papers';
  let deduplicated = false;

  if (existingDuplicate && existingDuplicate.r2ObjectKey) {
    // Reuse existing R2 object key to save storage bytes & transfer bandwidth
    r2ObjectKey = existingDuplicate.r2ObjectKey;
    r2Bucket = existingDuplicate.r2Bucket;
    deduplicated = true;
  } else {
    // Unique manuscript: Upload to storage
    r2ObjectKey = `papers/${paperId}/${Date.now()}-${cleanName}`;

    if (isR2Configured()) {
      await r2UploadBuffer(r2ObjectKey, buffer, mimetype);
    } else {
      // Offline local storage fallback
      const localPath = path.join(LOCAL_STORAGE_DIR, `${paperId}_${cleanName}`);
      fs.writeFileSync(localPath, buffer);
    }
  }

  const publicUrl =
    env.R2_PUBLIC_DOMAIN && r2ObjectKey
      ? `${env.R2_PUBLIC_DOMAIN.replace(/\/$/, '')}/${r2ObjectKey}`
      : `/api/papers/${paperId}/pdf`;

  // Upsert PaperFile record in PostgreSQL
  const paperFile = await prisma.paperFile.upsert({
    where: { paperId },
    update: {
      filename: cleanName,
      mimetype,
      fileSize,
      r2ObjectKey,
      r2Bucket,
      sha256,
      publicUrl,
    },
    create: {
      paperId,
      filename: cleanName,
      mimetype,
      fileSize,
      r2ObjectKey,
      r2Bucket,
      sha256,
      publicUrl,
    },
  });

  return {
    paperFile,
    deduplicated,
    sha256,
    fileSize,
    publicUrl,
  };
}

/**
 * Retrieve a readable stream for a paper manuscript
 */
async function getPaperFileStream(paperId) {
  const fileRecord = await prisma.paperFile.findUnique({
    where: { paperId },
  });

  if (!fileRecord) {
    return null;
  }

  if (isR2Configured() && fileRecord.r2ObjectKey) {
    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: fileRecord.r2Bucket || env.R2_BUCKET_NAME,
      Key: fileRecord.r2ObjectKey,
    });

    const response = await client.send(command);
    return {
      stream: response.Body,
      mimetype: response.ContentType || fileRecord.mimetype,
      filename: fileRecord.filename,
      fileSize: fileRecord.fileSize,
    };
  }

  // Local fallback
  const localFiles = fs.readdirSync(LOCAL_STORAGE_DIR);
  const matching = localFiles.find((f) => f.startsWith(`${paperId}_`));

  if (matching) {
    const filePath = path.join(LOCAL_STORAGE_DIR, matching);
    const stream = fs.createReadStream(filePath);
    return {
      stream,
      mimetype: fileRecord.mimetype,
      filename: fileRecord.filename,
      fileSize: fileRecord.fileSize,
    };
  }

  return null;
}

/**
 * Generate a pre-signed PUT URL for client-side direct upload to R2
 */
async function getPresignedUploadForPaper({
  paperId,
  filename,
  mimetype = 'application/pdf',
  expiresIn = 900,
}) {
  const cleanName = sanitizeFilename(filename || 'manuscript.pdf');
  const objectKey = `papers/${paperId}/${Date.now()}-${cleanName}`;

  if (isR2Configured()) {
    return await getPresignedUploadUrl(objectKey, mimetype, expiresIn);
  }

  // Mock pre-signed URL response for local development
  return {
    uploadUrl: `/api/papers/${paperId}/upload-direct-local`,
    objectKey,
    bucket: 'local-storage',
    expiresIn,
    isLocalFallback: true,
  };
}

/**
 * Generate an expiring pre-signed GET URL for secure direct client download
 */
async function getPresignedDownloadForPaper(paperId, expiresIn = 3600) {
  const fileRecord = await prisma.paperFile.findUnique({
    where: { paperId },
  });

  if (!fileRecord) {
    throw new Error(`No manuscript file found for Paper #${paperId}`);
  }

  if (isR2Configured() && fileRecord.r2ObjectKey) {
    return await getPresignedDownloadUrl(fileRecord.r2ObjectKey, expiresIn);
  }

  // Fallback to local server streaming endpoint
  return `/api/papers/${paperId}/pdf`;
}

/**
 * Automatic file cleanup hook: deletes file from R2 and removes DB metadata
 * Protects against deleting shared objects if another paper references the same SHA-256.
 */
async function deletePaperFile(paperId) {
  const fileRecord = await prisma.paperFile.findUnique({
    where: { paperId },
  });

  if (!fileRecord) {
    return { deleted: false, reason: 'Record not found' };
  }

  const { r2ObjectKey, sha256 } = fileRecord;

  // 1. Delete database record
  await prisma.paperFile.delete({
    where: { paperId },
  });

  // 2. Check if any other paper is sharing the same R2 object (deduplication safeguard)
  if (r2ObjectKey) {
    const otherReferences = await prisma.paperFile.count({
      where: { r2ObjectKey },
    });

    if (otherReferences === 0) {
      if (isR2Configured()) {
        try {
          await r2DeleteObject(r2ObjectKey);
        } catch (err) {
          console.warn(`[StorageService] Failed to delete R2 object ${r2ObjectKey}:`, err.message);
        }
      } else {
        // Clean up local file
        const localFiles = fs.readdirSync(LOCAL_STORAGE_DIR);
        const matching = localFiles.find((f) => f.startsWith(`${paperId}_`));
        if (matching) {
          try {
            fs.unlinkSync(path.join(LOCAL_STORAGE_DIR, matching));
          } catch {}
        }
      }
    }
  }

  return { deleted: true, paperId };
}

/**
 * Retrieve metadata and verify storage integrity
 */
async function getFileMetadata(paperId) {
  const fileRecord = await prisma.paperFile.findUnique({
    where: { paperId },
  });

  if (!fileRecord) return null;

  let r2Status = 'not_verified';
  if (isR2Configured() && fileRecord.r2ObjectKey) {
    try {
      const client = getR2Client();
      await client.send(
        new HeadObjectCommand({
          Bucket: fileRecord.r2Bucket || env.R2_BUCKET_NAME,
          Key: fileRecord.r2ObjectKey,
        })
      );
      r2Status = 'verified';
    } catch {
      r2Status = 'missing_in_r2';
    }
  }

  return {
    ...fileRecord,
    r2Status,
  };
}

module.exports = {
  calculateFileHash,
  storePaperFile,
  getPaperFileStream,
  getPresignedUploadForPaper,
  getPresignedDownloadForPaper,
  deletePaperFile,
  getFileMetadata,
};
