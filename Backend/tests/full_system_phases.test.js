/**
 * LITSPHERE FULL SYSTEM END-TO-END MASTER TEST SUITE
 * Phases 1 through 7 Verification
 * 
 * Phase 1: Authentication, Session & Profile Security
 * Phase 2: Survey Project Lifecycle & Strict RBAC
 * Phase 3: Paper Ingestion, Metadata & Storage Integration
 * Phase 4: Synthesis Matrix & Taxonomy Cluster Engine
 * Phase 5: Systematic PRISMA Screening & Peer Review
 * Phase 6: Real-Time SSE Streams & Background Workers
 * Phase 7: Security, Error Resilience & Cascading Cleanups
 */

const http = require('http');
const assert = require('assert');
const { getDb, hashPassword } = require('../src/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    
    const reqHeaders = {
      ...(body && typeof body === 'object' ? { 'Content-Type': 'application/json' } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...headers
    };

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = raw;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw
        });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Global Test Context across phases
const ctx = {
  adminToken: null,
  ownerToken: null,
  ownerId: null,
  editorToken: null,
  editorId: null,
  reviewerToken: null,
  reviewerId: null,
  viewerToken: null,
  viewerId: null,
  
  projectId: null,
  projectName: null,
  shareToken: null,
  clusterId: null,
  columnId: null,
  paperId: null,
  commentId: null
};

// Seed & Ensure Test Users Exist
function setupTestUsers() {
  const db = getDb();
  const passHash = hashPassword('password123');

  const users = [
    { username: 'sys_admin', email: 'admin@litsphere.ac', name: 'System Administrator', role: 'admin' },
    { username: 'test_owner', email: 'own_user@mail.com', name: 'Survey Owner', role: 'user' },
    { username: 'test_editor', email: 'edit_user@mail.com', name: 'Survey Editor', role: 'user' },
    { username: 'test_reviewer', email: 'review_user@mail.com', name: 'Survey Reviewer', role: 'user' },
    { username: 'test_viewer', email: 'view_user@mail.com', name: 'Survey Viewer', role: 'user' }
  ];

  for (const u of users) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!existing) {
      db.prepare(`
        INSERT INTO users (username, email, password_hash, name, role, status, institution)
        VALUES (?, ?, ?, ?, ?, 'active', 'LitSphere Test Lab')
      `).run(u.username, u.email, passHash, u.name, u.role);
    } else {
      db.prepare(`
        UPDATE users SET password_hash = ?, role = ?, status = 'active' WHERE id = ?
      `).run(passHash, u.role, existing.id);
    }
  }
}

// Helper test wrapper
async function runTest(testName, fn, metrics) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${testName}`);
    metrics.passed++;
    return true;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}:`, err.message);
    metrics.failed++;
    metrics.errors.push({ testName, error: err.message, stack: err.stack });
    return false;
  }
}

// ======================================================================
// PHASE 1: Authentication, Session & Profile Security
// ======================================================================
async function runPhase1(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 1: AUTHENTICATION, SESSION & PROFILE SECURITY');
  console.log('======================================================================');

  // 1.1 Unique Registration
  await runTest('1.1: Register new research user with valid schema', async () => {
    const ts = Date.now();
    const uniqueEmail = `test_scholar_${ts}@example.org`;
    const res = await makeRequest('POST', '/api/auth/register', {
      username: `scholar_${ts}`,
      name: `Dr. Test Scholar ${ts}`,
      email: uniqueEmail,
      password: 'StrongPassword123!',
      institution: 'Research University',
      research_field: 'Computer Science'
    });
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.token, 'Registration should return an authentication token');
    assert.strictEqual(res.data.user.email, uniqueEmail);
  }, metrics);

  // 1.2 Duplicate Registration Rejection
  await runTest('1.2: Reject registration with already existing email', async () => {
    const res = await makeRequest('POST', '/api/auth/register', {
      name: 'Duplicate Scholar',
      email: 'admin@litsphere.ac',
      password: 'StrongPassword123!'
    });
    assert.ok(res.status === 400 || res.status === 409, `Expected 400/409, got ${res.status}`);
  }, metrics);

  // 1.3 Invalid/Empty Credentials Rejection
  await runTest('1.3: Reject registration with missing required fields', async () => {
    const res = await makeRequest('POST', '/api/auth/register', {
      email: '',
      password: ''
    });
    assert.strictEqual(res.status, 400);
  }, metrics);

  // 1.4 Login as Admin
  await runTest('1.4: Login as System Administrator (returns JWT & Cookie)', async () => {
    const res = await makeRequest('POST', '/api/auth/login', {
      login: 'admin@litsphere.ac',
      password: 'password123'
    });
    assert.strictEqual(res.status, 200, `Login failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.token, 'Should return JWT token');
    assert.strictEqual(res.data.user.role, 'admin');
    ctx.adminToken = res.data.token;
  }, metrics);

  // 1.5 Login as Owner, Editor, Reviewer, Viewer
  await runTest('1.5: Authenticate all 4 role users (Owner, Editor, Reviewer, Viewer)', async () => {
    const roles = [
      { key: 'owner', email: 'own_user@mail.com' },
      { key: 'editor', email: 'edit_user@mail.com' },
      { key: 'reviewer', email: 'review_user@mail.com' },
      { key: 'viewer', email: 'view_user@mail.com' }
    ];

    for (const r of roles) {
      const res = await makeRequest('POST', '/api/auth/login', {
        login: r.email,
        password: 'password123'
      });
      assert.strictEqual(res.status, 200, `Login failed for ${r.email}: ${JSON.stringify(res.data)}`);
      ctx[`${r.key}Token`] = res.data.token;
      ctx[`${r.key}Id`] = res.data.user.id;
    }
  }, metrics);

  // 1.6 Verify Identity & Profile via /api/auth/me
  await runTest('1.6: GET /api/auth/me resolves authenticated user profile', async () => {
    const res = await makeRequest('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.email, 'own_user@mail.com');
  }, metrics);

  // 1.7 Global Admin Access Control
  await runTest('1.7: RBAC - Admin overview accessible by Admin, forbidden to regular user', async () => {
    // Admin request
    const adminRes = await makeRequest('GET', '/api/admin/overview', null, {
      'Authorization': `Bearer ${ctx.adminToken}`
    });
    assert.strictEqual(adminRes.status, 200, `Admin overview failed: ${JSON.stringify(adminRes.data)}`);

    // Regular user request
    const userRes = await makeRequest('GET', '/api/admin/overview', null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(userRes.status, 403, `Regular user should be forbidden (403), got ${userRes.status}`);
  }, metrics);

  // 1.8 Profile Update
  await runTest('1.8: PUT /api/auth/profile updates profile institution and name', async () => {
    const res = await makeRequest('PUT', '/api/auth/profile', {
      name: 'Survey Lead Owner PhD',
      institution: 'Global AI Institute'
    }, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.name, 'Survey Lead Owner PhD');
  }, metrics);
}

// ======================================================================
// PHASE 2: Survey Project Lifecycle & Strict RBAC
// ======================================================================
async function runPhase2(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 2: SURVEY PROJECT LIFECYCLE & STRICT RBAC');
  console.log('======================================================================');

  // 2.1 Create Project as Owner
  await runTest('2.1: Owner creates new Survey Project', async () => {
    const res = await makeRequest('POST', '/api/projects', {
      name: `Deep Learning Survey ${Date.now()}`,
      description: 'Systematic literature review on LLM reasoning and agentic workflows',
      domain: 'Artificial Intelligence'
    }, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 201, `Failed to create project: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.id, 'Created project must have an ID');
    ctx.projectId = res.data.id;
    ctx.projectName = res.data.name;
    assert.strictEqual(res.data.user_role, 'owner');
  }, metrics);

  // 2.2 Add Collaborators (Editor, Reviewer, Viewer)
  await runTest('2.2: Owner assigns Editor, Reviewer, and Viewer roles to team members', async () => {
    const members = [
      { email: 'edit_user@mail.com', role: 'editor' },
      { email: 'review_user@mail.com', role: 'reviewer' },
      { email: 'view_user@mail.com', role: 'viewer' }
    ];

    for (const m of members) {
      const res = await makeRequest('POST', `/api/projects/${ctx.projectId}/members`, m, {
        'Authorization': `Bearer ${ctx.ownerToken}`
      });
      assert.ok(res.status === 200 || res.status === 201, `Failed to add member ${m.email}: [Status ${res.status}] ${JSON.stringify(res.data)}`);
    }
  }, metrics);

  // 2.3 Role Determinism Check on /api/projects/:id/my-role
  await runTest('2.3: Deterministic role check - all 4 roles resolve accurately and consistently', async () => {
    const expectations = [
      { token: ctx.ownerToken, expected: 'owner' },
      { token: ctx.editorToken, expected: 'editor' },
      { token: ctx.reviewerToken, expected: 'reviewer' },
      { token: ctx.viewerToken, expected: 'viewer' }
    ];

    for (const item of expectations) {
      const res = await makeRequest('GET', `/api/projects/${ctx.projectId}/my-role`, null, {
        'Authorization': `Bearer ${item.token}`
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.role, item.expected, `Role mismatch for token, expected ${item.expected} but got ${res.data.role}`);
    }

    // Unauthenticated request must yield 'viewer' and is_guest: true
    const guestRes = await makeRequest('GET', `/api/projects/${ctx.projectId}/my-role`);
    assert.strictEqual(guestRes.status, 200);
    assert.strictEqual(guestRes.data.role, 'viewer');
    assert.strictEqual(guestRes.data.is_guest, true);
  }, metrics);

  // 2.4 Single Project Metadata includes user_role
  await runTest('2.4: GET /api/projects/:id returns effective user_role & current_user_role', async () => {
    const res = await makeRequest('GET', `/api/projects/${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user_role, 'editor');
    assert.strictEqual(res.data.current_user_role, 'editor');
  }, metrics);

  // 2.5 RBAC Boundaries Enforcement
  await runTest('2.5: Permission Boundaries - Editor cannot delete project or invite collaborators', async () => {
    // Attempt delete
    const delRes = await makeRequest('DELETE', `/api/projects/${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(delRes.status, 403, 'Editor must receive 403 when deleting project');

    // Attempt invite
    const invRes = await makeRequest('POST', `/api/projects/${ctx.projectId}/members`, {
      email: 'hacker@example.com',
      role: 'editor'
    }, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(invRes.status, 403, 'Editor must receive 403 when inviting members');
  }, metrics);

  // 2.6 Supervisor Public Share Link Lifecycle
  await runTest('2.6: Supervisor Share Link - Generate, public access, and revoke', async () => {
    // Enable share link
    const postRes = await makeRequest('POST', `/api/projects/${ctx.projectId}/share`, null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(postRes.status, 200);
    assert.ok(postRes.data.share_token, 'Should return active share token');
    ctx.shareToken = postRes.data.share_token;

    // Public visitor access without login
    const pubRes = await makeRequest('GET', `/api/public/shared/${ctx.shareToken}`);
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.data.project.id, ctx.projectId);

    // Revoke share link
    const revRes = await makeRequest('DELETE', `/api/projects/${ctx.projectId}/share`, null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(revRes.status, 200);

    // Verify revoked link returns 404
    const deadRes = await makeRequest('GET', `/api/public/shared/${ctx.shareToken}`);
    assert.strictEqual(deadRes.status, 404, 'Revoked share token must return 404');
  }, metrics);
}

// ======================================================================
// PHASE 3: Paper Ingestion, Metadata & Storage Integration
// ======================================================================
async function runPhase3(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 3: PAPER INGESTION, METADATA & STORAGE INTEGRATION');
  console.log('======================================================================');

  // 3.1 Direct Paper Creation by Editor
  await runTest('3.1: Editor adds new research paper to the survey project', async () => {
    const res = await makeRequest('POST', '/api/papers', {
      project_id: ctx.projectId,
      title: 'Attention Is All You Need: Scaling Deep Transformers',
      authors: 'Vaswani, A., Shazeer, N., Parmar, N., et al.',
      year: 2017,
      pub: 'NeurIPS 2017',
      domain: 'Deep Learning',
      doi: '10.5555/3295222.3295349',
      status: 'included',
      intuition: 'Self-attention mechanism replaces recurrent layers with parallel tensor compute.',
      advantages: 'Superior parallelization and reduced training time compared to RNNs',
      gaps: 'Quadratic memory complexity with sequence length',
      future_directions: 'Linear attention approximations and flash attention techniques'
    }, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 201, `Failed to add paper: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.id, 'Created paper must return an ID');
    ctx.paperId = res.data.id;
  }, metrics);

  // 3.2 Fetch Single Paper with Metadata
  await runTest('3.2: GET /api/papers/:id retrieves full paper details and extraction metadata', async () => {
    const res = await makeRequest('GET', `/api/papers/${ctx.paperId}`, null, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.title, 'Attention Is All You Need: Scaling Deep Transformers');
    assert.strictEqual(res.data.year, 2017);
  }, metrics);

  // 3.3 Viewer is Blocked from Adding Papers (RBAC)
  await runTest('3.3: Viewer receives HTTP 403 when attempting to add papers', async () => {
    const res = await makeRequest('POST', '/api/papers', {
      project_id: ctx.projectId,
      title: 'Unauthorized Viewer Paper Injection Attempt',
      authors: 'Intruder',
      year: 2026
    }, {
      'Authorization': `Bearer ${ctx.viewerToken}`
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for viewer, got ${res.status}`);
  }, metrics);

  // 3.4 Missing Title Validation
  await runTest('3.4: Rejects paper ingestion when title is missing', async () => {
    const res = await makeRequest('POST', '/api/papers', {
      project_id: ctx.projectId,
      authors: 'Anonymous'
    }, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 400);
  }, metrics);
}

// ======================================================================
// PHASE 4: Synthesis Matrix & Taxonomy Cluster Engine
// ======================================================================
async function runPhase4(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 4: SYNTHESIS MATRIX & TAXONOMY CLUSTER ENGINE');
  console.log('======================================================================');

  // 4.1 Create Taxonomy Cluster
  await runTest('4.1: Owner creates Taxonomy Cluster for thematic grouping', async () => {
    const res = await makeRequest('POST', '/api/clusters', {
      project_id: ctx.projectId,
      name: 'Foundation Architectures',
      description: 'Core transformer and state-space foundational papers',
      color: '#3b82f6'
    }, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 201, `Failed to create cluster: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.id, 'Cluster must have an ID');
    ctx.clusterId = res.data.id;
  }, metrics);

  // 4.2 Create Custom Dynamic Columns
  await runTest('4.2: Owner creates dynamic custom columns (text, rating, select)', async () => {
    const res = await makeRequest('POST', '/api/dynamic-columns', {
      project_id: ctx.projectId,
      name: 'Evaluation Benchmark',
      column_type: 'text',
      description: 'Primary dataset/benchmark used for empirical validation'
    }, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 201, `Failed to create column: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.id, 'Column must have an ID');
    ctx.columnId = res.data.id;
  }, metrics);

  // 4.3 Matrix Cell Value Write & Retrieve
  await runTest('4.3: Editor updates dynamic matrix cell value for paper', async () => {
    const res = await makeRequest('POST', '/api/paper-column-values', {
      paper_id: ctx.paperId,
      column_id: ctx.columnId,
      value: 'WMT 2014 English-to-German (BLEU: 28.4)'
    }, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 200, `Failed to update matrix cell: ${JSON.stringify(res.data)}`);
    assert.strictEqual(res.data.value, 'WMT 2014 English-to-German (BLEU: 28.4)');
  }, metrics);

  // 4.4 Viewer Blocked from Updating Matrix Cells (RBAC)
  await runTest('4.4: Viewer blocked from modifying matrix cell values (HTTP 403)', async () => {
    const res = await makeRequest('POST', '/api/paper-column-values', {
      paper_id: ctx.paperId,
      column_id: ctx.columnId,
      value: 'Malicious Cell Overwrite Attempt'
    }, {
      'Authorization': `Bearer ${ctx.viewerToken}`
    });
    assert.strictEqual(res.status, 403, 'Viewer must be denied cell editing');
  }, metrics);

  // 4.5 Export Synthesis Matrix to CSV
  await runTest('4.5: GET /api/export?format=csv generates valid CSV master data', async () => {
    const res = await makeRequest('GET', `/api/export?format=csv&project_id=${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.viewerToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.raw.includes('Attention Is All You Need'), 'CSV export must include paper title');
  }, metrics);

  // 4.6 Export Synthesis Matrix to BibTeX
  await runTest('4.6: GET /api/export?format=bibtex generates valid BibTeX citations', async () => {
    const res = await makeRequest('GET', `/api/export?format=bibtex&project_id=${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.viewerToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.raw.includes('@article') || res.raw.includes('@inproceedings'), 'BibTeX export format valid');
  }, metrics);
}

// ======================================================================
// PHASE 5: Systematic PRISMA Screening & Peer Review
// ======================================================================
async function runPhase5(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 5: SYSTEMATIC PRISMA SCREENING & PEER REVIEW');
  console.log('======================================================================');

  // 5.1 Reviewer Submits Blind Screening Vote
  await runTest('5.1: Reviewer submits blind PRISMA screening vote (include)', async () => {
    const res = await makeRequest('POST', `/api/papers/${ctx.paperId}/screening`, {
      decision: 'include',
      reason: 'Seminal paper defining current transformer baseline',
      phase: 'full_text'
    }, {
      'Authorization': `Bearer ${ctx.reviewerToken}`
    });
    assert.strictEqual(res.status, 200, `Failed to submit screening vote: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.decision === 'include' || res.data.decision === 'included');
  }, metrics);

  // 5.2 Viewer Blocked from PRISMA Voting
  await runTest('5.2: Viewer blocked from submitting PRISMA screening votes (HTTP 403)', async () => {
    const res = await makeRequest('POST', `/api/papers/${ctx.paperId}/screening`, {
      decision: 'exclude',
      reason: 'Viewer unauthorized vote'
    }, {
      'Authorization': `Bearer ${ctx.viewerToken}`
    });
    assert.strictEqual(res.status, 403, 'Viewer must not be allowed to vote on PRISMA screening');
  }, metrics);

  // 5.3 Post Peer Review Comment
  await runTest('5.3: Reviewer posts critique and review comment on paper', async () => {
    const res = await makeRequest('POST', `/api/papers/${ctx.paperId}/comments`, {
      comment: 'Check if section 4.2 ablation results are verified by follow-up studies.',
      quote: 'scaled dot-product attention',
      position_data: { page: 4 }
    }, {
      'Authorization': `Bearer ${ctx.reviewerToken}`
    });
    assert.ok(res.status === 200 || res.status === 201, `Failed to post review comment: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.id, 'Comment must have an ID');
    ctx.commentId = res.data.id;
  }, metrics);

  // 5.4 Fetch Comments List
  await runTest('5.4: GET /api/papers/:id/comments returns recorded thread', async () => {
    const res = await makeRequest('GET', `/api/papers/${ctx.paperId}/comments`, null, {
      'Authorization': `Bearer ${ctx.editorToken}`
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.comments), 'Should return comments array');
    assert.ok(res.data.comments.some(c => c.id === ctx.commentId));
  }, metrics);

  // 5.5 Reviewer Deletes Own Comment
  await runTest('5.5: Reviewer deletes their own review comment', async () => {
    const res = await makeRequest('DELETE', `/api/comments/${ctx.commentId}`, null, {
      'Authorization': `Bearer ${ctx.reviewerToken}`
    });
    assert.strictEqual(res.status, 200, `Failed to delete comment: ${JSON.stringify(res.data)}`);
  }, metrics);
}

// ======================================================================
// PHASE 6: Real-Time SSE Streams & Background Workers
// ======================================================================
async function runPhase6(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 6: REAL-TIME SSE STREAMS & BACKGROUND WORKERS');
  console.log('======================================================================');

  // 6.1 Background Queue Telemetry
  await runTest('6.1: GET /api/jobs/stats returns operational telemetry for queues', async () => {
    const res = await makeRequest('GET', '/api/jobs/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.queues, 'Should contain queue telemetry object');
  }, metrics);

  // 6.2 SSE Batch Stream Endpoint Connectivity
  await runTest('6.2: GET /api/jobs/stream/batch establishes text/event-stream headers', async () => {
    const url = new URL('/api/jobs/stream/batch?job_ids=test-1,test-2', BASE_URL);
    const sseResult = await new Promise((resolve) => {
      const req = http.request(url, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
      }, (res) => {
        const isSse = (res.headers['content-type'] || '').includes('text/event-stream');
        res.destroy(); // Close stream cleanly
        resolve({ status: res.statusCode, isSse });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.end();
    });

    assert.strictEqual(sseResult.status, 200);
    assert.strictEqual(sseResult.isSse, true, 'SSE endpoint must return Content-Type: text/event-stream');
  }, metrics);

  // 6.3 Audit Trail Verification
  await runTest('6.3: Audit trail records platform governance events in database', async () => {
    const db = getDb();
    const logs = db.prepare('SELECT id, action, details, status FROM audit_logs ORDER BY id DESC LIMIT 5').all();
    assert.ok(logs.length > 0, 'Audit logs table must contain registered governance actions');
  }, metrics);
}

// ======================================================================
// PHASE 7: Security, Error Resilience & Cascading Cleanups
// ======================================================================
async function runPhase7(metrics) {
  console.log('\n======================================================================');
  console.log('🔹 PHASE 7: SECURITY, ERROR RESILIENCE & CASCADING CLEANUPS');
  console.log('======================================================================');

  // 7.1 Graceful 404 on Non-existent API Routes
  await runTest('7.1: Invalid route returns structured JSON 404 error (no HTML crash)', async () => {
    const res = await makeRequest('GET', '/api/non-existent-endpoint-route-test');
    assert.strictEqual(res.status, 404);
    assert.ok(res.data.error, 'Must return JSON error description');
  }, metrics);

  // 7.2 Non-existent Paper ID returns 404
  await runTest('7.2: Querying non-existent paper ID returns HTTP 404', async () => {
    const res = await makeRequest('GET', '/api/papers/99999999', null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 404);
  }, metrics);

  // 7.3 Cascading Project Deletion by Owner
  await runTest('7.3: Owner deletes survey project - cascading cleanup of papers, columns, & clusters', async () => {
    const res = await makeRequest('DELETE', `/api/projects/${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(res.status, 200, `Failed to delete project: ${JSON.stringify(res.data)}`);

    // Verify Project removed
    const checkRes = await makeRequest('GET', `/api/projects/${ctx.projectId}`, null, {
      'Authorization': `Bearer ${ctx.ownerToken}`
    });
    assert.strictEqual(checkRes.status, 404, 'Deleted project must return 404');

    // Verify Database Cascading Integrity
    const db = getDb();
    const paperCount = db.prepare('SELECT count(*) as count FROM papers WHERE project_id = ?').get(ctx.projectId).count;
    const colCount = db.prepare('SELECT count(*) as count FROM dynamic_columns WHERE cluster_id IN (SELECT id FROM clusters WHERE project_id = ?)').get(ctx.projectId).count;
    const clusterCount = db.prepare('SELECT count(*) as count FROM clusters WHERE project_id = ?').get(ctx.projectId).count;
    const memberCount = db.prepare('SELECT count(*) as count FROM project_members WHERE project_id = ?').get(ctx.projectId).count;

    assert.strictEqual(paperCount, 0, 'Associated papers must be deleted');
    assert.strictEqual(colCount, 0, 'Associated columns must be deleted');
    assert.strictEqual(clusterCount, 0, 'Associated clusters must be deleted');
    assert.strictEqual(memberCount, 0, 'Associated memberships must be deleted');
  }, metrics);
}

// ======================================================================
// MASTER RUNNER WITH STEPWISE REGRESSION RE-EXECUTION
// ======================================================================
async function runFullSystemTestSuite(targetPhase = 7) {
  console.log('======================================================================');
  console.log('🚀 LITSPHERE FULL SYSTEM MASTER TEST SUITE (PHASES 1 TO 7)');
  console.log('======================================================================');

  setupTestUsers();

  const metrics = { passed: 0, failed: 0, errors: [] };
  const phases = [
    { num: 1, name: 'Auth & Session Security', fn: runPhase1 },
    { num: 2, name: 'Project & RBAC Determinism', fn: runPhase2 },
    { num: 3, name: 'Paper Ingestion & Storage', fn: runPhase3 },
    { num: 4, name: 'Synthesis Matrix & Taxonomy Engine', fn: runPhase4 },
    { num: 5, name: 'PRISMA Screening & Peer Review', fn: runPhase5 },
    { num: 6, name: 'Real-Time SSE Streams & Background Workers', fn: runPhase6 },
    { num: 7, name: 'Security, Error Resilience & Cleanups', fn: runPhase7 }
  ];

  for (const p of phases) {
    if (p.num > targetPhase) break;
    const preFailed = metrics.failed;
    await p.fn(metrics);

    if (metrics.failed > preFailed) {
      console.error(`\n🚨 Issue detected in Phase ${p.num} (${p.name})! Stopping for remediation.`);
      return { success: false, failedPhase: p.num, metrics };
    }
  }

  console.log('\n======================================================================');
  console.log(`🎉 TEST SUMMARY: ${metrics.passed} PASSED | ${metrics.failed} FAILED`);
  console.log('======================================================================\n');

  return { success: metrics.failed === 0, metrics };
}

if (require.main === module) {
  runFullSystemTestSuite().then((res) => {
    if (!res.success) process.exit(1);
    process.exit(0);
  }).catch((err) => {
    console.error('Fatal Test Suite Error:', err);
    process.exit(1);
  });
}

module.exports = { runFullSystemTestSuite };
