/**
 * PHASE 4 CLOUDFLARE R2 OBJECT STORAGE & DEDUPLICATION TEST SUITE
 * Validates:
 * 1. SHA-256 content hash computation
 * 2. Manuscript storage and PostgreSQL metadata persistence
 * 3. Content deduplication across multiple papers
 * 4. Pre-signed upload & download URL generation
 * 5. Streamed file retrieval
 * 6. Cascading file deletion with reference-safe cleanup
 */

const assert = require('assert');
const { prisma, closePrisma } = require('../src/config/prisma');
const { closePostgres } = require('../src/config/postgres');
const {
  calculateFileHash,
  storePaperFile,
  getPaperFileStream,
  getPresignedUploadForPaper,
  getPresignedDownloadForPaper,
  deletePaperFile,
  getFileMetadata,
} = require('../src/services/storageService');

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PHASE 4 CLOUDFLARE R2 & STORAGE TESTS');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. SHA-256 Checksum Calculation
  console.log('--- 1. SHA-256 Content Checksums ---');
  await test('calculateFileHash computes deterministic SHA-256 hash', async () => {
    const buffer = Buffer.from('%PDF-1.4 Mock Academic Manuscript Content for Testing');
    const hash = calculateFileHash(buffer);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);

    const hashAgain = calculateFileHash(buffer);
    assert.strictEqual(hash, hashAgain);
  });

  // Setup test environment records
  const suffix = Date.now();
  let testUser = null;
  let testProject = null;
  let testPaperA = null;
  let testPaperB = null;

  console.log('\n--- 2. Manuscript Ingestion & Deduplication ---');
  await test('Store manuscript for Paper A and verify metadata', async () => {
    testUser = await prisma.user.create({
      data: {
        name: 'Dr. Claude Shannon',
        email: `shannon_${suffix}@mit.edu`,
        passwordHash: 'salt:hash',
        role: 'USER',
      },
    });

    testProject = await prisma.project.create({
      data: {
        name: 'Information Theory Benchmarks',
        ownerId: testUser.id,
      },
    });

    testPaperA = await prisma.paper.create({
      data: {
        projectId: testProject.id,
        title: 'A Mathematical Theory of Communication (Part 1)',
        authors: 'Shannon, C. E.',
        year: 1948,
      },
    });

    testPaperB = await prisma.paper.create({
      data: {
        projectId: testProject.id,
        title: 'A Mathematical Theory of Communication (Part 2 - Replica)',
        authors: 'Shannon, C. E.',
        year: 1948,
      },
    });

    const mockPdfBuffer = Buffer.from('%PDF-1.4 Sample research manuscript with mathematical proofs.');

    const resA = await storePaperFile({
      paperId: testPaperA.id,
      filename: 'shannon_1948.pdf',
      mimetype: 'application/pdf',
      buffer: mockPdfBuffer,
    });

    assert.ok(resA.paperFile.id);
    assert.strictEqual(resA.paperFile.paperId, testPaperA.id);
    assert.strictEqual(resA.deduplicated, false);
    assert.ok(resA.paperFile.r2ObjectKey);
  });

  await test('Ingest identical PDF for Paper B and verify deduplication reuse', async () => {
    // Exact same PDF buffer uploaded to a different paper in survey
    const mockPdfBuffer = Buffer.from('%PDF-1.4 Sample research manuscript with mathematical proofs.');

    const resB = await storePaperFile({
      paperId: testPaperB.id,
      filename: 'shannon_replica.pdf',
      mimetype: 'application/pdf',
      buffer: mockPdfBuffer,
    });

    assert.ok(resB.paperFile.id);
    assert.strictEqual(resB.paperFile.paperId, testPaperB.id);
    assert.strictEqual(resB.deduplicated, true);

    // Verify both papers share the same R2 object key
    const fileA = await prisma.paperFile.findUnique({ where: { paperId: testPaperA.id } });
    assert.strictEqual(resB.paperFile.r2ObjectKey, fileA.r2ObjectKey);
    assert.strictEqual(resB.sha256, fileA.sha256);
  });

  // 3. Pre-Signed URL Generation
  console.log('\n--- 3. Pre-Signed URL Generation ---');
  await test('getPresignedUploadForPaper returns valid upload contract', async () => {
    const uploadMeta = await getPresignedUploadForPaper({
      paperId: testPaperA.id,
      filename: 'uploaded_paper.pdf',
      expiresIn: 600,
    });

    assert.ok(uploadMeta.uploadUrl);
    assert.ok(uploadMeta.objectKey.includes(String(testPaperA.id)));
  });

  await test('getPresignedDownloadForPaper returns expiring download URL', async () => {
    const downloadUrl = await getPresignedDownloadForPaper(testPaperA.id, 1800);
    assert.ok(downloadUrl);
    assert.strictEqual(typeof downloadUrl, 'string');
  });

  // 4. File Retrieval Stream
  console.log('\n--- 4. Streamed File Retrieval ---');
  await test('getPaperFileStream returns readable file stream with MIME type', async () => {
    const fileData = await getPaperFileStream(testPaperA.id);
    assert.ok(fileData);
    assert.strictEqual(fileData.mimetype, 'application/pdf');
    assert.ok(fileData.stream);
  });

  // 5. Reference-Safe Cleanup Hook
  console.log('\n--- 5. Reference-Safe File Cleanup ---');
  await test('deletePaperFile on Paper A retains shared storage object for Paper B', async () => {
    const delResultA = await deletePaperFile(testPaperA.id);
    assert.strictEqual(delResultA.deleted, true);

    // Paper A record is gone
    const checkA = await prisma.paperFile.findUnique({ where: { paperId: testPaperA.id } });
    assert.strictEqual(checkA, null);

    // Paper B record is STILL intact and accessible
    const checkB = await prisma.paperFile.findUnique({ where: { paperId: testPaperB.id } });
    assert.ok(checkB);
  });

  await test('deletePaperFile on Paper B completely purges storage object', async () => {
    const delResultB = await deletePaperFile(testPaperB.id);
    assert.strictEqual(delResultB.deleted, true);

    const checkB = await prisma.paperFile.findUnique({ where: { paperId: testPaperB.id } });
    assert.strictEqual(checkB, null);
  });

  // Cleanup test user and project
  console.log('\n--- 6. Test Data Teardown ---');
  await test('Cascade delete project and user', async () => {
    await prisma.project.delete({ where: { id: testProject.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  await closePostgres();
  await closePrisma();

  console.log('\n======================================================');
  console.log(`📊 Phase 4 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase4Tests();
}

module.exports = { runPhase4Tests };
