/**
 * ==============================================================================
 * LITSPHERE ENTERPRISE DEVELOPMENT SEED SCRIPT (PostgreSQL + Prisma)
 * ==============================================================================
 * Bootstraps a comprehensive development environment with multi-tier academic users,
 * realistic survey projects, hierarchical taxonomy clusters, benchmark columns,
 * published manuscripts, cell matrix values, keywords, and PRISMA 2020 screenings.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function seed() {
  console.log('======================================================================');
  console.log('🌱 LITSPHERE DEVELOPMENT SEED GENERATOR (PostgreSQL + Prisma)');
  console.log('======================================================================\n');

  const defaultPasswordHash = hashPassword('Password123!');

  // 1. Users
  console.log('▶️ [1/7] Seeding Multi-Role Users...');
  const users = [
    {
      name: 'System Administrator',
      username: 'admin',
      email: 'admin@litsphere.ac',
      role: 'ADMIN',
      institution: 'Stanford AI Institute',
      bio: 'Principal research administrator and platform architect.',
    },
    {
      name: 'Prof. Robert Vance',
      username: 'rvance',
      email: 'supervisor@litsphere.ac',
      role: 'SUPERVISOR',
      institution: 'MIT CSAIL',
      bio: 'Full Professor specializing in high-dimensional optimization and algorithmic benchmarking.',
    },
    {
      name: 'Dr. Sarah Chen',
      username: 'schen',
      email: 'reviewer@litsphere.ac',
      role: 'REVIEWER',
      institution: 'Oxford Department of Computer Science',
      bio: 'Senior peer reviewer and associate editor for statistical machine learning.',
    },
    {
      name: 'Alex Mercer',
      username: 'amercer',
      email: 'researcher@litsphere.ac',
      role: 'USER',
      institution: 'Carnegie Mellon University',
      bio: 'Doctoral candidate researching neural speech translation and sparse representations.',
    },
    {
      name: 'Emily Davis',
      username: 'edavis',
      email: 'student@litsphere.ac',
      role: 'USER',
      institution: 'UC Berkeley',
      bio: 'Undergraduate honors researcher exploring metaheuristic search algorithms.',
    },
  ];

  const createdUsers = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        institution: u.institution,
        bio: u.bio,
      },
      create: {
        name: u.name,
        username: u.username,
        email: u.email,
        passwordHash: defaultPasswordHash,
        role: u.role,
        institution: u.institution,
        bio: u.bio,
      },
    });
    createdUsers[u.username] = user;
  }
  console.log(`   ✅ Seeded ${Object.keys(createdUsers).length} platform users (password: Password123!).`);

  // 2. Academic Survey Projects
  console.log('\n▶️ [2/7] Seeding Academic Survey Benchmarks...');
  const survey1 = await prisma.project.upsert({
    where: { shareToken: 'survey_feature_selection_2026' },
    update: {},
    create: {
      ownerId: createdUsers.admin.id,
      name: 'Deep Analytical Benchmark on High-Dimensional Feature Selection',
      description:
        'A systematic taxonomy, empirical benchmark, and multi-stage literature survey evaluating filter, wrapper, embedded, and deep neural feature selection strategies.',
      domain: 'Machine Learning',
      isPublic: true,
      shareToken: 'survey_feature_selection_2026',
    },
  });

  const survey2 = await prisma.project.upsert({
    where: { shareToken: 'survey_speech_translation_2026' },
    update: {},
    create: {
      ownerId: createdUsers.amercer.id,
      name: 'Multilingual Speech-to-Speech Translation & Streaming Inference Frameworks',
      description:
        'Comprehensive comparative evaluation of direct end-to-end speech translation models versus cascaded ASR-MT-TTS pipelines under latency constraints.',
      domain: 'Natural Language Processing',
      isPublic: true,
      shareToken: 'survey_speech_translation_2026',
    },
  });

  // Collaborative RBAC memberships for Survey 1
  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: survey1.id, userId: createdUsers.amercer.id },
    },
    update: { role: 'EDITOR' },
    create: {
      projectId: survey1.id,
      userId: createdUsers.amercer.id,
      role: 'EDITOR',
      invitedBy: createdUsers.admin.id,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: survey1.id, userId: createdUsers.schen.id },
    },
    update: { role: 'REVIEWER' },
    create: {
      projectId: survey1.id,
      userId: createdUsers.schen.id,
      role: 'REVIEWER',
      invitedBy: createdUsers.admin.id,
    },
  });

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: survey1.id, userId: createdUsers.edavis.id },
    },
    update: { role: 'VIEWER' },
    create: {
      projectId: survey1.id,
      userId: createdUsers.edavis.id,
      role: 'VIEWER',
      invitedBy: createdUsers.admin.id,
    },
  });
  console.log(`   ✅ Seeded 2 research surveys with 4-tier collaborative RBAC.`);

  // 3. Taxonomy Clusters
  console.log('\n▶️ [3/7] Seeding Taxonomy Clusters...');
  const clusterDefs = [
    {
      name: 'Surveys & Methodological Frameworks',
      description: 'Systematic reviews, PRISMA taxonomies, and benchmarking paradigms.',
      color: '#6366f1',
      position: 1,
    },
    {
      name: 'Information-Theoretic & Filter Methods',
      description: 'Mutual Information, mRMR, ReliefF, Pearson correlation, and ANOVA filters.',
      color: '#0284c7',
      position: 2,
    },
    {
      name: 'Metaheuristic & Swarm Optimization Wrappers',
      description: 'PSO, Genetic Algorithms, Grey Wolf Optimizer, and Pareto multi-objective search.',
      color: '#d97706',
      position: 3,
    },
    {
      name: 'Sparse Regularization & Embedded Selectors',
      description: 'L1 LASSO penalties, ElasticNet, SCAD, and tree-integrated Gini importances.',
      color: '#059669',
      position: 4,
    },
    {
      name: 'Deep Neural & Self-Supervised Approaches',
      description: 'Concrete Autoencoders, Graph Neural Network feature pruning, and contrastive selection.',
      color: '#9333ea',
      position: 5,
    },
  ];

  const createdClusters = [];
  for (const c of clusterDefs) {
    let cluster = await prisma.taxonomyCluster.findFirst({
      where: { projectId: survey1.id, name: c.name },
    });
    if (!cluster) {
      cluster = await prisma.taxonomyCluster.create({
        data: {
          projectId: survey1.id,
          name: c.name,
          description: c.description,
          color: c.color,
          position: c.position,
        },
      });
    }
    createdClusters.push(cluster);
  }
  console.log(`   ✅ Seeded ${createdClusters.length} taxonomy clusters for Survey 1.`);

  // 4. Dynamic Benchmark Columns
  console.log('\n▶️ [4/7] Seeding Dynamic Benchmark Columns...');
  const targetCluster = createdClusters[1]; // Filter Methods cluster
  const columnDefs = [
    {
      columnName: 'Objective Function',
      colType: 'LATEX',
    },
    {
      columnName: 'Computational Complexity',
      colType: 'TEXT',
    },
    {
      columnName: 'Feature Retention Rate (%)',
      colType: 'NUMBER',
    },
    {
      columnName: 'Target Benchmark Datasets',
      colType: 'TAGS',
    },
    {
      columnName: 'Evaluation Criterion',
      colType: 'SELECT',
    },
  ];

  const createdColumns = [];
  for (const col of columnDefs) {
    let column = await prisma.dynamicColumn.findFirst({
      where: { clusterId: targetCluster.id, columnName: col.columnName },
    });
    if (!column) {
      column = await prisma.dynamicColumn.create({
        data: {
          clusterId: targetCluster.id,
          columnName: col.columnName,
          colType: col.colType,
        },
      });
    }
    createdColumns.push(column);
  }
  console.log(`   ✅ Seeded ${createdColumns.length} dynamic columns across LATEX, TEXT, NUMBER, TAGS, SELECT types.`);

  // 5. Academic Papers
  console.log('\n▶️ [5/7] Seeding Academic Manuscripts & Synthesis Notes...');
  const papersData = [
    {
      title: 'Feature Selection Based on Mutual Information Criteria of Max-Dependency, Max-Relevance, and Min-Redundancy',
      authors: 'Hanchuan Peng, Fuhui Long, Chris Ding',
      year: 2005,
      pub: 'IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI)',
      domain: 'Machine Learning & Statistical Feature Selection',
      doi: '10.1109/TPAMI.2005.159',
      status: 'COMPLETED',
      screeningDecision: 'INCLUDED',
      equation: '\\max_S \\left[ \\frac{1}{|S|} \\sum_{i \\in S} I(x_i; y) - \\frac{1}{|S|^2} \\sum_{i, j \\in S} I(x_i; x_j) \\right]',
      intuition: 'Balances individual feature relevance with class target against pairwise redundancy between candidate features using Shannon mutual information.',
      strengths: 'First-order incremental greedy formulation with guaranteed theoretical convergence; computationally tractable for continuous and discrete attributes.',
      gaps: 'Susceptible to higher-order multivariate interaction blind spots where two jointly predictive features have zero individual mutual information.',
      advantages: 'High empirical stability across diverse biomedical and microarray datasets.',
      criticism: 'Heuristic discretization required for continuous variables can induce discretization bias.',
      futureDirections: 'Continuous mutual information estimation using neural variational representations (MINE).',
      keywords: ['Mutual Information', 'mRMR', 'Feature Selection', 'High-Dimensional', 'Microarray'],
      cellValues: {
        'Objective Function': '\\max (D - R)',
        'Computational Complexity': 'O(|S| \\cdot N \\cdot D)',
        'Feature Retention Rate (%)': '15.5',
        'Target Benchmark Datasets': 'Colon, Lymphoma, Leukemia, NCI60',
        'Evaluation Criterion': 'Cross-Validation Accuracy',
      },
    },
    {
      title: 'A Fast Correlation-Based Filter Solution for High-Dimensional Feature Selection',
      authors: 'Lei Yu, Huan Liu',
      year: 2003,
      pub: 'Proceedings of the International Conference on Machine Learning (ICML)',
      domain: 'Data Mining & Feature Selection',
      doi: '10.5555/3041838.3041942',
      status: 'COMPLETED',
      screeningDecision: 'INCLUDED',
      equation: 'SU(X, Y) = 2 \\left[ \\frac{IG(X|Y)}{H(X) + H(Y)} \\right]',
      intuition: 'Applies symmetrical uncertainty (SU) normalized information gain to detect predominant features while discarding redundant correlations.',
      strengths: 'Linear complexity relative to the number of candidate features, enabling instant scalability to 100,000+ dimensions.',
      gaps: 'Requires explicit discrete threshold tuning for determining predominant correlation cutoff.',
      advantages: 'Outperforms standard Relief and Pearson filters on sparse genomics.',
      criticism: 'Does not consider non-linear feature interactions outside pairwise symmetrical uncertainty.',
      futureDirections: 'Adaptive thresholding via Bayesian optimization.',
      keywords: ['Symmetrical Uncertainty', 'FCBF', 'Filter Method', 'Information Gain'],
      cellValues: {
        'Objective Function': 'SU(X_i, Y) \\ge \\delta',
        'Computational Complexity': 'O(N \\log N)',
        'Feature Retention Rate (%)': '8.2',
        'Target Benchmark Datasets': 'Arcene, Madelon, Gisette',
        'Evaluation Criterion': 'F1-Score & Runtime',
      },
    },
    {
      title: 'Comprehensive Survey of Swarm Intelligence and Evolutionary Feature Selection',
      authors: 'Mohammed A. Awad, H. Hassan, Khaled M. Hosny',
      year: 2024,
      pub: 'ACM Computing Surveys',
      domain: 'Metaheuristic Optimization & Artificial Intelligence',
      doi: '10.1145/3638210',
      status: 'READING',
      screeningDecision: 'INCLUDED',
      equation: 'f(S) = \\alpha \\cdot (1 - \\text{Acc}(S)) + (1 - \\alpha) \\cdot \\frac{|S|}{|D|}',
      intuition: 'Multi-objective fitness function weighing classifier error reduction against feature set sparsity penalty.',
      strengths: 'Comprehensive benchmark comparison across 42 nature-inspired swarm algorithms on 30 UCI datasets.',
      gaps: 'Lacks uniform parameter tuning across compared metaheuristics, introducing baseline bias.',
      advantages: 'In-depth taxonomy categorizing continuous-to-binary transfer functions (S-shaped vs V-shaped).',
      criticism: 'High computational overhead when wrapper evaluation uses deep ensembles.',
      futureDirections: 'Surrogate-assisted fitness evaluations to reduce model training iterations.',
      keywords: ['Swarm Intelligence', 'Particle Swarm Optimization', 'Genetic Algorithm', 'Wrapper'],
      cellValues: {
        'Objective Function': '\\min f(S) = \\alpha E + (1 - \\alpha) \\frac{|S|}{|D|}',
        'Computational Complexity': 'O(G \\cdot P \\cdot T_{eval})',
        'Feature Retention Rate (%)': '12.0',
        'Target Benchmark Datasets': 'UCI Benchmark, Gene Expression Omnibus',
        'Evaluation Criterion': 'Pareto Front Hypervolume',
      },
    },
  ];

  for (const p of papersData) {
    let paper = await prisma.paper.findFirst({
      where: { projectId: survey1.id, title: p.title },
    });
    if (!paper) {
      paper = await prisma.paper.create({
        data: {
          projectId: survey1.id,
          clusterId: targetCluster.id,
          title: p.title,
          authors: p.authors,
          year: p.year,
          pub: p.pub,
          domain: p.domain,
          doi: p.doi,
          status: p.status,
          screeningDecision: p.screeningDecision,
          equation: p.equation,
          intuition: p.intuition,
          strengths: p.strengths,
          gaps: p.gaps,
          advantages: p.advantages,
          criticism: p.criticism,
          futureDirections: p.futureDirections,
        },
      });
    }

    // Seed keywords
    for (const kw of p.keywords) {
      const existingKw = await prisma.paperKeyword.findFirst({
        where: { paperId: paper.id, keyword: kw },
      });
      if (!existingKw) {
        await prisma.paperKeyword.create({
          data: { paperId: paper.id, keyword: kw },
        });
      }
    }

    // Seed matrix cell values
    for (const [colName, val] of Object.entries(p.cellValues)) {
      const col = createdColumns.find((c) => c.columnName === colName);
      if (col) {
        await prisma.paperColumnValue.upsert({
          where: {
            paperId_columnId: { paperId: paper.id, columnId: col.id },
          },
          update: { value: val },
          create: {
            paperId: paper.id,
            columnId: col.id,
            value: val,
          },
        });
      }
    }

    // Seed PRISMA Screening Decision
    await prisma.paperScreening.upsert({
      where: {
        paperId_userId: { paperId: paper.id, userId: createdUsers.schen.id },
      },
      update: { decision: 'INCLUDED' },
      create: {
        paperId: paper.id,
        userId: createdUsers.schen.id,
        userName: createdUsers.schen.name,
        decision: 'INCLUDED',
        notes: 'Meets rigorous methodological inclusion standards for feature selection benchmark.',
      },
    });

    // Seed Highlight Annotation
    await prisma.paperHighlight.create({
      data: {
        paperId: paper.id,
        userId: createdUsers.amercer.id,
        userName: createdUsers.amercer.name,
        userRole: 'editor',
        pageNumber: 1,
        color: '#fef08a',
        colorLabel: 'Methodology Core',
        selectedText: p.intuition,
        note: 'Key theoretical intuition cited in review manuscript.',
      },
    });
  }
  console.log(`   ✅ Seeded ${papersData.length} comprehensive academic papers with full matrix values, keywords, and highlights.`);

  // 6. System Settings & Templates
  console.log('\n▶️ [6/7] Seeding Platform Configuration & Templates...');
  const settings = [
    { key: 'active_llm_provider', value: 'gemini' },
    { key: 'gemini_model', value: 'gemini-1.5-pro' },
    { key: 'max_upload_size_mb', value: '50' },
    { key: 'allow_registration', value: 'true' },
    { key: 'openalex_email', value: 'research@litnexis.ac' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  // 7. Synchronize ID Sequences
  console.log('\n▶️ [7/7] Synchronizing Sequences...');
  const tables = [
    'users',
    'projects',
    'project_members',
    'clusters',
    'dynamic_columns',
    'papers',
    'paper_column_values',
    'keywords',
    'paper_files',
    'paper_comments',
    'paper_screening',
    'paper_highlights',
    'master_templates',
    'audit_logs',
    'password_resets',
  ];
  for (const t of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE(MAX(id), 1)) FROM "${t}";`
      );
    } catch (e) {
      // Ignore non-sequence or empty tables
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('======================================================================\n');
}

if (require.main === module) {
  seed()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('❌ Seeding failed:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}

module.exports = { seed };
