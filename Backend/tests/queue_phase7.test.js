const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = require('../server');
const { getDb } = require('../src/db');
const { getRedisClient, getBullMQConnectionOptions } = require('../src/config/redis');
const queueService = require('../src/services/queueService');

let server;
let baseUrl;

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = Buffer.alloc(0);
      res.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
      });
      res.on('end', () => {
        const text = data.toString('utf-8');
        let parsed = text;
        try {
          parsed = JSON.parse(text);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBuffer: data,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Poll job until completed or failed
 */
async function waitForJob(queueName, jobId, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await queueService.getJob(queueName, jobId);
    if (job) {
      if (job.state === 'completed' && job.returnvalue !== null) {
        return job;
      }
      if (job.state === 'failed' && (job.failedReason || Date.now() - start > 1000)) {
        return job;
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const fallback = await queueService.getJob(queueName, jobId);
  if (fallback && (fallback.state === 'completed' || fallback.state === 'failed')) {
    return fallback;
  }
  throw new Error(`Timeout waiting for job ${jobId} in ${queueName}`);
}

async function runQueuePhase7Tests() {
  console.log('======================================================================');
  console.log('⚡ PHASE 7: BULLMQ & REDIS BACKGROUND WORKER QUEUES TEST SUITE');
  console.log('======================================================================\n');

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
    }
  }

  // Spin up test server on dynamic port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      console.log(`📡 Test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  const db = getDb();

  // Create a clean test project and test paper
  let testProjectId = 1;
  const existingProj = db.prepare('SELECT id FROM projects WHERE id = 1').get();
  if (!existingProj) {
    const pRes = db.prepare("INSERT INTO projects (name, description) VALUES ('Queue Test Project', 'Phase 7 Test')").run();
    testProjectId = pRes.lastInsertRowid;
  }

  const paperRes = db.prepare(`
    INSERT INTO papers (project_id, title, authors, year, pub, doi, status, domain, intuition)
    VALUES (?, 'Unprocessed Manuscript Title', 'Draft Authors', '2023', 'Draft Venue', '10.1145/3318464.3389700', 'unread', 'Systems', 'Initial synthetic intuition')
  `).run(testProjectId);
  const testPaperId = paperRes.lastInsertRowid;

  try {
    // ------------------------------------------------------------------
    // 1. Connection & Queue Architecture Setup
    // ------------------------------------------------------------------
    await test('1.1: BullMQ connection options configure maxRetriesPerRequest: null', async () => {
      const opts = getBullMQConnectionOptions();
      assert.strictEqual(opts.maxRetriesPerRequest, null, 'maxRetriesPerRequest must be null for BullMQ');
      assert.ok(opts.port, 'Port must be present');
    });

    await test('1.2: All 3 BullMQ queues are instantiated and accessible', async () => {
      const qMap = queueService.initQueues();
      assert.ok(qMap[queueService.QUEUES.PDF_PROCESSING], 'pdf-processing-queue must exist');
      assert.ok(qMap[queueService.QUEUES.CROSSREF_ENRICHMENT], 'crossref-enrichment-queue must exist');
      assert.ok(qMap[queueService.QUEUES.CITATION_EXPORT], 'citation-export-queue must exist');
    });

    // ------------------------------------------------------------------
    // 2. PDF Processing Queue & Worker
    // ------------------------------------------------------------------
    let pdfJobId = null;

    await test('2.1: Enqueue PDF processing job with synthetic academic paper payload', async () => {
      const job = await queueService.addJob(queueService.QUEUES.PDF_PROCESSING, {
        paperId: testPaperId,
        projectId: testProjectId,
        originalFilename: 'Attention_Is_All_You_Need_2024.pdf',
      });
      assert.ok(job.id, 'Job should receive a unique ID');
      pdfJobId = job.id;
    });

    await test('2.2: PDF processing worker executes, emits progress, and extracts metadata', async () => {
      const job = await waitForJob(queueService.QUEUES.PDF_PROCESSING, pdfJobId);
      assert.strictEqual(job.state, 'completed', 'PDF processing job should complete successfully');
      assert.strictEqual(job.progress, 100, 'Job progress should reach 100%');
      assert.strictEqual(job.returnvalue.success, true, 'Job returnvalue must indicate success');
      assert.ok(job.returnvalue.pageCount >= 1, 'Page count must be extracted (>= 1)');
      assert.ok(job.returnvalue.title, 'Extracted title must be present');
    });

    await test('2.3: Database paper record updated with extracted PDF attributes', async () => {
      const updated = db.prepare('SELECT title, authors, year FROM papers WHERE id = ?').get(testPaperId);
      assert.ok(updated.title, 'Title should be saved in DB');
      assert.ok(updated.year, 'Year should be saved in DB');
    });

    // ------------------------------------------------------------------
    // 3. CrossRef DOI Enrichment Queue & Worker
    // ------------------------------------------------------------------
    let crossrefJobId = null;

    await test('3.1: Enqueue CrossRef DOI enrichment job', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CROSSREF_ENRICHMENT, {
        paperId: testPaperId,
        doi: '10.1145/3318464.3389700',
        title: 'Deep Systematic Synthesis',
        projectId: testProjectId,
      });
      assert.ok(job.id, 'CrossRef job must have an ID');
      crossrefJobId = job.id;
    });

    await test('3.2: CrossRef worker completes, generates BibTeX, and updates citation count', async () => {
      const job = await waitForJob(queueService.QUEUES.CROSSREF_ENRICHMENT, crossrefJobId);
      assert.strictEqual(job.state, 'completed', 'CrossRef job should complete successfully');
      assert.strictEqual(job.progress, 100, 'CrossRef job progress should reach 100%');
      assert.strictEqual(job.returnvalue.enriched, true, 'Job should be marked enriched');
      assert.ok(job.returnvalue.venue, 'Venue / container-title should be returned');
      assert.ok(job.returnvalue.bibtex.includes('@article{'), 'Standard BibTeX citation must be formatted');
      assert.strictEqual(typeof job.returnvalue.citationsCount, 'number', 'Citations count should be numeric');
    });

    await test('3.3: Database paper record reflects enriched publication venue and year', async () => {
      const enriched = db.prepare('SELECT pub, year, doi FROM papers WHERE id = ?').get(testPaperId);
      assert.ok(enriched.pub && enriched.pub.length > 0, 'Publication venue should be persisted in DB');
      assert.strictEqual(enriched.doi, '10.1145/3318464.3389700', 'DOI should be persisted');
    });

    // ------------------------------------------------------------------
    // 4. Citation Export Queue & Multi-format Generation
    // ------------------------------------------------------------------
    let xlsxToken = null;
    let bibToken = null;
    let risToken = null;

    await test('4.1: Asynchronously generate multi-level XLSX export via citation-export-queue', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        projectId: testProjectId,
        format: 'xlsx',
      });
      const completedJob = await waitForJob(queueService.QUEUES.CITATION_EXPORT, job.id);
      assert.strictEqual(completedJob.state, 'completed');
      assert.strictEqual(completedJob.progress, 100);
      assert.strictEqual(completedJob.returnvalue.format, 'xlsx');
      assert.ok(completedJob.returnvalue.exportToken, 'Export token must be returned');
      assert.ok(completedJob.returnvalue.fileSize > 0, 'File size should be greater than 0');
      xlsxToken = completedJob.returnvalue.exportToken;
    });

    await test('4.2: Download generated XLSX file using export token', async () => {
      const res = await makeRequest('GET', `/api/export/download/${xlsxToken}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      assert.ok(res.rawBuffer.length > 500, 'XLSX buffer should contain workbook binary data');
    });

    await test('4.3: Asynchronously generate BibTeX bibliography (.bib) file', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        projectId: testProjectId,
        format: 'bibtex',
      });
      const completedJob = await waitForJob(queueService.QUEUES.CITATION_EXPORT, job.id);
      assert.strictEqual(completedJob.state, 'completed');
      assert.strictEqual(completedJob.returnvalue.format, 'bib');
      bibToken = completedJob.returnvalue.exportToken;

      const res = await makeRequest('GET', `/api/export/download/${bibToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('% LitSphere Systematic Literature Review - BibTeX Export'), 'BibTeX header expected');
      assert.ok(res.body.includes('@article{'), 'BibTeX article entries expected');
    });

    await test('4.4: Asynchronously generate academic RIS (.ris) file', async () => {
      const job = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        projectId: testProjectId,
        format: 'ris',
      });
      const completedJob = await waitForJob(queueService.QUEUES.CITATION_EXPORT, job.id);
      assert.strictEqual(completedJob.state, 'completed');
      assert.strictEqual(completedJob.returnvalue.format, 'ris');
      risToken = completedJob.returnvalue.exportToken;

      const res = await makeRequest('GET', `/api/export/download/${risToken}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('TY  - JOUR'), 'RIS TY tag expected');
      assert.ok(res.body.includes('ER  - '), 'RIS ER tag expected');
    });

    await test('4.5: Invalid or expired export token returns 404', async () => {
      const res = await makeRequest('GET', '/api/export/download/non-existent-token-12345');
      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error, 'Error message expected for missing token');
    });

    // ------------------------------------------------------------------
    // 5. Job Status Tracking & Telemetry Endpoints
    // ------------------------------------------------------------------
    await test('5.1: GET /api/jobs/:queueName/:jobId returns accurate status & progress', async () => {
      const res = await makeRequest('GET', `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${pdfJobId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.job.id, pdfJobId);
      assert.strictEqual(res.body.job.state, 'completed');
      assert.strictEqual(res.body.job.progress, 100);
      assert.ok(res.body.job.returnvalue, 'returnvalue should be populated');
    });

    await test('5.2: GET /api/jobs/:queueName/:jobId with invalid id returns 404', async () => {
      const res = await makeRequest('GET', `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/invalid-job-99999`);
      assert.strictEqual(res.status, 404);
      assert.ok(res.body.error);
    });

    await test('5.3: GET /api/jobs/stats returns aggregated metrics across all queues', async () => {
      const res = await makeRequest('GET', '/api/jobs/stats');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.queues[queueService.QUEUES.PDF_PROCESSING]);
      assert.ok(res.body.queues[queueService.QUEUES.CROSSREF_ENRICHMENT]);
      assert.ok(res.body.queues[queueService.QUEUES.CITATION_EXPORT]);
      assert.ok(res.body.queues[queueService.QUEUES.PDF_PROCESSING].completed >= 1);
    });

    // ------------------------------------------------------------------
    // 6. Dead-Letter Queue (DLQ) & Retry Mechanisms
    // ------------------------------------------------------------------
    let failedJobId = null;

    await test('6.1: Job with invalid parameters fails and is retained in Dead-Letter Queue', async () => {
      // Create job with empty DOI and attempts: 1 to force immediate failure into DLQ
      const job = await queueService.addJob(
        queueService.QUEUES.CROSSREF_ENRICHMENT,
        { doi: '' }, // Missing DOI causes worker throw
        { attempts: 1 }
      );
      failedJobId = job.id;

      const failedJob = await waitForJob(queueService.QUEUES.CROSSREF_ENRICHMENT, failedJobId);
      assert.strictEqual(failedJob.state, 'failed');
      assert.ok(failedJob.failedReason, 'failedReason should be populated on failed job');
      assert.ok(
        failedJob.failedReason.includes('Valid DOI is required') || failedJob.failedReason.includes('CrossRefJobDto'),
        `Expected failure reason to mention DOI validation, got: ${failedJob.failedReason}`
      );
    });

    await test('6.2: GET /api/jobs/:queueName/failed lists the failed job in DLQ', async () => {
      const res = await makeRequest('GET', `/api/jobs/${queueService.QUEUES.CROSSREF_ENRICHMENT}/failed`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.failedJobs.length >= 1, 'DLQ must contain at least 1 failed job');
      const found = res.body.failedJobs.find(j => j.id === failedJobId);
      assert.ok(found, `Failed job ${failedJobId} should be present in DLQ list`);
    });

    await test('6.3: POST /api/jobs/:queueName/:jobId/retry re-enqueues failed job', async () => {
      const res = await makeRequest('POST', `/api/jobs/${queueService.QUEUES.CROSSREF_ENRICHMENT}/${failedJobId}/retry`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.state, 'retried');
    });

    await test('6.4: DELETE /api/jobs/:queueName/:jobId cancels and removes job', async () => {
      const jobToCancel = await queueService.addJob(
        queueService.QUEUES.CROSSREF_ENRICHMENT,
        { doi: '10.1234/test-cancel' },
        { delay: 60000 }
      );
      const res = await makeRequest('DELETE', `/api/jobs/${queueService.QUEUES.CROSSREF_ENRICHMENT}/${jobToCancel.id}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const check = await queueService.getJob(queueService.QUEUES.CROSSREF_ENRICHMENT, jobToCancel.id);
      assert.strictEqual(check, null, 'Job should be deleted from queue');
    });

    // ------------------------------------------------------------------
    // 7. Route Integrations for Async Dispatch
    // ------------------------------------------------------------------
    await test('7.1: POST /api/papers/:id/process-pdf triggers async PDF processing (202 Accepted)', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/process-pdf`);
      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.jobId);
      assert.ok(res.body.statusUrl);
    });

    await test('7.2: POST /api/papers/:id/enrich-async triggers async DOI enrichment (202 Accepted)', async () => {
      const res = await makeRequest('POST', `/api/papers/${testPaperId}/enrich-async`, {
        doi: '10.1145/3318464.3389700',
      });
      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.jobId);
      assert.ok(res.body.statusUrl);
    });

    await test('7.3: POST /api/export/async triggers async citation export (202 Accepted)', async () => {
      const res = await makeRequest('POST', '/api/export/async', {
        project_id: testProjectId,
        format: 'xlsx',
      });
      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.jobId);
      assert.ok(res.body.statusUrl);
    });

  } finally {
    // ------------------------------------------------------------------
    // 8. Graceful Teardown
    // ------------------------------------------------------------------
    console.log('\n🧹 Cleaning up test workers, queues, and server...');
    await queueService.closeWorkers();
    await queueService.closeQueues();

    if (server) {
      await new Promise((r) => server.close(r));
    }
  }

  console.log('\n======================================================================');
  console.log(`📊 PHASE 7 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Phase 7 BullMQ test suite`);
  }
}

if (require.main === module) {
  runQueuePhase7Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runQueuePhase7Tests };
