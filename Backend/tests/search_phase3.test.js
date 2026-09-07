/**
 * PHASE 3 POSTGRESQL EXTENSIONS, FULL-TEXT SEARCH & TRIGRAM TEST SUITE
 * Validates:
 * 1. pg_trgm and uuid-ossp extension installation
 * 2. Generated search_vector column automatic updates
 * 3. Weighted FTS queries (ts_rank_cd and headline highlights)
 * 4. Trigram fuzzy search matching typos
 * 5. Fast keyword autocomplete
 */

const assert = require('assert');
const { query: pgQuery, closePostgres } = require('../src/config/postgres');
const { prisma, closePrisma } = require('../src/config/prisma');
const {
  searchPapers,
  autocompleteKeywords,
  searchAuthors,
} = require('../src/services/searchService');

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PHASE 3 FTS & TRIGRAM SEARCH TESTS');
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

  // 1. PostgreSQL Extensions
  console.log('--- 1. Database Extensions ---');
  await test('pg_trgm extension is active and available', async () => {
    const res = await pgQuery("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';");
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].extname, 'pg_trgm');
  });

  await test('uuid-ossp extension is active and available', async () => {
    const res = await pgQuery("SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp';");
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].extname, 'uuid-ossp');
  });

  // Seed sample data for testing
  const suffix = Date.now();
  let testUser = null;
  let testProject = null;
  let testCluster = null;
  let testPaper1 = null;
  let testPaper2 = null;

  console.log('\n--- 2. Generated search_vector & Ingestion ---');
  await test('Insert papers and verify search_vector automatically generated', async () => {
    testUser = await prisma.user.create({
      data: {
        name: 'Dr. Alan Turing',
        email: `turing_${suffix}@cambridge.ac.uk`,
        passwordHash: 'salt:hash',
        role: 'USER',
      },
    });

    testProject = await prisma.project.create({
      data: {
        name: 'Quantum & Audio Benchmarks',
        ownerId: testUser.id,
      },
    });

    testCluster = await prisma.taxonomyCluster.create({
      data: {
        projectId: testProject.id,
        name: 'Speech Synthesis',
      },
    });

    testPaper1 = await prisma.paper.create({
      data: {
        projectId: testProject.id,
        clusterId: testCluster.id,
        title: 'Streaming Multilingual Speech-to-Speech Translation with Chunked Attention',
        authors: 'Kamal, M., Chen, S., and Vance, R.',
        year: 2026,
        domain: 'Audio Signal Processing',
        pub: 'IEEE Transactions',
        intuition: 'Isolates cross-lingual acoustic representations via chunked transducers',
        advantages: 'Low execution latency below 200ms',
      },
    });

    testPaper2 = await prisma.paper.create({
      data: {
        projectId: testProject.id,
        clusterId: testCluster.id,
        title: 'Quantum Neural Networks for High-Dimensional Object Detection',
        authors: 'Mahargya, I., Shidik, G., and Rustad, S.',
        year: 2025,
        domain: 'Quantum Computing',
        pub: 'Elsevier Applied Intelligence',
        intuition: 'Parameterized quantum circuits for edge detection on NISQ devices',
      },
    });

    // Seed keywords
    await prisma.paperKeyword.createMany({
      data: [
        { paperId: testPaper1.id, keyword: 'Speech Translation' },
        { paperId: testPaper1.id, keyword: 'Chunked Attention' },
        { paperId: testPaper2.id, keyword: 'Quantum Computing' },
        { paperId: testPaper2.id, keyword: 'Neural Networks' },
      ],
    });

    // Check search_vector was automatically created by PostgreSQL
    const checkVector = await pgQuery(
      'SELECT search_vector FROM papers WHERE id = $1;',
      [testPaper1.id]
    );

    assert.ok(checkVector.rows[0].search_vector);
    assert.ok(checkVector.rows[0].search_vector.includes('speech'));
    assert.ok(checkVector.rows[0].search_vector.includes('translat'));
  });

  // 3. Weighted Full-Text Search
  console.log('\n--- 3. Weighted Full-Text Search (tsquery & ts_rank) ---');
  await test('FTS searches exact terms and produces headline highlights', async () => {
    const searchRes = await searchPapers({
      searchTerm: 'Streaming Speech',
      projectId: testProject.id,
    });

    assert.ok(searchRes.total >= 1);
    assert.strictEqual(searchRes.results[0].id, testPaper1.id);
    assert.ok(searchRes.results[0].fts_rank > 0);
    assert.ok(searchRes.results[0].title_headline.includes('<mark>'));
  });

  // 4. Trigram Fuzzy Typo-Tolerant Search
  console.log('\n--- 4. Trigram Fuzzy Search (Typo Tolerance) ---');
  await test('Trigram matches intentional typos in search term ("multilingul")', async () => {
    // Intentional typo: "multilingul" instead of "multilingual"
    const searchRes = await searchPapers({
      searchTerm: 'multilingul speech',
      projectId: testProject.id,
    });

    assert.ok(searchRes.total >= 1);
    assert.strictEqual(searchRes.results[0].id, testPaper1.id);
    assert.ok(searchRes.results[0].trgm_similarity > 0.2);
  });

  await test('Trigram matches author search ("Mahargya")', async () => {
    const authorRes = await searchAuthors('Mahargya');
    assert.ok(authorRes.length >= 1);
    assert.ok(authorRes[0].authors.includes('Mahargya'));
  });

  // 5. Autocomplete Keywords
  console.log('\n--- 5. Keyword Autocomplete ---');
  await test('autocompleteKeywords returns suggestions matching prefix "Quant"', async () => {
    const suggestions = await autocompleteKeywords('Quant');
    assert.ok(suggestions.length >= 1);
    assert.strictEqual(suggestions[0].keyword, 'Quantum Computing');
  });

  // Cleanup test records
  console.log('\n--- 6. Test Data Teardown ---');
  await test('Cascade delete project and clean up test records', async () => {
    await prisma.project.delete({ where: { id: testProject.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  await closePostgres();
  await closePrisma();

  console.log('\n======================================================');
  console.log(`📊 Phase 3 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase3Tests();
}

module.exports = { runPhase3Tests };
