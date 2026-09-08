const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = require('../server');
const { getDb } = require('../src/db');
const queueService = require('../src/services/queueService');
const { sseManager } = require('../src/services/sseService');

let server;
let baseUrl;

/**
 * Parses raw SSE chunk data into structured events
 * Form: event: <name>\ndata: <json>\n\n
 */
function parseSseChunks(rawText) {
  const events = [];
  const blocks = rawText.split('\n\n');
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(':')) continue; // skip comments / keepalive

    const lines = trimmed.split('\n');
    let eventType = 'message';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.replace('event:', '').trim();
      } else if (line.startsWith('data:')) {
        dataStr += line.replace('data:', '').trim();
      }
    }

    if (dataStr) {
      let parsed = dataStr;
      try { parsed = JSON.parse(dataStr); } catch (_) {}
      events.push({ event: eventType, data: parsed });
    }
  }
  return events;
}

/**
 * Connect to an SSE stream and collect events until condition is met or timeout
 */
function listenToSse(urlPath, onEvent, maxWaitMs = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    };

    let buffer = '';
    const collectedEvents = [];
    const timer = setTimeout(() => {
      req.destroy();
      resolve({ events: collectedEvents, timedOut: true });
    }, maxWaitMs);

    const req = http.request(options, (res) => {
      const isSse = (res.headers['content-type'] || '').includes('text/event-stream');
      const statusCode = res.statusCode;

      res.on('data', (chunk) => {
        const text = chunk.toString('utf-8');
        buffer += text;

        const parsed = parseSseChunks(buffer);
        while (parsed.length > collectedEvents.length) {
          const newEvent = parsed[collectedEvents.length];
          collectedEvents.push(newEvent);
          if (typeof onEvent === 'function') {
            const shouldStop = onEvent(newEvent, collectedEvents);
            if (shouldStop) {
              clearTimeout(timer);
              req.destroy();
              return resolve({ events: collectedEvents, statusCode, isSse, completed: true });
            }
          }
        }
      });

      res.on('end', () => {
        clearTimeout(timer);
        resolve({ events: collectedEvents, statusCode, isSse, ended: true });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      if (collectedEvents.length > 0) {
        resolve({ events: collectedEvents, error: err });
      } else {
        reject(err);
      }
    });

    req.end();
  });
}

async function runPhase5SseTests() {
  console.log('======================================================================');
  console.log('⚡ PHASE 5: REAL-TIME STREAMING & BACKGROUND INGESTION PROGRESS TEST SUITE');
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
  let testProjectId = 1;
  const existingProj = db.prepare('SELECT id FROM projects WHERE id = 1').get();
  if (!existingProj) {
    const pRes = db.prepare("INSERT INTO projects (name, description) VALUES ('SSE Test Project', 'Phase 5 Test')").run();
    testProjectId = pRes.lastInsertRowid;
  }

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: KaTeX Equation Extractor Unit Tests
    // ----------------------------------------------------
    console.log('--- 1. KaTeX Equation Extractor Unit Tests ---');

    await test('1.1: extractKatexEquations extracts display math ($$...$$)', () => {
      const text = 'Here is the primary loss function: $$\\mathcal{L}_{total} = \\alpha \\mathcal{L}_{reg} + \\beta \\mathcal{L}_{cls}$$ which converges rapidly.';
      const matches = queueService.extractKatexEquations(text);
      assert(matches.length >= 1, 'Should find at least 1 display equation');
      assert.strictEqual(matches[0].type, 'display');
      assert.strictEqual(matches[0].latex, '\\mathcal{L}_{total} = \\alpha \\mathcal{L}_{reg} + \\beta \\mathcal{L}_{cls}');
    });

    await test('1.2: extractKatexEquations extracts inline math ($...$)', () => {
      const text = 'The complexity is bounded by $O(N \\log K)$ in the average case.';
      const matches = queueService.extractKatexEquations(text);
      assert(matches.length >= 1, 'Should find inline equation');
      assert.strictEqual(matches[0].latex, 'O(N \\log K)');
    });

    await test('1.3: extractKatexEquations extracts unbracketed LaTeX commands (\\mathcal{O}, \\sum, \\frac)', () => {
      const text = 'We achieve \\mathcal{O}(N \\log K) asymptotic runtime with \\sum_{i=1}^n \\frac{w_i}{k}.';
      const matches = queueService.extractKatexEquations(text);
      assert(matches.length >= 1, 'Should detect LaTeX command patterns');
      assert(matches.some(m => m.latex.includes('\\mathcal{O}') || m.latex.includes('\\sum')), 'Should extract formula commands');
    });

    await test('1.4: extractKatexEquations handles empty or invalid text safely', () => {
      assert.deepStrictEqual(queueService.extractKatexEquations(null), []);
      assert.deepStrictEqual(queueService.extractKatexEquations(''), []);
      assert.deepStrictEqual(queueService.extractKatexEquations(12345), []);
    });

    // ----------------------------------------------------
    // TEST GROUP 2: SSE Headers & Connection Management
    // ----------------------------------------------------
    console.log('\n--- 2. SSE Stream Handshake & Snapshots ---');

    let testJob;
    await test('2.1: Enqueue a PDF processing job with synthetic math manuscript', async () => {
      const paperRes = db.prepare(`
        INSERT INTO papers (project_id, title, authors, year, pub, doi, pdf_url, status, domain, intuition, equation, strengths, gaps)
        VALUES (?, 'Streaming Quantum Synthesis', 'Dr. Alice Researcher', '2026', 'IEEE Trans', '10.1109/LIT.2026.01', '/uploads/test_stream.pdf', 'unread', 'Quantum Computing', '', '', '', '')
      `).run(testProjectId);
      const testPaperId = paperRes.lastInsertRowid;

      // Synthetic PDF content with display math in abstract/text
      const syntheticPdfText = `%PDF-1.4
% LitSphere Synthetic Manuscript
1 0 obj
<< /Title (Streaming Quantum Synthesis) /Author (Dr. Alice Researcher) >>
endobj
2 0 obj
<< /Type /Page /Contents 3 0 R >>
endobj
3 0 obj
<< /Length 120 >>
stream
Quantum synthesis efficiency is characterized by $$\\mathcal{O}(2^n / \\sqrt{k})$$ with Hamiltonian eigenvalues.
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;

      db.prepare(`
        INSERT INTO paper_files (paper_id, filename, mimetype, file_size, data)
        VALUES (?, 'test_stream.pdf', 'application/pdf', ?, ?)
      `).run(testPaperId, syntheticPdfText.length, Buffer.from(syntheticPdfText));

      testJob = await queueService.addJob(queueService.QUEUES.PDF_PROCESSING, {
        paperId: testPaperId,
        projectId: testProjectId,
        originalFilename: 'test_stream.pdf',
      });

      assert(testJob && testJob.id, 'Job should be successfully enqueued');
    });

    await test('2.2: GET /api/jobs/:queueName/:jobId/stream returns text/event-stream headers and status snapshot', async () => {
      const streamUrl = `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${testJob.id}/stream`;
      const result = await listenToSse(streamUrl, (evt) => {
        if (evt.event === 'status' || evt.event === 'completed') {
          return true; // Stop after first snapshot or completion
        }
      }, 5000);

      assert.strictEqual(result.statusCode, 200, 'SSE status should be 200 OK');
      assert.strictEqual(result.isSse, true, 'Content-Type must be text/event-stream');
      assert(result.events.length >= 1, 'Should receive at least initial status event');

      const statusEvt = result.events.find(e => e.event === 'status');
      if (statusEvt) {
        assert.strictEqual(statusEvt.data.queueName, queueService.QUEUES.PDF_PROCESSING);
        assert.strictEqual(String(statusEvt.data.jobId), String(testJob.id));
        assert(statusEvt.data.timestamp, 'Event must have timestamp');
      }
    });

    await test('2.3: GET /api/jobs/:queueName/nonexistent/stream returns 404', async () => {
      const result = await listenToSse(`/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/999999999/stream`, null, 3000);
      assert.strictEqual(result.statusCode, 404, 'Non-existent job must return 404');
    });

    // ----------------------------------------------------
    // TEST GROUP 3: Real-Time 4-Stage Telemetry Streaming
    // ----------------------------------------------------
    console.log('\n--- 3. Real-Time 4-Stage Ingestion Telemetry & KaTeX Resolution ---');

    await test('3.1: Stream real-time events through all 4 ingestion stages to completion', async () => {
      // Create new fresh paper for active end-to-end stream observation
      const paperRes = db.prepare(`
        INSERT INTO papers (project_id, title, authors, year, pub, doi, pdf_url, status, domain, intuition, equation, strengths, gaps)
        VALUES (?, 'Processing Manuscript...', 'Extracting Authors...', '2026', '', '', '/uploads/active_stream.pdf', 'unread', 'General', '', '', '', '')
      `).run(testProjectId);
      const activePaperId = paperRes.lastInsertRowid;

      const syntheticMathDoc = `%PDF-1.4
1 0 obj
<< /Title (Algorithmic Bounds for Sparse Matrix Decompositions) /Author (Prof. Euler) >>
endobj
2 0 obj
stream
We formulate the complexity as $$\\mathcal{O}(M \\cdot N \\log K)$$ with constraint \\sum_{j=1}^m w_j \\le C.
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF`;

      db.prepare(`
        INSERT INTO paper_files (paper_id, filename, mimetype, file_size, data)
        VALUES (?, 'active_stream.pdf', 'application/pdf', ?, ?)
      `).run(activePaperId, syntheticMathDoc.length, Buffer.from(syntheticMathDoc));

      // Add job with delay so worker doesn't race ahead before client connects
      const streamJob = await queueService.addJob(queueService.QUEUES.PDF_PROCESSING, {
        paperId: activePaperId,
        projectId: testProjectId,
        originalFilename: 'active_stream.pdf',
      }, { delay: 60000 });

      const collectedStages = [];
      const streamPromise = listenToSse(
        `/api/jobs/${queueService.QUEUES.PDF_PROCESSING}/${streamJob.id}/stream`,
        (evt) => {
          if (evt.event === 'progress' && evt.data && evt.data.stage) {
            collectedStages.push(evt.data.stage);
          }
          if (evt.event === 'completed') {
            return true; // Finished
          }
        },
        10000
      );

      // Allow 150ms for client to establish SSE stream and register subscriber
      await new Promise(r => setTimeout(r, 150));

      // Execute worker processing logic on this job
      await queueService.processPdfJob(streamJob);

      const streamResult = await streamPromise;

      assert(streamResult.events.length >= 2, `Should receive multiple SSE events, got ${streamResult.events.length}`);
      assert(collectedStages.length >= 1, `Should receive stage progress updates, got ${collectedStages.length}`);

      // Verify completion event
      const completeEvt = streamResult.events.find(e => e.event === 'completed');
      assert(completeEvt, 'Must receive completed event');
      assert(completeEvt.data.success === true, 'Completion event must indicate success');

      // Verify SQLite paper record was updated with KaTeX formatted equation
      const updatedPaper = db.prepare('SELECT * FROM papers WHERE id = ?').get(activePaperId);
      assert(updatedPaper, 'Paper row should exist');
      assert(updatedPaper.title && updatedPaper.title !== 'Processing Manuscript...', `Paper title should be updated, got: ${updatedPaper.title}`);
      assert(updatedPaper.equation && updatedPaper.equation.includes('mathcal{O}'), `Paper equation should contain extracted KaTeX formula, got: ${updatedPaper.equation}`);

      // Clean up delayed job from queue
      try {
        await streamJob.remove();
      } catch (_) {}
    });

    // ----------------------------------------------------
    // TEST GROUP 4: Batch Streaming Endpoint
    // ----------------------------------------------------
    console.log('\n--- 4. Batch Multi-Job SSE Streaming ---');

    await test('4.1: GET /api/jobs/stream/batch without job_ids returns 400 Bad Request', async () => {
      const res = await listenToSse('/api/jobs/stream/batch', null, 3000);
      assert.strictEqual(res.statusCode, 400, 'Missing job_ids must return 400');
    });

    await test('4.2: GET /api/jobs/stream/batch emits batch_init frame and closes upon completion', async () => {
      // Create 2 jobs
      const j1 = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        project_id: testProjectId,
        format: 'bibtex',
        target: 'clipboard',
      });
      const j2 = await queueService.addJob(queueService.QUEUES.CITATION_EXPORT, {
        project_id: testProjectId,
        format: 'bibtex',
        target: 'clipboard',
      });

      const batchUrl = `/api/jobs/stream/batch?job_ids=${j1.id},${j2.id}&queue=${queueService.QUEUES.CITATION_EXPORT}`;
      const batchResult = await listenToSse(batchUrl, (evt) => {
        if (evt.event === 'batch_init') {
          return false;
        }
      }, 10000);

      assert.strictEqual(batchResult.statusCode, 200, 'Batch stream must return 200 OK');
      assert.strictEqual(batchResult.isSse, true, 'Batch stream must be text/event-stream');

      const initEvt = batchResult.events.find(e => e.event === 'batch_init');
      assert(initEvt, 'Must receive batch_init event');
      assert.strictEqual(initEvt.data.count, 2, 'Batch count must match requested jobs');
      assert(Array.isArray(initEvt.data.jobs), 'batch_init must include jobs array');
    });

  } finally {
    console.log('\n🧹 Cleaning up test workers, queues, and server...');
    try {
      await queueService.closeWorkers();
    } catch (_) {}
    try {
      await queueService.closeQueues();
    } catch (_) {}
    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('\n======================================================================');
  console.log(`📊 PHASE 5 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else if (require.main === module) {
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase5SseTests().catch((err) => {
    console.error('Fatal error running Phase 5 tests:', err);
    process.exit(1);
  });
}

module.exports = { runPhase5SseTests };
