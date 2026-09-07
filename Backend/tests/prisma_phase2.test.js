/**
 * PHASE 2 PRISMA ORM & RELATIONAL MODELING TEST SUITE
 * Validates:
 * 1. Prisma client connection & health check
 * 2. User creation & identity models
 * 3. Project / Survey ownership & ProjectMember RBAC relation
 * 4. Taxonomy clusters & nested dynamic columns
 * 5. Paper insertion with academic synthesis fields
 * 6. Multi-level dynamic column value extraction
 * 7. Paper annotations, highlights, comments, and PRISMA screening
 * 8. Cascading deletion foreign key protection
 */

const assert = require('assert');
const { prisma, checkPrismaHealth, closePrisma } = require('../src/config/prisma');

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PHASE 2 PRISMA ORM & RELATIONAL TESTS');
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

  // 1. Prisma Client Connectivity
  console.log('--- 1. Prisma Client Connection ---');
  await test('Prisma Client executes live query via checkPrismaHealth', async () => {
    const health = await checkPrismaHealth();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.connected, true);
    assert.ok(typeof health.latencyMs === 'number');
  });

  // Unique email and suffix for test isolation
  const suffix = Date.now();
  let testUser = null;
  let testProject = null;
  let testCluster = null;
  let testColParent = null;
  let testColChild = null;
  let testPaper = null;

  // 2. User Model & Authentication Fields
  console.log('\n--- 2. User & Identity Modeling ---');
  await test('Create User with academic role, status, and quotas', async () => {
    testUser = await prisma.user.create({
      data: {
        name: 'Prof. Ada Lovelace',
        username: `ada_lovelace_${suffix}`,
        email: `ada_${suffix}@oxford.ac.uk`,
        passwordHash: 'salt123:hash456',
        role: 'USER',
        institution: 'University of Oxford',
        status: 'ACTIVE',
        orcid: '0000-0002-1825-0097',
        aiTokenQuota: 150000,
        storageQuotaMb: 1000,
      },
    });

    assert.ok(testUser.id);
    assert.strictEqual(testUser.role, 'USER');
    assert.strictEqual(testUser.institution, 'University of Oxford');
    assert.strictEqual(testUser.storageQuotaMb, 1000);
  });

  // 3. Project & RBAC Membership Relations
  console.log('\n--- 3. Project & Collaboration RBAC ---');
  await test('Create Project owned by User and add ProjectMember', async () => {
    testProject = await prisma.project.create({
      data: {
        name: 'Deep Analytical Benchmark Survey',
        description: 'Systematic benchmark of sparse attention mechanisms',
        domain: 'Computer Science',
        isPublic: false,
        shareToken: `token_${suffix}`,
        ownerId: testUser.id,
      },
    });

    assert.ok(testProject.id);
    assert.strictEqual(testProject.ownerId, testUser.id);

    // Create a collaborator member
    const member = await prisma.projectMember.create({
      data: {
        projectId: testProject.id,
        userId: testUser.id,
        role: 'OWNER',
      },
    });

    assert.ok(member.id);
    assert.strictEqual(member.role, 'OWNER');
  });

  // 4. Taxonomy Clusters & Nested Dynamic Columns
  console.log('\n--- 4. Taxonomy & Hierarchical Dynamic Columns ---');
  await test('Create TaxonomyCluster and hierarchical parent-child columns', async () => {
    testCluster = await prisma.taxonomyCluster.create({
      data: {
        projectId: testProject.id,
        name: 'Streaming Architectures',
        description: 'Low-latency attention models',
        color: '#6366f1',
        position: 1,
      },
    });

    assert.ok(testCluster.id);
    assert.strictEqual(testCluster.color, '#6366f1');

    // Parent column
    testColParent = await prisma.dynamicColumn.create({
      data: {
        clusterId: testCluster.id,
        columnName: 'Computational Complexity',
        colType: 'LATEX',
      },
    });

    // Subheader child column
    testColChild = await prisma.dynamicColumn.create({
      data: {
        clusterId: testCluster.id,
        columnName: 'Inference FLOPs',
        parentColumnId: testColParent.id,
        colType: 'TEXT',
      },
    });

    assert.ok(testColParent.id);
    assert.ok(testColChild.id);
    assert.strictEqual(testColChild.parentColumnId, testColParent.id);
  });

  // 5. Paper Entity & Cell Value Extractions
  console.log('\n--- 5. Paper Ingestion & Benchmark Cell Values ---');
  await test('Insert Paper with mathematical intuition and extracted cell values', async () => {
    testPaper = await prisma.paper.create({
      data: {
        projectId: testProject.id,
        clusterId: testCluster.id,
        title: 'Streaming Multilingual Speech-to-Speech Translation',
        authors: 'Kamal, M., et al.',
        year: 2026,
        domain: 'Speech Processing',
        doi: '10.1109/TASLP.2026.3108842',
        status: 'READING',
        equation: '\\mathcal{O}(T \\cdot W \\log W)',
        advantages: 'Reduces chunk latency to sub-200ms',
        screeningDecision: 'INCLUDED',
        screeningReason: 'Full empirical methodology met',
      },
    });

    assert.ok(testPaper.id);
    assert.strictEqual(testPaper.status, 'READING');
    assert.strictEqual(testPaper.screeningDecision, 'INCLUDED');

    // Attach cell value to dynamic column
    const cellVal = await prisma.paperColumnValue.create({
      data: {
        paperId: testPaper.id,
        columnId: testColParent.id,
        value: '\\mathcal{O}(T \\cdot W \\log W)',
      },
    });

    assert.ok(cellVal.id);
    assert.strictEqual(cellVal.value, '\\mathcal{O}(T \\cdot W \\log W)');

    // Attach R2 metadata file
    const pFile = await prisma.paperFile.create({
      data: {
        paperId: testPaper.id,
        filename: 'streaming_speech_2026.pdf',
        mimetype: 'application/pdf',
        fileSize: 2048576,
        r2ObjectKey: `papers/${testPaper.id}/streaming_speech_2026.pdf`,
        r2Bucket: 'litsphere-papers',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    });

    assert.ok(pFile.id);
    assert.strictEqual(pFile.r2Bucket, 'litsphere-papers');
  });

  // 6. Annotations, Comments & Screening Appraisal
  console.log('\n--- 6. Annotations, Comments & PRISMA Records ---');
  await test('Record comment, quote highlight, and PRISMA appraisal decision', async () => {
    // Comment
    const comment = await prisma.paperComment.create({
      data: {
        paperId: testPaper.id,
        userId: testUser.id,
        userName: testUser.name,
        userRole: 'owner',
        commentText: 'Validate whether baseline was tested on LibriSpeech clean.',
        quoteText: 'Streaming execution latency below 200 milliseconds.',
        pageNumber: 4,
      },
    });

    // Highlight
    const highlight = await prisma.paperHighlight.create({
      data: {
        paperId: testPaper.id,
        userId: testUser.id,
        userName: testUser.name,
        userRole: 'owner',
        pageNumber: 4,
        color: '#10b981',
        colorLabel: 'emerald',
        selectedText: 'Extensive benchmarking against CoVoST-2 confirms 4.2 BLEU improvement.',
      },
    });

    // PRISMA screening decision
    const screening = await prisma.paperScreening.create({
      data: {
        paperId: testPaper.id,
        userId: testUser.id,
        userName: testUser.name,
        decision: 'INCLUDED',
        exclusionReason: null,
        notes: 'Meets PRISMA 2020 inclusion checklist criteria.',
      },
    });

    assert.ok(comment.id);
    assert.ok(highlight.id);
    assert.ok(screening.id);
    assert.strictEqual(screening.decision, 'INCLUDED');
  });

  // 7. Relational Queries with Deep Nested Includes
  console.log('\n--- 7. Relational Deep Include Queries ---');
  await test('Fetch Project with nested Clusters, Columns, Papers, and Values', async () => {
    const fetched = await prisma.project.findUnique({
      where: { id: testProject.id },
      include: {
        owner: true,
        members: true,
        clusters: {
          include: {
            columns: {
              include: {
                children: true,
              },
            },
          },
        },
        papers: {
          include: {
            columnValues: true,
            file: true,
            comments: true,
            highlights: true,
            screenings: true,
          },
        },
      },
    });

    assert.strictEqual(fetched.name, 'Deep Analytical Benchmark Survey');
    assert.strictEqual(fetched.owner.email, testUser.email);
    assert.strictEqual(fetched.clusters.length, 1);
    assert.strictEqual(fetched.clusters[0].columns.length, 2);
    assert.strictEqual(fetched.papers.length, 1);
    assert.strictEqual(fetched.papers[0].columnValues.length, 1);
    assert.strictEqual(fetched.papers[0].file.filename, 'streaming_speech_2026.pdf');
    assert.strictEqual(fetched.papers[0].comments.length, 1);
    assert.strictEqual(fetched.papers[0].screenings.length, 1);
  });

  // 8. Cascading Deletion Verification
  console.log('\n--- 8. Cascading Relational Deletion ---');
  await test('Deleting Project cascades to Clusters, Columns, Papers, Values, Comments', async () => {
    // Delete project
    await prisma.project.delete({
      where: { id: testProject.id },
    });

    // Check cluster was cascade deleted
    const clusterCheck = await prisma.taxonomyCluster.findUnique({
      where: { id: testCluster.id },
    });
    assert.strictEqual(clusterCheck, null);

    // Check paper was cascade deleted
    const paperCheck = await prisma.paper.findUnique({
      where: { id: testPaper.id },
    });
    assert.strictEqual(paperCheck, null);

    // Clean up user
    await prisma.user.delete({
      where: { id: testUser.id },
    });

    const userCheck = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    assert.strictEqual(userCheck, null);
  });

  // Close Prisma connection pool
  await closePrisma();

  console.log('\n======================================================');
  console.log(`📊 Phase 2 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase2Tests();
}

module.exports = { runPhase2Tests };
