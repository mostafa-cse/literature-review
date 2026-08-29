const fs = require('fs');
const path = require('path');
const { initDb, getDb } = require('./db');

function extractPapersFromHtml(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/const\s+papersData\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.warn(`No papersData array found in ${filePath}`);
    return [];
  }
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.error(`JSON parse error in ${filePath}:`, err.message);
    return [];
  }
}

function seed() {
  console.log('--- Initializing SQLite Database (literature.db) ---');
  initDb();
  const db = getDb();

  // Clear existing data in transaction
  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec(`
      DELETE FROM keywords;
      DELETE FROM paper_column_values;
      DELETE FROM dynamic_columns;
      DELETE FROM papers;
      DELETE FROM clusters;
      DELETE FROM projects;
      DELETE FROM sqlite_sequence WHERE name IN ('projects', 'clusters', 'papers', 'dynamic_columns', 'paper_column_values', 'keywords');
    `);

    // 1. Insert Project
    const insertProject = db.prepare(`
      INSERT INTO projects (name, description)
      VALUES (?, ?)
    `);
    const projectRes = insertProject.run(
      'Literature Survey on Feature Selection & Anomaly Detection',
      'A deep analytical benchmark, taxonomy, and multi-stage literature survey on high-dimensional feature selection, metaheuristic wrappers, and sparse representations.'
    );
    const projectId = projectRes.lastInsertRowid;
    console.log(`Created Project ID: ${projectId}`);

    // 2. Define Clusters
    const clusterDefs = [
      {
        folder: '00_surveys_and_reviews',
        name: 'Surveys & Reviews',
        description: 'Comprehensive surveys, taxonomies, systematic reviews, and benchmark evaluation frameworks in dimensionality reduction.',
        color: '#6366f1'
      },
      {
        folder: '01_filter_methods',
        name: 'Filter-Based Feature Selection',
        description: 'Statistical, information-theoretic (Mutual Information, mRMR), Relief-based, and correlation filtering algorithms.',
        color: '#38bdf8'
      },
      {
        folder: '02_wrapper_and_metaheuristics',
        name: 'Wrapper & Metaheuristic Optimization',
        description: 'Nature-inspired swarm intelligence and evolutionary search (PSO, GA, GWO, ACO, Whale Optimization) wrapped with ML classifiers.',
        color: '#f59e0b'
      },
      {
        folder: '03_embedded_and_sparse',
        name: 'Embedded & Sparse Feature Selection',
        description: 'Regularization penalties (LASSO, ElasticNet, SCAD), sparse matrix factorizations, and tree-integrated impurity metrics.',
        color: '#10b981'
      },
      {
        folder: '04_hybrid_and_ensemble',
        name: 'Hybrid & Ensemble Methods',
        description: 'Multi-stage filter-wrapper combinations, stability-preserving ensemble selectors, and multi-objective Pareto front optimizations.',
        color: '#ec4899'
      },
      {
        folder: '05_specialized_and_emerging',
        name: 'Specialized & Emerging Approaches',
        description: 'Deep neural feature selection, Graph Neural Networks, federated learning settings, streaming feature spaces, and quantum computing.',
        color: '#a855f7'
      }
    ];

    const insertCluster = db.prepare(`
      INSERT INTO clusters (project_id, name, description, color)
      VALUES (?, ?, ?, ?)
    `);

    const insertPaper = db.prepare(`
      INSERT INTO papers (
        cluster_id, title, authors, year, pub, domain, doi, pdf_url,
        status, intuition, equation, strengths, gaps
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDynCol = db.prepare(`
      INSERT INTO dynamic_columns (cluster_id, column_name, parent_column_id, col_type)
      VALUES (?, ?, ?, ?)
    `);

    const insertColVal = db.prepare(`
      INSERT INTO paper_column_values (paper_id, column_id, value)
      VALUES (?, ?, ?)
    `);

    const insertKeyword = db.prepare(`
      INSERT INTO keywords (paper_id, keyword)
      VALUES (?, ?)
    `);

    const standardDynCols = [
      { name: 'Sub-Family', type: 'text', key: 'subFamily' },
      { name: 'Time Complexity', type: 'formula', key: 'complexity' },
      { name: 'Complexity Details', type: 'text', key: 'complexity_simple' },
      { name: 'Classifiers Tested', type: 'tags', key: 'classifiers' },
      { name: 'Benchmark Datasets', type: 'text', key: 'datasets' },
      { name: 'Thesis Opportunity', type: 'text', key: 'thesis_opp' },
      { name: 'Domain Group', type: 'text', key: 'domainGroup' },
      { name: 'Variable Dictionary', type: 'json', key: 'variables' }
    ];

    let totalPapersSeeded = 0;
    let totalKeywordsSeeded = 0;
    let totalValuesSeeded = 0;

    for (const cDef of clusterDefs) {
      const cRes = insertCluster.run(projectId, cDef.folder, cDef.description, cDef.color);
      const clusterId = cRes.lastInsertRowid;

      // Create standard dynamic columns for this cluster
      const colMap = {};
      for (const col of standardDynCols) {
        const colRes = insertDynCol.run(clusterId, col.name, null, col.type);
        colMap[col.key] = colRes.lastInsertRowid;
      }

      // Read HTML file for papers
      const htmlPath = path.join(__dirname, '..', 'Project', cDef.folder, 'index.html');
      const papers = extractPapersFromHtml(htmlPath);

      console.log(`Cluster "${cDef.folder}" (ID ${clusterId}): Found ${papers.length} papers`);

      for (const p of papers) {
        const strengthsStr = Array.isArray(p.pros) ? JSON.stringify(p.pros) : (p.pros || '');
        const gapsStr = Array.isArray(p.gaps) ? JSON.stringify(p.gaps) : (p.gaps || '');
        const pdfUrl = p.pdf || p.rel_pdf || p.filename || '';
        const domainStr = p.domainGroup || p.domain || p.domainTag || 'General';

        const pRes = insertPaper.run(
          clusterId,
          p.title || 'Untitled Paper',
          p.authors || 'Unknown Authors',
          p.year ? parseInt(p.year, 10) : null,
          p.pub || '',
          domainStr,
          p.doi || '',
          pdfUrl,
          'unread',
          p.intuition || '',
          p.equation || '',
          strengthsStr,
          gapsStr
        );
        const paperId = pRes.lastInsertRowid;
        totalPapersSeeded++;

        // Insert Dynamic Column Values
        for (const col of standardDynCols) {
          let val = p[col.key];
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              val = JSON.stringify(val);
            } else {
              val = String(val);
            }
            insertColVal.run(paperId, colMap[col.key], val);
            totalValuesSeeded++;
          }
        }

        // Extract and Insert Keywords
        const keywordsSet = new Set();
        if (p.subFamily) keywordsSet.add(p.subFamily.trim());
        if (p.domainTag) keywordsSet.add(p.domainTag.trim());
        if (p.pub) keywordsSet.add(p.pub.trim());
        if (p.cat) keywordsSet.add(p.cat.replace(/^\d+_/, '').replace(/_/g, ' '));
        if (p.classifiers) {
          p.classifiers.split(',').forEach(c => {
            const cleanC = c.trim();
            if (cleanC.length > 1) keywordsSet.add(cleanC);
          });
        }

        for (const kw of keywordsSet) {
          if (kw) {
            insertKeyword.run(paperId, kw);
            totalKeywordsSeeded++;
          }
        }
      }
    }

    db.exec('COMMIT;');
    console.log(`\n✅ Seeding Complete!`);
    console.log(`   Total Clusters: ${clusterDefs.length}`);
    console.log(`   Total Papers: ${totalPapersSeeded}`);
    console.log(`   Total Column Values: ${totalValuesSeeded}`);
    console.log(`   Total Keywords: ${totalKeywordsSeeded}`);
    console.log(`   Database location: ${path.join(__dirname, '..', 'literature.db')}`);

  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('❌ Seeding Failed:', err);
    throw err;
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;
