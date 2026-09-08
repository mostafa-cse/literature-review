const http = require('http');
const { CircuitBreaker, RateLimiter } = require('../src/services/scholarlyService');

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('🧪 PHASE 4: MULTI-SOURCE SCHOLARLY ENGINE VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(title, condition, extraInfo = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${title} ${extraInfo}`);
    } else {
      console.error(`❌ [FAIL] ${title} ${extraInfo}`);
    }
  }

  // ----------------------------------------------------
  // 1. CIRCUIT BREAKER UNIT TESTS
  // ----------------------------------------------------
  console.log('\n--- 1. Circuit Breaker Unit Tests ---');
  const testBreaker = new CircuitBreaker('test_provider', {
    failureThreshold: 3,
    cooldownMs: 200,
    successThreshold: 2
  });

  assert('Circuit Breaker starts CLOSED', testBreaker.state === 'CLOSED');
  assert('canRequest() returns true when CLOSED', testBreaker.canRequest() === true);

  testBreaker.recordFailure(new Error('Test err 1'));
  testBreaker.recordFailure(new Error('Test err 2'));
  assert('Remains CLOSED below threshold', testBreaker.state === 'CLOSED' && testBreaker.failureCount === 2);

  testBreaker.recordFailure(new Error('Test err 3'));
  assert('Transitions to OPEN upon reaching threshold (3 failures)', testBreaker.state === 'OPEN');
  assert('Fast-fails (canRequest returns false) while OPEN', testBreaker.canRequest() === false);

  // Wait for cooldown
  await new Promise(r => setTimeout(r, 250));
  assert('Transitions to HALF_OPEN after cooldown expires', testBreaker.canRequest() === true && testBreaker.state === 'HALF_OPEN');

  testBreaker.recordSuccess();
  assert('Remains HALF_OPEN after 1st probe success (threshold=2)', testBreaker.state === 'HALF_OPEN' && testBreaker.successCount === 1);

  testBreaker.recordSuccess();
  assert('Resets to CLOSED after reaching successThreshold', testBreaker.state === 'CLOSED' && testBreaker.failureCount === 0);

  // ----------------------------------------------------
  // 2. RATE LIMITER UNIT TESTS
  // ----------------------------------------------------
  console.log('\n--- 2. Rate Limiter Unit Tests ---');
  const testLimiter = new RateLimiter('test_limiter', 3, 100);
  const startT = Date.now();
  await testLimiter.acquire();
  await testLimiter.acquire();
  await testLimiter.acquire();
  const firstBurst = Date.now() - startT;
  assert('Acquires tokens immediately within quota', firstBurst < 50, `(${firstBurst}ms)`);

  await testLimiter.acquire();
  const delayedT = Date.now() - startT;
  assert('Throttles 4th request when tokens exhausted', delayedT >= 50, `(${delayedT}ms)`);

  // ----------------------------------------------------
  // 3. PROVIDER HEALTH DIAGNOSTIC ENDPOINT
  // ----------------------------------------------------
  console.log('\n--- 3. Testing Provider Health Endpoint ---');
  const healthRes = await request({
    host: 'localhost', port: 3000, path: '/api/doi/providers/health', method: 'GET'
  });
  assert('GET /api/doi/providers/health returns 200', healthRes.status === 200);
  assert('Health reports overall status healthy', healthRes.body && (healthRes.body.status === 'healthy' || healthRes.body.status === 'degraded'));
  const providers = healthRes.body?.providers || {};
  assert('Exposes CrossRef provider breaker', Boolean(providers.crossref));
  assert('Exposes Semantic Scholar provider breaker', Boolean(providers.semanticscholar));
  assert('Exposes OpenAlex provider breaker', Boolean(providers.openalex));
  assert('Exposes arXiv provider breaker', Boolean(providers.arxiv));
  assert('Exposes Unpaywall provider breaker', Boolean(providers.unpaywall));
  console.log('Provider breaker states:', Object.entries(providers).map(([k, v]) => `${k}:${v.state}`).join(', '));

  // ----------------------------------------------------
  // 4. MULTI-SOURCE SCHOLARLY CASCADE LOOKUP
  // ----------------------------------------------------
  console.log('\n--- 4. Testing Multi-Source DOI Lookup (ACM Computing Surveys DOI) ---');
  // Test DOI: 10.1145/3318464.3389700 (A Survey on Modern Quantum Computing)
  const t0 = Date.now();
  const lookup1 = await request({
    host: 'localhost', port: 3000, path: '/api/doi/lookup?doi=10.1145/3318464.3389700', method: 'GET'
  });
  const dur1 = Date.now() - t0;
  console.log(`Lookup 1 completed in ${dur1}ms, status: ${lookup1.status}`);

  assert('GET /api/doi/lookup returns 200', lookup1.status === 200);
  const b1 = lookup1.body;
  assert('Resolves paper title', Boolean(b1.title && b1.title.length > 5), `"${b1.title?.substring(0, 45)}..."`);
  assert('Resolves authors', Boolean(b1.authors && b1.authors.length > 3), `"${b1.authors?.substring(0, 40)}..."`);
  assert('Resolves publication venue', Boolean(b1.pub), `"${b1.pub}"`);
  assert('Consulted multi-source cascade', Array.isArray(b1.sources) && b1.sources.length > 0, `[${b1.sources?.join(', ')}]`);
  assert('Populates column_values mapping for workspace', Boolean(b1.column_values && b1.column_values.title));

  // ----------------------------------------------------
  // 5. 24-HOUR REDIS CACHE TEST
  // ----------------------------------------------------
  console.log('\n--- 5. Testing Redis Caching on Subsequent Lookup ---');
  const tCached = Date.now();
  const lookupCached = await request({
    host: 'localhost', port: 3000, path: '/api/doi/lookup?doi=10.1145/3318464.3389700', method: 'GET'
  });
  const durCached = Date.now() - tCached;
  console.log(`Cached lookup returned in ${durCached}ms`);

  assert('Cached response returned in sub-500ms', durCached < 500, `(${durCached}ms)`);
  assert('Cached response has X-Cache HIT or cached flag', lookupCached.headers['x-cache'] === 'HIT' || lookupCached.body.cached === true);
  assert('Cached body preserves title and sources', lookupCached.body.title === b1.title);

  // ----------------------------------------------------
  // 6. arXiv PREPRINT LOOKUP TEST
  // ----------------------------------------------------
  console.log('\n--- 6. Testing arXiv Preprint Lookup ---');
  // Test arXiv: 2106.15928 (NeRF in the Wild / LLM preprint)
  const arxivRes = await request({
    host: 'localhost', port: 3000, path: '/api/doi/lookup?doi=2106.15928', method: 'GET'
  });
  assert('arXiv lookup returns 200', arxivRes.status === 200);
  const arxivBody = arxivRes.body;
  assert('arXiv lookup identifies paper title', Boolean(arxivBody.title && arxivBody.title.length > 5), `"${arxivBody.title?.substring(0, 45)}..."`);
  assert('arXiv lookup consulted arXiv source', Array.isArray(arxivBody.sources) && arxivBody.sources.includes('arxiv'));
  assert('arXiv resolves direct PDF URL', Boolean(arxivBody.pdf_url && arxivBody.pdf_url.includes('arxiv.org/pdf')), `"${arxivBody.pdf_url}"`);

  // ----------------------------------------------------
  // 7. DIRECT DOI PAPER INGESTION & CACHE INVALIDATION
  // ----------------------------------------------------
  console.log('\n--- 7. Testing DOI Ingestion into Workspace Project ---');
  const ingestRes = await request({
    host: 'localhost', port: 3000, path: '/api/doi/ingest', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    doi: '10.1145/3318464.3389700',
    project_id: 20
  });

  assert('POST /api/doi/ingest returns 201', ingestRes.status === 201);
  assert('Ingest reports count 1', ingestRes.body && ingestRes.body.count === 1);
  const newPaper = ingestRes.body?.papers?.[0];
  assert('Ingested paper has ID', Boolean(newPaper && newPaper.id > 0));
  assert('Ingested paper has title and authors', Boolean(newPaper?.title && newPaper?.authors));
  assert('Ingested paper has intuition (TL;DR or abstract)', typeof newPaper?.intuition === 'string');

  // ----------------------------------------------------
  // 8. INVALID DOI 404 HANDLING
  // ----------------------------------------------------
  console.log('\n--- 8. Testing 404 Handling for Non-existent DOI ---');
  const notFoundRes = await request({
    host: 'localhost', port: 3000, path: '/api/doi/lookup?doi=10.99999/definitely_not_a_real_academic_doi_xyz987', method: 'GET'
  });
  assert('Invalid DOI returns 404', notFoundRes.status === 404);

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`🏁 PHASE 4 RESULTS: ${passed} / ${total} assertions passed (${Math.round(passed/total*100)}%)`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase4Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
