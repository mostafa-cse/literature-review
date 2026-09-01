/**
 * ==============================================================================
 * LITSPHERE WORKSPACE RBAC & ROLES TEST SUITE
 * ==============================================================================
 * Comprehensive test coverage for all 4 project roles in the Survey Workspace:
 * 1. Owner: Full project control & team management
 * 2. Editor: Add/edit papers, matrix cells & taxonomy (no project delete, no team management)
 * 3. Reviewer: PRISMA blind screening, notes & review annotations (no edit buttons / permissions)
 * 4. Viewer: Read-only inspection & data export (no edit buttons / permissions)
 * ==============================================================================
 */

const http = require('http');
const app = require('../server');

let server;
let port;
let baseUrl;

// Tokens for all 4 accounts under test
let ownerToken = '';
let editorToken = '';
let reviewerToken = '';
let viewerToken = '';

let testProjectId = null;
let testClusterId = null;
let testColumnId = null;
let testPaperId = null;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (options.body) {
      const payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqOptions.headers['Content-Type']) {
        req.setHeader('Content-Type', 'application/json');
      }
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }

    req.end();
  });
}

async function runWorkspaceRolesSuite() {
  console.log('\n======================================================================');
  console.log('🧪 WORKSPACE RBAC SUITE: ALL 4 ROLES LOGIC & PERMISSION VERIFICATION');
  console.log('======================================================================');

  // Start temporary server
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  try {
    // --- 1. Authentication for All 4 Roles ---
    console.log('\n--- 1. Authenticate All 4 Workspace Test Roles ---');
    const authUsers = [
      { email: 'own_user@mail.com', pass: 'password123', roleName: 'owner', name: 'Owner User' },
      { email: 'edit_user@mail.com', pass: 'password123', roleName: 'editor', name: 'Editor User' },
      { email: 'review_user@mail.com', pass: 'password123', roleName: 'reviewer', name: 'Reviewer User' },
      { email: 'view_user@mail.com', pass: 'password123', roleName: 'viewer', name: 'Viewer User' },
    ];

    for (const u of authUsers) {
      let res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: u.email, password: u.pass }
      });
      if (res.status !== 200) {
        // Register if not existing
        res = await request('/api/auth/register', {
          method: 'POST',
          body: { name: u.name, username: u.email.split('@')[0], email: u.email, password: u.pass }
        });
      }
      assert(res.status === 200, `Authenticated as ${u.roleName.toUpperCase()} (${u.email})`);
      if (u.roleName === 'owner') ownerToken = res.body.token;
      if (u.roleName === 'editor') editorToken = res.body.token;
      if (u.roleName === 'reviewer') reviewerToken = res.body.token;
      if (u.roleName === 'viewer') viewerToken = res.body.token;
    }

    // --- 2. Project Setup by Owner ---
    console.log('\n--- 2. Project Hierarchy Setup & Team Role Assignment ---');
    const createProjRes = await request('/api/projects', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { name: 'Workspace RBAC Matrix Survey', description: 'Testing workspace permissions across all 4 roles' }
    });
    assert(createProjRes.status === 201, 'Owner created survey project');
    testProjectId = createProjRes.body.id || createProjRes.body.project?.id;

    // Add Editor, Reviewer, Viewer to Project
    const invEditorRes = await request(`/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { email: 'edit_user@mail.com', role: 'editor' }
    });
    assert(invEditorRes.status === 200 || invEditorRes.status === 201, 'Owner assigned Editor role to edit_user@mail.com');

    const invReviewerRes = await request(`/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { email: 'review_user@mail.com', role: 'reviewer' }
    });
    assert(invReviewerRes.status === 200 || invReviewerRes.status === 201, 'Owner assigned Reviewer role to review_user@mail.com');

    const invViewerRes = await request(`/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { email: 'view_user@mail.com', role: 'viewer' }
    });
    assert(invViewerRes.status === 200 || invViewerRes.status === 201, 'Owner assigned Viewer role to view_user@mail.com');

    // Verify /api/projects/:id/my-role for all 4 roles
    const ownerRoleRes = await request(`/api/projects/${testProjectId}/my-role`, {
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(ownerRoleRes.body.role === 'owner', 'Owner role correctly resolved as "owner"');

    const editorRoleRes = await request(`/api/projects/${testProjectId}/my-role`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    });
    assert(editorRoleRes.body.role === 'editor', 'Editor role correctly resolved as "editor"');

    const reviewerRoleRes = await request(`/api/projects/${testProjectId}/my-role`, {
      headers: { 'Authorization': `Bearer ${reviewerToken}` }
    });
    assert(reviewerRoleRes.body.role === 'reviewer', 'Reviewer role correctly resolved as "reviewer"');

    const viewerRoleRes = await request(`/api/projects/${testProjectId}/my-role`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerRoleRes.body.role === 'viewer', 'Viewer role correctly resolved as "viewer"');

    // --- 3. Role 1: Owner Permissions (Full Project Control & Team Management) ---
    console.log('\n--- 3. Role 1: Owner (Full Project Control & Team Management) ---');
    // Owner creates cluster
    const clusterRes = await request('/api/clusters', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { project_id: testProjectId, name: 'Owner Created Cluster', color: '#d4af37' }
    });
    assert(clusterRes.status === 201, 'Owner can create taxonomy cluster');
    testClusterId = clusterRes.body.id || clusterRes.body.cluster?.id;

    // Owner creates dynamic column
    const colRes = await request('/api/dynamic-columns', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { project_id: testProjectId, column_name: 'Dataset_Split', col_type: 'text' }
    });
    assert(colRes.status === 201, 'Owner can create dynamic columns');
    testColumnId = colRes.body.id || colRes.body.column?.id;

    // Owner adds paper
    const paperRes = await request('/api/papers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { project_id: testProjectId, cluster_id: testClusterId, title: 'Attention Is All You Need', year: 2017 }
    });
    assert(paperRes.status === 201, 'Owner can add papers to workspace');
    testPaperId = paperRes.body.id || paperRes.body.paper?.id;

    // Owner edits matrix cell
    const cellRes = await request('/api/paper-column-values', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { paper_id: testPaperId, column_id: testColumnId, value: 'WMT 2014 En-De: 28.4 BLEU' }
    });
    assert(cellRes.status === 200, 'Owner can write matrix cell values');

    // Owner updates collaborator role
    const updateRoleRes = await request(`/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      body: { email: 'edit_user@mail.com', role: 'editor' }
    });
    assert(updateRoleRes.status === 200 || updateRoleRes.status === 201, 'Owner can manage team collaborator roles');

    // --- 4. Role 2: Editor Permissions (Add/Edit Papers, Cells & Taxonomy, No Project Delete) ---
    console.log('\n--- 4. Role 2: Editor (Add/Edit Papers, Matrix Cells & Taxonomy) ---');
    // Editor creates taxonomy cluster
    const editorClusterRes = await request('/api/clusters', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { project_id: testProjectId, name: 'Editor Created Cluster', color: '#38bdf8' }
    });
    assert(editorClusterRes.status === 201, 'Editor can create taxonomy clusters');

    // Editor creates dynamic column
    const editorColRes = await request('/api/dynamic-columns', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { project_id: testProjectId, column_name: 'F1_Accuracy', col_type: 'number' }
    });
    assert(editorColRes.status === 201, 'Editor can create dynamic columns');

    // Editor adds paper
    const editorPaperRes = await request('/api/papers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { project_id: testProjectId, cluster_id: testClusterId, title: 'BERT Pre-training Paper', year: 2018 }
    });
    assert(editorPaperRes.status === 201, 'Editor can add papers to workspace');

    // Editor updates paper metadata & reading status
    const updatePaperRes = await request(`/api/papers/${testPaperId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { status: 'in_progress', intuition: 'Transformer self-attention architecture' }
    });
    assert(updatePaperRes.status === 200, 'Editor can edit paper metadata and intuition');

    // Editor writes matrix cell
    const editorCellRes = await request('/api/paper-column-values', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { paper_id: testPaperId, column_id: testColumnId, value: 'Updated by Editor: 29.1 BLEU' }
    });
    assert(editorCellRes.status === 200, 'Editor can edit matrix cells');

    // Editor exports master matrix (Allowed)
    const editorExportRes = await request(`/api/export?project_id=${testProjectId}&format=json`, {
      headers: { 'Authorization': `Bearer ${editorToken}` }
    });
    assert(editorExportRes.status === 200, 'Editor can export master matrix data');

    // Editor restriction: Cannot delete survey project
    const editorDeleteProjRes = await request(`/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${editorToken}` }
    });
    assert(editorDeleteProjRes.status === 403, 'Editor strictly blocked from deleting project (HTTP 403)');

    // Editor restriction: Cannot add/modify team members
    const editorTeamRes = await request(`/api/projects/${testProjectId}/members`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${editorToken}` },
      body: { email: 'random@mail.com', role: 'viewer' }
    });
    assert(editorTeamRes.status === 403, 'Editor strictly blocked from team management (HTTP 403)');

    // --- 5. Role 3: Reviewer Permissions (PRISMA Screening, Notes & Review, No Edits) ---
    console.log('\n--- 5. Role 3: Reviewer (PRISMA Screening, Notes & Review) ---');
    // Reviewer submits PRISMA blind screening vote
    const reviewerScreenRes = await request(`/api/papers/${testPaperId}/screening`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { vote: 'included', reason: 'High algorithmic relevance to benchmark' }
    });
    assert(reviewerScreenRes.status === 200, 'Reviewer can submit blind PRISMA screening vote');

    // Reviewer posts paper review comment with quote
    const reviewerCommentRes = await request(`/api/papers/${testPaperId}/comments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { comment_text: 'Rigorous empirical evaluation section.', selected_quote: 'Self-attention mechanism replaces recurrent layers.' }
    });
    assert(reviewerCommentRes.status === 201, 'Reviewer can post review comments & quote annotations');
    const commentId = reviewerCommentRes.body.id || reviewerCommentRes.body.comment?.id;

    // Reviewer deletes own comment
    const reviewerDelCommentRes = await request(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${reviewerToken}` }
    });
    assert(reviewerDelCommentRes.status === 200, 'Reviewer can delete their own review comment');

    // Reviewer restriction: Cannot edit matrix cells
    const reviewerCellRes = await request('/api/paper-column-values', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { paper_id: testPaperId, column_id: testColumnId, value: 'Unauthorized Reviewer Edit' }
    });
    assert(reviewerCellRes.status === 403, 'Reviewer strictly blocked from editing matrix cells (HTTP 403)');

    // Reviewer restriction: Cannot add papers
    const reviewerPaperRes = await request('/api/papers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { project_id: testProjectId, title: 'Unauthorized Paper by Reviewer' }
    });
    assert(reviewerPaperRes.status === 403, 'Reviewer strictly blocked from adding papers (HTTP 403)');

    // Reviewer restriction: Cannot create dynamic columns
    const reviewerColRes = await request('/api/dynamic-columns', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { project_id: testProjectId, column_name: 'Reviewer_Col' }
    });
    assert(reviewerColRes.status === 403, 'Reviewer strictly blocked from adding dynamic columns (HTTP 403)');

    // Reviewer restriction: Cannot create clusters
    const reviewerClusterRes = await request('/api/clusters', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${reviewerToken}` },
      body: { project_id: testProjectId, name: 'Reviewer Cluster' }
    });
    assert(reviewerClusterRes.status === 403, 'Reviewer strictly blocked from creating clusters (HTTP 403)');

    // --- 6. Role 4: Viewer Permissions (Read-Only Inspection & Data Export) ---
    console.log('\n--- 6. Role 4: Viewer (Read-Only Inspection & Data Export) ---');
    // Viewer reads papers list
    const viewerGetPapersRes = await request(`/api/papers?project_id=${testProjectId}`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerGetPapersRes.status === 200, 'Viewer can inspect papers list');

    // Viewer reads taxonomy clusters
    const viewerGetClustersRes = await request(`/api/clusters?project_id=${testProjectId}`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerGetClustersRes.status === 200, 'Viewer can inspect taxonomy clusters');

    // Viewer reads dynamic columns
    const viewerGetColsRes = await request(`/api/dynamic-columns?project_id=${testProjectId}`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerGetColsRes.status === 200, 'Viewer can inspect dynamic columns');

    // Viewer exports master matrix data (Allowed)
    const viewerExportRes = await request(`/api/export?project_id=${testProjectId}&format=csv`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerExportRes.status === 200, 'Viewer can export master matrix data in CSV');

    // Viewer restriction: Cannot edit matrix cells
    const viewerCellRes = await request('/api/paper-column-values', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${viewerToken}` },
      body: { paper_id: testPaperId, column_id: testColumnId, value: 'Unauthorized Viewer Edit' }
    });
    assert(viewerCellRes.status === 403, 'Viewer strictly blocked from editing matrix cells (HTTP 403)');

    // Viewer restriction: Cannot submit screening vote
    const viewerScreenRes = await request(`/api/papers/${testPaperId}/screening`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${viewerToken}` },
      body: { vote: 'included', reason: 'Viewer attempting vote' }
    });
    assert(viewerScreenRes.status === 403, 'Viewer strictly blocked from PRISMA screening voting (HTTP 403)');

    // Viewer restriction: Cannot post comments
    const viewerCommentRes = await request(`/api/papers/${testPaperId}/comments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${viewerToken}` },
      body: { comment_text: 'Viewer attempting comment' }
    });
    assert(viewerCommentRes.status === 403, 'Viewer strictly blocked from adding comments (HTTP 403)');

    // Viewer restriction: Cannot delete survey project
    const viewerDeleteProjRes = await request(`/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerDeleteProjRes.status === 403, 'Viewer strictly blocked from deleting survey project (HTTP 403)');

    // --- 7. Supervisor & Public Share Link Lifecycle Verification ---
    console.log('\n--- 7. Supervisor & Public Share Link Lifecycle ---');
    // Owner checks share link status
    const initialShareStatus = await request(`/api/projects/${testProjectId}/share`, {
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(initialShareStatus.status === 200, 'Owner can query share link status');

    // Owner generates/enables public share link
    const enableShareRes = await request(`/api/projects/${testProjectId}/share`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(enableShareRes.status === 200 && enableShareRes.body.share_token, 'Owner can activate public supervisor share link');
    const shareToken = enableShareRes.body.share_token;

    // Public visitor inspects live read-only preview without auth token
    const publicSharedRes = await request(`/api/public/shared/${shareToken}`);
    assert(publicSharedRes.status === 200 && publicSharedRes.body.read_only === true, 'Public visitor can inspect shared survey review without login');
    assert(Array.isArray(publicSharedRes.body.papers), 'Public shared survey returns paper corpus with metadata');

    // Owner disables/revokes public share link
    const disableShareRes = await request(`/api/projects/${testProjectId}/share`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(disableShareRes.status === 200, 'Owner can disable/revoke public share link');

    // Public visitor tries accessing disabled share link (Returns HTTP 404)
    const disabledSharedRes = await request(`/api/public/shared/${shareToken}`);
    assert(disabledSharedRes.status === 404, 'Disabled share link immediately returns HTTP 404 Not Found to visitors');

    // Viewer restriction: Viewer cannot manage share links
    const viewerShareRes = await request(`/api/projects/${testProjectId}/share`, {
      headers: { 'Authorization': `Bearer ${viewerToken}` }
    });
    assert(viewerShareRes.status === 403, 'Viewer strictly blocked from share link management (HTTP 403)');

    // --- 8. Cascading Cleanup by Owner ---
    console.log('\n--- 8. Cascading Cleanup ---');
    const finalDelRes = await request(`/api/projects/${testProjectId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    assert(finalDelRes.status === 200, 'Owner deleted test survey project cleanly with cascading cleanup');

    console.log('\n======================================================================');
    console.log(`🎉 WORKSPACE RBAC TEST SUITE PASSED (${testsPassed} / ${testsPassed} Tests Passed)`);
    console.log('======================================================================\n');
  } finally {
    if (server) server.close();
  }
}

if (require.main === module) {
  runWorkspaceRolesSuite().catch((err) => {
    console.error('\n❌ WORKSPACE RBAC SUITE FAILED:', err);
    process.exit(1);
  });
}

module.exports = runWorkspaceRolesSuite;
