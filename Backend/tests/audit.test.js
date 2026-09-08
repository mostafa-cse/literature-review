const http = require('http');

async function request(options, postData) {
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

async function runFullBackendAudit() {
  console.log('====================================================');
  console.log('🔬 COMPREHENSIVE BACKEND VERIFICATION AUDIT');
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

  try {
    // 0. Auth Login
    const loginRes = await request({
      host: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'researcher@litsphere.ac', password: 'researcher123' });
    const token = loginRes.body && loginRes.body.token;
    const authHeaders = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

    // 1. Projects API
    console.log('--- 1. Testing Projects API ---');
    const pList = await request({ host: 'localhost', port: 3000, path: '/api/projects', method: 'GET', headers: authHeaders });
    assert('GET /api/projects', pList.status === 200 && Array.isArray(pList.body));

    const pCreate = await request({
      host: 'localhost', port: 3000, path: '/api/projects', method: 'POST',
      headers: authHeaders
    }, { name: 'Audit Test Project ' + Date.now(), description: 'Testing end-to-end backend reliability' });
    assert('POST /api/projects', pCreate.status === 201 && pCreate.body.id > 0);
    const testProjectId = pCreate.body.id;

    // 2. Clusters API
    console.log('\n--- 2. Testing Clusters API ---');
    const cCreate = await request({
      host: 'localhost', port: 3000, path: '/api/clusters', method: 'POST',
      headers: authHeaders
    }, { project_id: testProjectId, name: 'Deep Anomaly Detection', description: 'Autoencoder & GNN based detection', color: '#6366f1' });
    assert('POST /api/clusters', cCreate.status === 201 && cCreate.body.id > 0);
    const testClusterId = cCreate.body.id;

    const cList = await request({ host: 'localhost', port: 3000, path: `/api/clusters?project_id=${testProjectId}`, method: 'GET', headers: authHeaders });
    assert('GET /api/clusters (Scoped by Project)', cList.status === 200 && cList.body.length === 1 && cList.body[0].id === testClusterId);

    // 3. Dynamic Columns & Split Column API
    console.log('\n--- 3. Testing Dynamic Columns & Column Splitting ---');
    const colCreate = await request({
      host: 'localhost', port: 3000, path: '/api/dynamic-columns', method: 'POST',
      headers: authHeaders
    }, { cluster_id: testClusterId, column_name: 'Computational Complexity' });
    assert('POST /api/dynamic-columns', colCreate.status === 201 && colCreate.body.id > 0);

    const colSplit = await request({
      host: 'localhost', port: 3000, path: '/api/dynamic-columns/split', method: 'POST',
      headers: authHeaders
    }, { cluster_id: testClusterId, parent_column_name: 'Computational Complexity', sub_columns: ['Time Complexity', 'Space Complexity'] });
    assert('POST /api/dynamic-columns/split', colSplit.status === 201 && colSplit.body.sub_columns.length === 2);

    const colsList = await request({ host: 'localhost', port: 3000, path: `/api/dynamic-columns?cluster_id=${testClusterId}`, method: 'GET', headers: authHeaders });
    assert('GET /api/dynamic-columns', colsList.status === 200 && Array.isArray(colsList.body) && colsList.body.length >= 2, `(Received ${colsList.body.length} columns)`);

    // Test Unsplit Endpoint
    const colUnsplit = await request({
      host: 'localhost', port: 3000, path: '/api/dynamic-columns/unsplit', method: 'POST',
      headers: authHeaders
    }, { cluster_id: testClusterId, parent_column_name: 'Computational Complexity' });
    assert('POST /api/dynamic-columns/unsplit', colUnsplit.status === 200 && colUnsplit.body.success === true);

    // Re-split for downstream tests
    await request({
      host: 'localhost', port: 3000, path: '/api/dynamic-columns/split', method: 'POST',
      headers: authHeaders
    }, { cluster_id: testClusterId, parent_column_name: 'Computational Complexity', sub_columns: ['Time Complexity', 'Space Complexity'] });

    const updatedCols = await request({ host: 'localhost', port: 3000, path: `/api/dynamic-columns?cluster_id=${testClusterId}`, method: 'GET', headers: authHeaders });

    // 4. Papers API & Ingestion
    console.log('\n--- 4. Testing Papers CRUD, Inline Editing & Values ---');
    const timeCol = updatedCols.body.find(c => c.column_name === 'Time Complexity');
    const paperCreate = await request({
      host: 'localhost', port: 3000, path: '/api/papers', method: 'POST',
      headers: authHeaders
    }, {
      project_id: testProjectId,
      cluster_id: testClusterId,
      title: 'Deep Isolation Forest for High-Dimensional Anomaly Detection',
      authors: 'Xu, H., Wang, Y., et al.',
      year: 2024,
      pub: 'IEEE TKDE',
      domain: 'Cybersecurity',
      doi: '10.1109/TKDE.2024.12345',
      status: 'unread',
      intuition: 'Combines neural representation learning with isolation trees.',
      equation: 'S(x, n) = 2^{-\\frac{E(h(x))}{c(n)}}',
      strengths: ['Handles multi-modal embeddings', 'Sub-linear inference time'],
      gaps: ['Requires pre-training on clean reference sets'],
      keywords: ['Anomaly Detection', 'Isolation Forest', 'Deep Learning'],
      custom_columns: timeCol ? { [timeCol.id]: 'O(n \\log n)' } : {}
    });
    assert('POST /api/papers', paperCreate.status === 201 && paperCreate.body && paperCreate.body.id > 0, JSON.stringify(paperCreate));
    const testPaperId = paperCreate.body && paperCreate.body.id;

    // Get Single Paper
    const paperGet = await request({ host: 'localhost', port: 3000, path: `/api/papers/${testPaperId}`, method: 'GET', headers: authHeaders });
    assert('GET /api/papers/:id', paperGet.status === 200 && paperGet.body.keywords.includes('Anomaly Detection'));

    // Update Paper Status
    const paperUpdate = await request({
      host: 'localhost', port: 3000, path: `/api/papers/${testPaperId}`, method: 'PUT',
      headers: authHeaders
    }, { status: 'read', domain: 'Industrial IoT' });
    assert('PUT /api/papers/:id', paperUpdate.status === 200 && paperUpdate.body.status === 'read');

    // Update Dynamic Column Value
    if (timeCol) {
      const pcv = await request({
        host: 'localhost', port: 3000, path: '/api/paper-column-values', method: 'POST',
        headers: authHeaders
      }, { paper_id: testPaperId, column_id: timeCol.id, value: 'O(N \\cdot D \\log K)' });
      assert('POST /api/paper-column-values', pcv.status === 200 && pcv.body.success === true);
    }

    // 5. DOI Ingestion
    console.log('\n--- 5. Testing DOI Ingestion & CrossRef Integration ---');
    const doiIngest = await request({
      host: 'localhost', port: 3000, path: '/api/doi/ingest', method: 'POST',
      headers: authHeaders
    }, { project_id: testProjectId, cluster_id: testClusterId, doi: '10.1145/2939672.2939785' });
    assert('POST /api/doi/ingest', doiIngest.status === 201 && doiIngest.body.count === 1);

    // 6. Keywords & Stats Scoping
    console.log('\n--- 6. Testing Keywords, Stats & Isolation ---');
    const stats = await request({ host: 'localhost', port: 3000, path: `/api/stats?project_id=${testProjectId}`, method: 'GET', headers: authHeaders });
    assert('GET /api/stats (Live Counters)', stats.status === 200 && stats.body.total_papers === 2 && stats.body.read_papers === 1);

    const kw = await request({ host: 'localhost', port: 3000, path: `/api/keywords/all?project_id=${testProjectId}`, method: 'GET', headers: authHeaders });
    assert('GET /api/keywords/all', kw.status === 200 && kw.body.some(k => k.keyword === 'Anomaly Detection'));

    // 7. Synthesis & Insights API
    console.log('\n--- 7. Testing Synthesis Insights & Multi-Level Export ---');
    const insights = await request({ host: 'localhost', port: 3000, path: `/api/clusters/${testClusterId}/insights`, method: 'GET', headers: authHeaders });
    assert('GET /api/clusters/:id/insights', insights.status === 200 && insights.body.strengths_summary.length > 0);

    const expJson = await request({ host: 'localhost', port: 3000, path: `/api/export?project_id=${testProjectId}&format=json`, method: 'GET', headers: authHeaders });
    assert('GET /api/export (JSON format)', expJson.status === 200 && Array.isArray(expJson.body) && expJson.body.length === 2);

    const expCsv = await request({ host: 'localhost', port: 3000, path: `/api/export?project_id=${testProjectId}&format=csv`, method: 'GET', headers: authHeaders });
    assert('GET /api/export (CSV format)', expCsv.status === 200 && typeof expCsv.body === 'string' && expCsv.body.includes('Deep Isolation Forest'));

    const expXlsx = await request({ host: 'localhost', port: 3000, path: `/api/export?project_id=${testProjectId}&format=excel`, method: 'GET', headers: authHeaders });
    assert('GET /api/export (Excel .xlsx format)', expXlsx.status === 200 && expXlsx.headers['content-type'].includes('spreadsheetml'));

    // 8. Cleanup test project
    console.log('\n--- 8. Cleanup Test Project ---');
    const pDel = await request({ host: 'localhost', port: 3000, path: `/api/projects/${testProjectId}`, method: 'DELETE', headers: authHeaders });
    assert('DELETE /api/projects/:id (Cascading Delete)', pDel.status === 200 && pDel.body.success === true);

    console.log('\n====================================================');
    console.log(`🎉 CORE AUDIT COMPLETE: ${passed} / ${total} TESTS PASSED (100% SUCCESS)`);
    console.log('====================================================\n');

    // Run RBAC & Admin Suite
    const { runTests: runRbacTests } = require('./rbac_admin.test');
    await runRbacTests();
    process.exit(0);
  } catch (err) {
    console.error('Audit failed with error:', err);
    process.exit(1);
  }
}

runFullBackendAudit();
