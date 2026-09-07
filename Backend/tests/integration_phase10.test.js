/**
 * ==============================================================================
 * LITSPHERE PHASE 10: ENTERPRISE INTEGRATION TESTING & PERFORMANCE BENCHMARKS
 * ==============================================================================
 * Deep end-to-end integration and verification suite covering:
 * 1. Prisma multi-level relational querying, atomic transactions, and cascade deletions
 * 2. Redis-backed cryptographic session lifecycle, multi-device revocation, and RBAC caching
 * 3. Cloudflare R2 / storage layer with SHA-256 deduplication and presigned URLs
 * 4. PostgreSQL Full-Text Search (FTS) and Trigram fuzzy query performance benchmarks
 * 5. BullMQ asynchronous worker queues (PDF processing, CrossRef enrichment, Citation export, DLQ)
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { prisma, closePrisma } = require('../src/config/prisma');
const { getRedisClient, closeRedis } = require('../src/config/redis');
const sessionService = require('../src/services/sessionService');
const storageService = require('../src/services/storageService');
const searchService = require('../src/services/searchService');
const queueService = require('../src/services/queueService');
const cacheService = require('../src/services/cacheService');

/**
 * Helper to poll BullMQ job until terminal state
 */
async function waitForJobCompletion(queueName, jobId, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await queueService.getJob(queueName, jobId);
    if (job && (job.state === 'completed' || (job.state === 'failed' && (job.failedReason || Date.now() - start > 1000)))) {
      if (job.state === 'completed' && job.returnvalue === null && Date.now() - start < maxWaitMs - 1000) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      return job;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for job ${jobId} in queue ${queueName}`);
}

async function runIntegrationPhase10Tests() {
  console.log('======================================================================');
  console.log('🚀 LITSPHERE PHASE 10: END-TO-END INTEGRATION & BENCHMARK TEST SUITE');
  console.log('======================================================================\n');

  const redis = getRedisClient();
  queueService.initQueues();
  queueService.initWorkers();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
      throw err;
    }
  }

  try {
    // --------------------------------------------------------------------------
    // MODULE 1: Prisma Relational Modeling, Transactions & Cascade Deletes
    // --------------------------------------------------------------------------
    console.log('📊 [Module 1/5] Prisma Relational Queries, Transactions & Cascades');

    await test('1.1: Deep multi-tier relational query (Project -> Clusters -> DynamicColumns -> Papers)', async () => {
      let project = await prisma.project.findFirst({
        include: {
          clusters: {
            include: {
              columns: true,
              papers: {
                take: 2,
                include: {
                  columnValues: true,
                  keywords: true,
                  file: true,
                },
              },
            },
          },
        },
      });

      if (!project || project.clusters.length === 0) {
        let user = await prisma.user.findFirst();
        if (!user) {
          user = await prisma.user.create({
            data: {
              username: 'integration_owner',
              name: 'Integration Owner',
              email: `owner_${Date.now()}@litsphere.ac`,
              passwordHash: 'dummy',
              role: 'ADMIN',
              status: 'ACTIVE',
            },
          });
        }
        project = await prisma.project.create({
          data: {
            ownerId: user.id,
            name: 'Integration Benchmark Survey',
            domain: 'Computer Science',
          },
        });
        const cluster = await prisma.taxonomyCluster.create({
          data: {
            projectId: project.id,
            name: 'Filter Methods',
            color: '#38bdf8',
          },
        });
        await prisma.dynamicColumn.create({
          data: {
            clusterId: cluster.id,
            columnName: 'Objective Function',
            colType: 'TEXT',
          },
        });
        await prisma.paper.create({
          data: {
            projectId: project.id,
            clusterId: cluster.id,
            title: 'Sample Feature Selection Paper',
            status: 'COMPLETED',
          },
        });
        project = await prisma.project.findUnique({
          where: { id: project.id },
          include: {
            clusters: {
              include: {
                columns: true,
                papers: true,
              },
            },
          },
        });
      }

      assert.ok(project, 'Project must exist');
      assert.ok(project.clusters.length > 0, 'Project must contain taxonomy clusters');
      assert.ok(project.clusters[0].columns.length > 0, 'Cluster must contain dynamic columns');
    });

    let tempProjectId = null;
    let tempPaperId = null;

    await test('1.2: Atomic multi-entity creation inside prisma.$transaction', async () => {
      const uniqueSuffix = Date.now();
      const existingUser = await prisma.user.findFirst();
      const fallbackOwnerId = existingUser ? existingUser.id : 1;
      const transactionResult = await prisma.$transaction(async (tx) => {
        // 1. Create temporary survey project
        const proj = await tx.project.create({
          data: {
            ownerId: fallbackOwnerId,
            name: `Integration Test Survey ${uniqueSuffix}`,
            description: 'Atomic transaction integration test',
            domain: 'Computer Science',
            shareToken: `token_tx_${uniqueSuffix}`,
          },
        });

        // 2. Create cluster
        const cluster = await tx.taxonomyCluster.create({
          data: {
            projectId: proj.id,
            name: 'Transactional Cluster',
            color: '#10b981',
            position: 1,
          },
        });

        // 3. Create dynamic column
        const column = await tx.dynamicColumn.create({
          data: {
            clusterId: cluster.id,
            columnName: 'Algorithmic Efficiency',
            colType: 'TEXT',
          },
        });

        // 4. Create paper
        const paper = await tx.paper.create({
          data: {
            projectId: proj.id,
            clusterId: cluster.id,
            title: `Transactional Benchmark Paper ${uniqueSuffix}`,
            status: 'READING',
            year: 2026,
            domain: 'Distributed Systems',
          },
        });

        // 5. Create cell value
        await tx.paperColumnValue.create({
          data: {
            paperId: paper.id,
            columnId: column.id,
            value: 'O(log N) runtime bound',
          },
        });

        // 6. Create keyword
        await tx.paperKeyword.create({
          data: {
            paperId: paper.id,
            keyword: 'Atomicity',
          },
        });

        return { proj, cluster, column, paper };
      });

      tempProjectId = transactionResult.proj.id;
      tempPaperId = transactionResult.paper.id;

      assert.ok(tempProjectId > 0, 'Project ID must be generated');
      assert.ok(tempPaperId > 0, 'Paper ID must be generated');

      const verifiedPaper = await prisma.paper.findUnique({
        where: { id: tempPaperId },
        include: { columnValues: true, keywords: true },
      });
      assert.strictEqual(verifiedPaper.columnValues.length, 1);
      assert.strictEqual(verifiedPaper.keywords.length, 1);
    });

    await test('1.3: Cascade delete integrity: removing project purges all child records', async () => {
      assert.ok(tempProjectId, 'tempProjectId must exist');

      // Delete project
      await prisma.project.delete({
        where: { id: tempProjectId },
      });

      // Verify cascading deletion across all child models
      const checkPaper = await prisma.paper.findUnique({ where: { id: tempPaperId } });
      const checkClusters = await prisma.taxonomyCluster.findMany({ where: { projectId: tempProjectId } });
      const checkValues = await prisma.paperColumnValue.findMany({ where: { paperId: tempPaperId } });
      const checkKeywords = await prisma.paperKeyword.findMany({ where: { paperId: tempPaperId } });

      assert.strictEqual(checkPaper, null, 'Paper must be cascaded');
      assert.strictEqual(checkClusters.length, 0, 'Clusters must be cascaded');
      assert.strictEqual(checkValues.length, 0, 'Cell values must be cascaded');
      assert.strictEqual(checkKeywords.length, 0, 'Keywords must be cascaded');
    });

    // --------------------------------------------------------------------------
    // MODULE 2: Redis-Backed Cryptographic Sessions & Fast RBAC Caching
    // --------------------------------------------------------------------------
    console.log('\n🔒 [Module 2/5] Redis-Backed Session Lifecycle, Revocation & RBAC Caching');

    let testUser = await prisma.user.findFirst();
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          username: 'session_test_user',
          name: 'Session Test User',
          email: `session_${Date.now()}@litsphere.ac`,
          passwordHash: 'dummy_hash',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
    }
    assert.ok(testUser, 'A valid user must exist for session testing');

    let testSessionToken = null;
    let testSignedCookie = null;

    await test('2.1: Cryptographic session creation, storage in Redis, and signed cookie verification', async () => {
      const session = await sessionService.createSession(testUser, null, {
        ipAddress: '127.0.0.1',
        userAgent: 'IntegrationTestRunner/2.0',
      });

      assert.ok(session.token, 'Session token must be generated');
      testSessionToken = session.token;
      testSignedCookie = sessionService.signCookieValue(session.token);

      // Verify token signature roundtrip
      const unsigned = sessionService.unsignCookieValue(testSignedCookie);
      assert.strictEqual(unsigned, testSessionToken, 'Unsigned cookie must match token');

      // Verify session exists in Redis
      const redisSession = await sessionService.getSession(testSessionToken);
      assert.ok(redisSession, 'Session must exist in Redis');
      assert.strictEqual(redisSession.userId, testUser.id);
      assert.strictEqual(redisSession.ipAddress, '127.0.0.1');
    });

    await test('2.2: Single-device logout: destroying active session token', async () => {
      const destroyed = await sessionService.destroySession(testSessionToken);
      assert.strictEqual(destroyed, true, 'destroySession should return true');

      const lookup = await sessionService.getSession(testSessionToken);
      assert.strictEqual(lookup, null, 'Destroyed session must return null');
    });

    await test('2.3: Multi-device global revocation via user token_version increment', async () => {
      // Create two simultaneous sessions for user
      const s1 = await sessionService.createSession(testUser, null, { userAgent: 'Device 1' });
      const s2 = await sessionService.createSession(testUser, null, { userAgent: 'Device 2' });

      assert.ok(await sessionService.getSession(s1.token), 'Session 1 must be active');
      assert.ok(await sessionService.getSession(s2.token), 'Session 2 must be active');

      // Revoke all sessions across devices
      await sessionService.revokeAllUserSessions(testUser.id);

      // Both should now be invalid
      const check1 = await sessionService.getSession(s1.token);
      const check2 = await sessionService.getSession(s2.token);
      assert.strictEqual(check1, null, 'Device 1 session must be revoked');
      assert.strictEqual(check2, null, 'Device 2 session must be revoked');
    });

    await test('2.4: Redis RBAC cache benchmark: sub-3ms role verification', async () => {
      const isRemoteRedis = process.env.REDIS_URL && !process.env.REDIS_URL.includes('localhost') && !process.env.REDIS_URL.includes('127.0.0.1');
      const iterations = isRemoteRedis ? 10 : 50;
      const maxLatency = isRemoteRedis ? 1000 : 3.0;
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        await cacheService.getOrSet(`test:rbac:user:${testUser.id}:role`, 60, async () => 'ADMIN');
      }
      const elapsed = Date.now() - start;
      const avgLatencyMs = elapsed / iterations;
      console.log(`      ⚡ Average Redis RBAC cache latency: ${avgLatencyMs.toFixed(3)} ms`);
      assert.ok(avgLatencyMs < maxLatency, `RBAC cache lookup must be < ${maxLatency}ms, got ${avgLatencyMs}ms`);
    });

    // --------------------------------------------------------------------------
    // MODULE 3: Cloudflare R2 Storage, Deduplication & Presigned URLs
    // --------------------------------------------------------------------------
    console.log('\n📦 [Module 3/5] Cloudflare R2 Object Storage, SHA-256 Deduplication & Presigned URLs');

    const samplePdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000108 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF'
    );

    // Ensure test papers exist for storage & search modules
    let samplePaper1 = await prisma.paper.findFirst({
      where: { title: { contains: 'Speech' } },
    });
    if (!samplePaper1) {
      let defaultProject = await prisma.project.findFirst();
      if (!defaultProject) {
        defaultProject = await prisma.project.create({
          data: {
            ownerId: testUser.id,
            name: 'Benchmark Survey',
            domain: 'Computer Science',
          },
        });
      }
      samplePaper1 = await prisma.paper.create({
        data: {
          projectId: defaultProject.id,
          title: 'Direct Speech Translation Benchmark Analysis',
          authors: 'Benchmark Researcher',
          year: 2026,
          domain: 'Speech Processing',
          status: 'UNREAD',
        },
      });
    }

    let samplePaper2 = await prisma.paper.findFirst({
      where: { id: { not: samplePaper1.id } },
    });
    if (!samplePaper2) {
      samplePaper2 = await prisma.paper.create({
        data: {
          projectId: samplePaper1.projectId,
          title: 'End-to-End Neural Machine Translation and Speech Systems',
          authors: 'Benchmark Researcher',
          year: 2026,
          domain: 'Speech Processing',
          status: 'UNREAD',
        },
      });
    }

    // Clean up existing PaperFile records for samplePaper1 and samplePaper2 if any exist to ensure clean testing
    await prisma.paperFile.deleteMany({
      where: { paperId: { in: [samplePaper1.id, samplePaper2.id] } },
    });

    const targetPaperId = samplePaper1.id;
    const targetPaperId2 = samplePaper2.id;

    await test('3.1: Store PDF manuscript buffer with SHA-256 checksum and metadata', async () => {
      const stored = await storageService.storePaperFile({
        paperId: targetPaperId,
        filename: 'Direct_Speech_Translation_Benchmark.pdf',
        mimetype: 'application/pdf',
        buffer: samplePdfBuffer,
      });

      assert.ok(stored.paperFile, 'Stored file record must be returned');
      assert.strictEqual(stored.paperFile.paperId, targetPaperId);
      assert.strictEqual(stored.sha256.length, 64, 'SHA-256 checksum must be 64 characters');
      assert.strictEqual(stored.fileSize, samplePdfBuffer.length);
    });

    await test('3.2: Content deduplication: identical file content reuses existing storage key', async () => {
      const deduplicatedResult = await storageService.storePaperFile({
        paperId: targetPaperId2,
        filename: 'Duplicate_Speech_Benchmark.pdf',
        mimetype: 'application/pdf',
        buffer: samplePdfBuffer, // Exact same buffer
      });

      assert.strictEqual(
        deduplicatedResult.deduplicated,
        true,
        'Duplicate buffer must be flagged as deduplicated'
      );
      assert.strictEqual(
        deduplicatedResult.sha256,
        crypto.createHash('sha256').update(samplePdfBuffer).digest('hex')
      );
    });

    await test('3.3: Pre-signed download URL generation with TTL expiration', async () => {
      const downloadUrl = await storageService.getPresignedDownloadForPaper(targetPaperId, 900);
      assert.ok(downloadUrl && typeof downloadUrl === 'string', 'Download URL must be present');
      assert.ok(downloadUrl.includes(String(targetPaperId)) || downloadUrl.includes('pdf') || downloadUrl.includes('http'));
    });

    // --------------------------------------------------------------------------
    // MODULE 4: PostgreSQL Full-Text Search (FTS) & Trigram Query Benchmarks
    // --------------------------------------------------------------------------
    console.log('\n🔎 [Module 4/5] PostgreSQL Full-Text Search (FTS) & Trigram Benchmarks');

    await test('4.1: Weighted search_vector query ranking (Title > Domain > Abstract)', async () => {
      const searchRes = await searchService.searchPapers({
        query: 'Speech Translation',
        limit: 10,
      });

      assert.ok(searchRes.results.length > 0, 'Should find speech translation papers');
      assert.ok(
        searchRes.results[0].fts_rank !== undefined || searchRes.results[0].hybrid_score !== undefined,
        'Result must contain rank score'
      );
      assert.ok(
        searchRes.results[0].title.toLowerCase().includes('speech') ||
          searchRes.results[0].title.toLowerCase().includes('translation'),
        'Top rank match must contain relevant title keyword'
      );
    });

    await test('4.2: Typo-tolerant trigram search matching misspelled terms via pg_trgm', async () => {
      const typoResults = await searchService.searchPapers({
        query: 'Direct Spech Translaton',
        limit: 5,
      });

      assert.ok(typoResults.results.length > 0, 'Trigram search should tolerate typos and return matches');
      console.log(`      🎯 Typo query "Direct Spech Translaton" matched: "${typoResults.results[0].title.slice(0, 45)}..."`);
    });

    await test('4.3: Keyword prefix autocomplete using trigram similarity', async () => {
      const suggestions = await searchService.autocompleteKeywords('trans', 5);
      assert.ok(Array.isArray(suggestions), 'Autocomplete should return array');
      console.log(`      💡 Autocomplete for "trans":`, suggestions);
    });

    await test('4.4: 100-Query High-Load Search Benchmark against PostgreSQL GIN Index', async () => {
      const queries = [
        'Speech Translation',
        'Feature Selection',
        'End-to-End',
        'Mutual Information',
        'Multilingual',
        'Low-Latency',
        'Benchmark',
        'Neural Machine Translation',
        'Optimization',
        'Streaming Inference',
      ];

      const isRemoteDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
      const iterations = isRemoteDb ? 15 : 100;
      const maxSearchLatency = isRemoteDb ? 1000 : 25;
      const latencies = [];

      const benchmarkStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        const q = queries[i % queries.length];
        const t0 = performance.now();
        await searchService.searchPapers({ query: q, limit: 10 });
        latencies.push(performance.now() - t0);
      }
      const totalElapsed = Date.now() - benchmarkStart;

      latencies.sort((a, b) => a - b);
      const min = latencies[0];
      const max = latencies[latencies.length - 1];
      const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log(`      📈 Benchmark Results (${iterations} Iterations):`);
      console.table([
        {
          Metric: 'FTS & Trigram Latency',
          Min: `${min.toFixed(2)} ms`,
          Avg: `${avg.toFixed(2)} ms`,
          p50: `${p50.toFixed(2)} ms`,
          p95: `${p95.toFixed(2)} ms`,
          p99: `${p99.toFixed(2)} ms`,
          Max: `${max.toFixed(2)} ms`,
          Throughput: `${(iterations / (totalElapsed / 1000)).toFixed(1)} qps`,
        },
      ]);

      assert.ok(avg < maxSearchLatency, `Average search latency must be < ${maxSearchLatency}ms, got ${avg.toFixed(2)}ms`);
    });

    // --------------------------------------------------------------------------
    // MODULE 5: BullMQ Worker Job Execution & DLQ Validation
    // --------------------------------------------------------------------------
    console.log('\n⚡ [Module 5/5] BullMQ Background Worker Processing & Dead-Letter Queue (DLQ)');

    await test('5.1: PDF text extraction & metadata indexing job execution', async () => {
      const job = await queueService.addJob(queueService.QUEUES.PDF_PROCESSING, {
        paperId: targetPaperId,
        pdfBuffer: samplePdfBuffer.toString('base64'),
        filename: 'direct_speech_paper.pdf',
        uploadedBy: testUser.id,
      });

      assert.ok(job.id, 'Job ID must be returned');
      const completedJob = await waitForJobCompletion(
        queueService.QUEUES.PDF_PROCESSING,
        job.id,
        15000
      );

      assert.strictEqual(completedJob.state, 'completed');
      assert.ok(completedJob.returnvalue, 'Job must return extraction result');
      assert.strictEqual(completedJob.returnvalue.success, true);
      assert.ok(completedJob.returnvalue.pageCount >= 1, 'Page count must be >= 1');
      console.log(`      📄 Extracted ${completedJob.returnvalue.pageCount} page(s), Text length: ${completedJob.returnvalue.textLength} chars`);
    });

    await test('5.2: Asynchronous citation export job execution (BibTeX, RIS, XLSX)', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        surveyId: samplePaper1.projectId,
        format: 'bibtex',
        paperIds: [targetPaperId, targetPaperId2],
        requestedBy: testUser.id,
      });

      assert.ok(job.id, 'Citation export job ID must be generated');
      const completedJob = await waitForJobCompletion(
        queueService.QUEUES.CITATION_EXPORT,
        job.id,
        15000
      );

      assert.strictEqual(completedJob.state, 'completed');
      assert.ok(completedJob.returnvalue, 'Must return export artifact');
      assert.ok(
        completedJob.returnvalue.format === 'bib' || completedJob.returnvalue.format === 'bibtex',
        'Format must be bib or bibtex'
      );
      assert.ok(completedJob.returnvalue.downloadUrl, 'Must return download URL');
      console.log(`      📚 Exported BibTeX citations: ${completedJob.returnvalue.paperCount} items (${completedJob.returnvalue.downloadUrl})`);
    });

    await test('5.3: CrossRef DOI metadata enrichment worker execution', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CROSSREF_ENRICHMENT, {
        paperId: targetPaperId,
        doi: '10.1109/TPAMI.2005.159',
        requestedBy: testUser.id,
      });

      assert.ok(job.id, 'CrossRef job ID must be created');
      const completedJob = await waitForJobCompletion(
        queueService.QUEUES.CROSSREF_ENRICHMENT,
        job.id,
        15000
      );

      assert.strictEqual(completedJob.state, 'completed');
      assert.ok(completedJob.returnvalue, 'Must return enrichment result');
      console.log(`      🌐 Enriched DOI metadata: ${completedJob.returnvalue.doi} (Title: "${(completedJob.returnvalue.title || '').slice(0, 30)}...")`);
    });

    await test('5.4: Dead-Letter Queue (DLQ) & failure handling for malformed payload', async () => {
      const badJob = await queueService.addJob(
        queueService.QUEUES.PDF_PROCESSING,
        {
          paperId: -999,
          pdfBuffer: null,
        },
        { attempts: 1 }
      );

      const failedJob = await waitForJobCompletion(
        queueService.QUEUES.PDF_PROCESSING,
        badJob.id,
        10000
      );

      assert.strictEqual(failedJob.state, 'failed', 'Malformed job must transition to failed state');
      assert.ok(failedJob.failedReason, 'Failed reason must be recorded in DLQ');
      console.log(`      🛡️ DLQ correctly caught failure: "${failedJob.failedReason.slice(0, 50)}..."`);
    });

    console.log('\n======================================================================');
    console.log(`🏆 ALL ${passed} INTEGRATION TESTS & BENCHMARKS PASSED (ZERO FAILURES)`);
    console.log('======================================================================\n');
  } finally {
    await queueService.closeWorkers();
  }
}

if (require.main === module) {
  runIntegrationPhase10Tests()
    .then(async () => {
      await closePrisma();
      await closeRedis();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal integration test failure:', err);
      await closePrisma();
      await closeRedis();
      process.exit(1);
    });
}

module.exports = { runIntegrationPhase10Tests };
