const assert = require('assert');
const http = require('http');
const express = require('express');

const app = require('../server');
const {
  // Zod Schemas
  idParamSchema,
  clusterIdParamSchema,
  jobParamSchema,
  paginationQuerySchema,
  searchQuerySchema,
  registerSchema,
  loginSchema,
  createProjectSchema,
  createClusterSchema,
  createPaperSchema,
  patchStatusSchema,
  batchCellValuesSchema,

  // Class-Validator DTOs
  ProcessPdfJobDto,
  CrossRefJobDto,
  CitationExportJobDto,
  CreatePaperDto,
  CellUpdateDto,
  TaxonomyClusterDto,
  ProjectCreateDto,

  // Middleware & Helpers
  validateRequest,
  validateDto,
  validateDomainDto,
  DomainValidationError,
} = require('../src/validation');

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
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
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

async function runValidationPhase8Tests() {
  console.log('======================================================================');
  console.log('⚡ PHASE 8: REQUEST VALIDATION LAYER (ZOD + CLASS-VALIDATOR) SUITE');
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

  // Create isolated express app for testing validation middleware
  const testApp = express();
  testApp.use(express.json());

  testApp.get('/test/params/:id', validateRequest({ params: idParamSchema }), (req, res) => {
    res.json({ success: true, id: req.params.id, type: typeof req.params.id });
  });

  testApp.get('/test/query', validateRequest({ query: paginationQuerySchema }), (req, res) => {
    res.json({ success: true, query: req.query });
  });

  testApp.post('/test/body/paper', validateRequest({ body: createPaperSchema }), (req, res) => {
    res.status(201).json({ success: true, paper: req.body });
  });

  testApp.post('/test/dto/cluster', validateDto(TaxonomyClusterDto), (req, res) => {
    res.status(201).json({ success: true, cluster: req.body });
  });

  // Start test server
  await new Promise((resolve) => {
    server = http.createServer(testApp);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      console.log(`📡 Validation test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  try {
    // ------------------------------------------------------------------
    // 1. Zod Route Parameter Schemas
    // ------------------------------------------------------------------
    await test('1.1: idParamSchema parses and coerces valid numeric ID', async () => {
      const res = idParamSchema.safeParse({ id: '123' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.id, 123);
      assert.strictEqual(typeof res.data.id, 'number');
    });

    await test('1.2: idParamSchema rejects non-numeric and negative values', async () => {
      const resNaN = idParamSchema.safeParse({ id: 'abc' });
      assert.strictEqual(resNaN.success, false);
      const resNeg = idParamSchema.safeParse({ id: '-5' });
      assert.strictEqual(resNeg.success, false);
    });

    await test('1.3: jobParamSchema validates allowed queue names and rejects unknown queues', async () => {
      const resValid = jobParamSchema.safeParse({
        queueName: 'pdf-processing-queue',
        jobId: 'job-1234',
      });
      assert.strictEqual(resValid.success, true);

      const resInvalid = jobParamSchema.safeParse({
        queueName: 'crypto-miner-queue',
        jobId: 'job-1234',
      });
      assert.strictEqual(resInvalid.success, false);
      assert.ok(resInvalid.error.issues[0].message.includes('queueName must be'));
    });

    // ------------------------------------------------------------------
    // 2. Zod Query Parameter Schemas & Automatic Defaults
    // ------------------------------------------------------------------
    await test('2.1: paginationQuerySchema applies defaults for page, limit, sort', async () => {
      const res = paginationQuerySchema.safeParse({});
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.page, 1);
      assert.strictEqual(res.data.limit, 50);
      assert.strictEqual(res.data.sort, 'year_desc');
    });

    await test('2.2: paginationQuerySchema coerces string numbers and bounds limits', async () => {
      const resValid = paginationQuerySchema.safeParse({ page: '5', limit: '20' });
      assert.strictEqual(resValid.success, true);
      assert.strictEqual(resValid.data.page, 5);
      assert.strictEqual(resValid.data.limit, 20);

      const resExceed = paginationQuerySchema.safeParse({ limit: '250' });
      assert.strictEqual(resExceed.success, false);
    });

    await test('2.3: searchQuerySchema requires non-empty query parameter q', async () => {
      const resMissing = searchQuerySchema.safeParse({});
      assert.strictEqual(resMissing.success, false);

      const resValid = searchQuerySchema.safeParse({ q: 'Transformer models in NLP' });
      assert.strictEqual(resValid.success, true);
      assert.strictEqual(resValid.data.mode, 'auto');
      assert.strictEqual(resValid.data.limit, 20);
    });

    // ------------------------------------------------------------------
    // 3. Zod Request Body Schemas
    // ------------------------------------------------------------------
    await test('3.1: registerSchema validates email format and password min-length', async () => {
      const resInvalidEmail = registerSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123',
        name: 'Dr. Test',
      });
      assert.strictEqual(resInvalidEmail.success, false);
      assert.ok(resInvalidEmail.error.issues[0].message.includes('Invalid email address'));

      const resShortPass = registerSchema.safeParse({
        email: 'valid@university.edu',
        password: 'short',
        name: 'Dr. Test',
      });
      assert.strictEqual(resShortPass.success, false);
      assert.ok(resShortPass.error.issues[0].message.includes('at least 8 characters'));
    });

    await test('3.2: createProjectSchema enforces min name length and defaults', async () => {
      const resShort = createProjectSchema.safeParse({ name: 'A' });
      assert.strictEqual(resShort.success, false);

      const resValid = createProjectSchema.safeParse({ name: 'Systematic Literature Review 2026' });
      assert.strictEqual(resValid.success, true);
      assert.strictEqual(resValid.data.is_public, false);
      assert.strictEqual(resValid.data.domain, 'General');
    });

    await test('3.3: createClusterSchema enforces valid hex color validation', async () => {
      const resValid = createClusterSchema.safeParse({
        project_id: 1,
        name: 'Deep Learning',
        color: '#38bdf8',
      });
      assert.strictEqual(resValid.success, true);

      const resInvalid = createClusterSchema.safeParse({
        project_id: 1,
        name: 'Deep Learning',
        color: 'invalid-blue',
      });
      assert.strictEqual(resInvalid.success, false);
      assert.ok(resInvalid.error.issues[0].message.includes('valid hex code'));
    });

    await test('3.4: patchStatusSchema enforces academic review status enum', async () => {
      const resValid = patchStatusSchema.safeParse({ status: 'analyzed' });
      assert.strictEqual(resValid.success, true);

      const resInvalid = patchStatusSchema.safeParse({ status: 'deleted' });
      assert.strictEqual(resInvalid.success, false);
    });

    await test('3.5: batchCellValuesSchema validates array of cell updates', async () => {
      const resEmpty = batchCellValuesSchema.safeParse({ values: [] });
      assert.strictEqual(resEmpty.success, false);

      const resValid = batchCellValuesSchema.safeParse({
        values: [
          { paper_id: '1', column_id: '2', value: '42.5%' },
          { paper_id: '1', column_id: '3', value: true },
        ],
      });
      assert.strictEqual(resValid.success, true);
      assert.strictEqual(resValid.data.values[0].value, '42.5%');
      assert.strictEqual(resValid.data.values[1].value, 'true');
    });

    // ------------------------------------------------------------------
    // 4. class-validator Domain DTOs
    // ------------------------------------------------------------------
    await test('4.1: ProcessPdfJobDto validates required integer paperId', async () => {
      const validDto = new ProcessPdfJobDto({ paperId: 10, projectId: 1 });
      const validInstance = await validateDomainDto(ProcessPdfJobDto, validDto);
      assert.strictEqual(validInstance.paperId, 10);

      await assert.rejects(
        async () => {
          await validateDomainDto(ProcessPdfJobDto, { paperId: -5 });
        },
        (err) => {
          assert.strictEqual(err.name, 'DomainValidationError');
          assert.ok(err.details.length >= 1);
          return true;
        }
      );
    });

    await test('4.2: CrossRefJobDto enforces DOI presence and format', async () => {
      const validDto = new CrossRefJobDto({ doi: '10.1145/3318464.3389700' });
      const validInstance = await validateDomainDto(CrossRefJobDto, validDto);
      assert.strictEqual(validInstance.doi, '10.1145/3318464.3389700');

      await assert.rejects(
        async () => {
          await validateDomainDto(CrossRefJobDto, { doi: '' });
        },
        (err) => {
          assert.strictEqual(err.name, 'DomainValidationError');
          assert.strictEqual(err.message, 'Valid DOI is required');
          return true;
        }
      );
    });

    await test('4.3: CitationExportJobDto enforces supported academic export formats', async () => {
      const validXlsx = await validateDomainDto(CitationExportJobDto, { format: 'xlsx' });
      assert.strictEqual(validXlsx.format, 'xlsx');

      const validBib = await validateDomainDto(CitationExportJobDto, { format: 'bibtex' });
      assert.strictEqual(validBib.format, 'bibtex');

      await assert.rejects(
        async () => {
          await validateDomainDto(CitationExportJobDto, { format: 'invalid_doc' });
        },
        (err) => {
          assert.ok(err.message.includes("format must be 'xlsx', 'bibtex', 'bib', 'ris', 'csv', or 'json'"));
          return true;
        }
      );
    });

    await test('4.4: CellUpdateDto enforces integer column and paper identifiers', async () => {
      const valid = await validateDomainDto(CellUpdateDto, { paperId: 1, columnId: 4, value: 'O(n log n)' });
      assert.strictEqual(valid.value, 'O(n log n)');

      await assert.rejects(
        async () => {
          await validateDomainDto(CellUpdateDto, { paperId: 'invalid', columnId: 4, value: 'test' });
        },
        (err) => {
          assert.ok(err.details.some(d => d.field === 'paperId'));
          return true;
        }
      );
    });

    await test('4.5: TaxonomyClusterDto validates hex color format', async () => {
      const valid = await validateDomainDto(TaxonomyClusterDto, {
        projectId: 1,
        name: 'Distributed Systems',
        color: '#4f46e5',
      });
      assert.strictEqual(valid.color, '#4f46e5');

      await assert.rejects(
        async () => {
          await validateDomainDto(TaxonomyClusterDto, {
            projectId: 1,
            name: 'Distributed Systems',
            color: 'not-a-color',
          });
        },
        (err) => {
          assert.ok(err.message.includes('valid hex color code'));
          return true;
        }
      );
    });

    // ------------------------------------------------------------------
    // 5. Centralized Express Validation Middleware
    // ------------------------------------------------------------------
    await test('5.1: validateRequest converts valid numeric route params', async () => {
      const res = await makeRequest('GET', '/test/params/42');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.id, 42);
      assert.strictEqual(res.body.type, 'number');
    });

    await test('5.2: validateRequest returns structured HTTP 400 on invalid route params', async () => {
      const res = await makeRequest('GET', '/test/params/not-a-number');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error, 'Validation failed');
      assert.ok(Array.isArray(res.body.details));
      assert.strictEqual(res.body.details[0].location, 'params');
      assert.strictEqual(res.body.details[0].field, 'id');
    });

    await test('5.3: validateRequest applies query defaults and coerces types', async () => {
      const res = await makeRequest('GET', '/test/query?page=2&limit=15');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.query.page, 2);
      assert.strictEqual(res.body.query.limit, 15);
      assert.strictEqual(res.body.query.sort, 'year_desc');
    });

    await test('5.4: validateRequest returns structured HTTP 400 on invalid query values', async () => {
      const res = await makeRequest('GET', '/test/query?limit=500');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.details[0].location, 'query');
      assert.strictEqual(res.body.details[0].field, 'limit');
    });

    await test('5.5: validateRequest accepts valid body payload and applies defaults', async () => {
      const res = await makeRequest('POST', '/test/body/paper', {
        title: 'Deep Residual Learning for Image Recognition',
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.paper.authors, 'Academic Researchers');
      assert.strictEqual(res.body.paper.status, 'unread');
    });

    await test('5.6: validateRequest returns structured HTTP 400 on invalid body payload', async () => {
      const res = await makeRequest('POST', '/test/body/paper', {
        title: 'A', // too short (< 2 chars)
        status: 'invalid_status',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.details[0].location, 'body');
      assert.ok(res.body.details.some(d => d.field === 'title'));
      assert.ok(res.body.details.some(d => d.field === 'status'));
    });

    await test('5.7: validateDto validates class-validator DTO via Express middleware', async () => {
      const resValid = await makeRequest('POST', '/test/dto/cluster', {
        projectId: 1,
        name: 'Quantum Computing',
        color: '#10b981',
      });
      assert.strictEqual(resValid.status, 201);
      assert.strictEqual(resValid.body.success, true);

      const resInvalid = await makeRequest('POST', '/test/dto/cluster', {
        projectId: 1,
        name: 'Q', // too short (< 2)
        color: 'red', // invalid hex
      });
      assert.strictEqual(resInvalid.status, 400);
      assert.strictEqual(resInvalid.body.success, false);
      assert.strictEqual(resInvalid.body.error, 'DTO validation failed');
      assert.ok(resInvalid.body.details.length >= 1);
    });

    // ------------------------------------------------------------------
    // 6. Real Route Integration with Validation Middleware
    // ------------------------------------------------------------------
    await test('6.1: Real route /api/jobs/:queueName/:jobId validates queueName parameter', async () => {
      // Connect to real server instance
      let realServer;
      let realUrl;
      await new Promise((resolve) => {
        realServer = http.createServer(app);
        realServer.listen(0, '127.0.0.1', () => {
          const addr = realServer.address();
          realUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });

      try {
        const resInvalid = await new Promise((resolve) => {
          const u = new URL('/api/jobs/invalid-queue-name/1234', realUrl);
          http.get(u, (r) => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(d) }));
          });
        });

        assert.strictEqual(resInvalid.status, 400);
        assert.strictEqual(resInvalid.body.success, false);
        assert.strictEqual(resInvalid.body.error, 'Validation failed');
        assert.ok(resInvalid.body.details[0].message.includes("queueName must be"));
      } finally {
        await new Promise(r => realServer.close(r));
      }
    });

  } finally {
    if (server) {
      await new Promise((r) => server.close(r));
    }
  }

  console.log('\n======================================================================');
  console.log(`📊 PHASE 8 SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Phase 8 validation test suite`);
  }
}

if (require.main === module) {
  runValidationPhase8Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runValidationPhase8Tests };
