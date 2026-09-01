const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const rootDb = path.join(__dirname, '..', '..', 'literature.db');
const backendDb = path.join(__dirname, '..', 'literature.db');
const DB_PATH = process.env.DB_PATH || (fs.existsSync(rootDb) ? rootDb : backendDb);

let dbInstance = null;

function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return key === derivedKey;
}

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user', -- 'admin', 'user', 'reviewer', 'supervisor'
      institution TEXT DEFAULT 'Academic Research Institute',
      status TEXT DEFAULT 'active', -- 'active', 'deactivated', 'banned'
      ai_token_quota INTEGER DEFAULT 100000,
      ai_tokens_used INTEGER DEFAULT 0,
      storage_quota_mb INTEGER DEFAULT 500,
      storage_used_mb REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      description TEXT,
      domain TEXT DEFAULT 'Computer Science',
      is_public INTEGER DEFAULT 0,
      share_token TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER DEFAULT 1,
      cluster_id INTEGER,
      title TEXT NOT NULL,
      authors TEXT,
      year INTEGER,
      pub TEXT,
      domain TEXT,
      doi TEXT,
      pdf_url TEXT,
      status TEXT DEFAULT 'unread',
      intuition TEXT,
      equation TEXT,
      strengths TEXT,
      gaps TEXT,
      advantages TEXT,
      criticism TEXT,
      future_directions TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dynamic_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      column_name TEXT NOT NULL,
      parent_column_id INTEGER,
      col_type TEXT DEFAULT 'text',
      FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_column_id) REFERENCES dynamic_columns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paper_column_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      column_id INTEGER NOT NULL,
      value TEXT,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
      FOREIGN KEY (column_id) REFERENCES dynamic_columns(id) ON DELETE CASCADE,
      UNIQUE(paper_id, column_id)
    );

    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS master_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      clusters_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS paper_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      mimetype TEXT DEFAULT 'application/pdf',
      file_size INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT,
      action TEXT NOT NULL,
      ip_address TEXT,
      details TEXT,
      status TEXT DEFAULT 'SUCCESS',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'reviewer', 'viewer')),
      invited_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paper_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      user_role TEXT DEFAULT 'reviewer',
      comment_text TEXT NOT NULL,
      quote_text TEXT,
      page_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paper_screening (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      user_id INTEGER,
      user_name TEXT,
      decision TEXT NOT NULL CHECK(decision IN ('included', 'excluded', 'uncertain')),
      exclusion_reason TEXT,
      notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, user_id),
      FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Safe migrations for existing tables
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    if (!userCols.some(c => c.name === 'username')) {
      db.exec("ALTER TABLE users ADD COLUMN username TEXT;");
      db.exec("UPDATE users SET username = LOWER(REPLACE(REPLACE(name, ' ', '_'), '.', '')) WHERE username IS NULL OR username = '';");
    }
    if (!userCols.some(c => c.name === 'bio')) {
      db.exec("ALTER TABLE users ADD COLUMN bio TEXT;");
    }
    if (!userCols.some(c => c.name === 'orcid')) {
      db.exec("ALTER TABLE users ADD COLUMN orcid TEXT;");
    }
    if (!userCols.some(c => c.name === 'google_scholar')) {
      db.exec("ALTER TABLE users ADD COLUMN google_scholar TEXT;");
    }
    if (!userCols.some(c => c.name === 'phone')) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
    }
    if (!userCols.some(c => c.name === 'avatar_url')) {
      db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT;");
    }
    if (!userCols.some(c => c.name === 'token_version')) {
      db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;");
      db.exec("UPDATE users SET token_version = 1 WHERE token_version IS NULL;");
    }
    if (!userCols.some(c => c.name === 'firebase_uid')) {
      db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT;");
    }

    const projectCols = db.prepare("PRAGMA table_info(projects)").all();
    if (!projectCols.some(c => c.name === 'owner_id')) {
      db.exec("ALTER TABLE projects ADD COLUMN owner_id INTEGER DEFAULT 1;");
    }
    if (!projectCols.some(c => c.name === 'is_public')) {
      db.exec("ALTER TABLE projects ADD COLUMN is_public INTEGER DEFAULT 0;");
    }
    if (!projectCols.some(c => c.name === 'share_token')) {
      db.exec("ALTER TABLE projects ADD COLUMN share_token TEXT;");
    }

    const paperCols = db.prepare("PRAGMA table_info(papers)").all();
    if (!paperCols.some(c => c.name === 'project_id')) {
      db.exec("ALTER TABLE papers ADD COLUMN project_id INTEGER DEFAULT 1;");
    }
    if (!paperCols.some(c => c.name === 'advantages')) {
      db.exec("ALTER TABLE papers ADD COLUMN advantages TEXT;");
      db.exec("UPDATE papers SET advantages = strengths WHERE advantages IS NULL AND strengths IS NOT NULL;");
    }
    if (!paperCols.some(c => c.name === 'criticism')) {
      db.exec("ALTER TABLE papers ADD COLUMN criticism TEXT;");
      db.exec("UPDATE papers SET criticism = gaps WHERE criticism IS NULL AND gaps IS NOT NULL;");
    }
    if (!paperCols.some(c => c.name === 'future_directions')) {
      db.exec("ALTER TABLE papers ADD COLUMN future_directions TEXT;");
    }

    // Automatic Migration: Add domain column if it doesn't exist
    try {
      db.exec("ALTER TABLE projects ADD COLUMN domain TEXT DEFAULT 'Computer Science'");
    } catch (e) {
      // Column already exists
    }
  } catch (err) {
    console.warn('Migration note:', err.message);
  }

  // Create indexes for high-speed relational queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_projects_token ON projects(share_token);
    CREATE INDEX IF NOT EXISTS idx_clusters_project ON clusters(project_id);
    CREATE INDEX IF NOT EXISTS idx_papers_project ON papers(project_id);
    CREATE INDEX IF NOT EXISTS idx_papers_cluster ON papers(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
    CREATE INDEX IF NOT EXISTS idx_dynamic_columns_cluster ON dynamic_columns(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_pcv_paper ON paper_column_values(paper_id);
    CREATE INDEX IF NOT EXISTS idx_pcv_column ON paper_column_values(column_id);
    CREATE INDEX IF NOT EXISTS idx_keywords_paper ON keywords(paper_id);
    CREATE INDEX IF NOT EXISTS idx_keywords_text ON keywords(keyword);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_pm_project ON project_members(project_id);
    CREATE INDEX IF NOT EXISTS idx_pm_user ON project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_comments_paper ON paper_comments(paper_id);
    CREATE INDEX IF NOT EXISTS idx_screening_paper ON paper_screening(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_files_paper ON paper_files(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_files_filename ON paper_files(filename);
    CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);
    CREATE INDEX IF NOT EXISTS idx_password_resets_code ON password_resets(code);
  `);

  // Migrate existing PDF files from uploads directories into paper_files database table
  try {
    const backendUploads = path.join(__dirname, '..', 'uploads');
    const rootUploads = path.join(__dirname, '..', '..', 'uploads');
    const papersWithPdf = db.prepare("SELECT id, pdf_url, title FROM papers WHERE pdf_url IS NOT NULL AND pdf_url != ''").all();

    const insertPaperFile = db.prepare(`
      INSERT OR REPLACE INTO paper_files (paper_id, filename, mimetype, file_size, data)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const p of papersWithPdf) {
      const rawFilename = path.basename(p.pdf_url);
      if (!rawFilename || rawFilename === 'null') continue;

      const fileInBackend = path.join(backendUploads, rawFilename);
      const fileInRoot = path.join(rootUploads, rawFilename);
      let targetPath = fs.existsSync(fileInBackend) ? fileInBackend : (fs.existsSync(fileInRoot) ? fileInRoot : null);

      if (targetPath) {
        const existing = db.prepare("SELECT id FROM paper_files WHERE paper_id = ?").get(p.id);
        if (!existing) {
          const fileBuffer = fs.readFileSync(targetPath);
          insertPaperFile.run(p.id, rawFilename, 'application/pdf', fileBuffer.length, fileBuffer);
        }
      }
    }
  } catch (migErr) {
    console.warn('PDF database migration notice:', migErr.message);
  }

  // Seed default admin & researcher users if not present
  try {
    const adminCheck = db.prepare("SELECT id FROM users WHERE email = ?").get('admin@litsphere.ac');
    if (!adminCheck) {
      const adminPass = hashPassword('admin123');
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Platform Administrator', 'admin@litsphere.ac', adminPass, 'admin', 'LitSphere Systems Engineering', 'active', 1000000, 5000);
    }

    const userCheck = db.prepare("SELECT id FROM users WHERE email = ?").get('researcher@litsphere.ac');
    if (!userCheck) {
      const userPass = hashPassword('researcher123');
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Alex Morgan (Researcher)', 'researcher@litsphere.ac', userPass, 'user', 'Department of Computer Science', 'active', 150000, 1000);
    }

    const coauthorCheck = db.prepare("SELECT id FROM users WHERE email = ?").get('coauthor@litsphere.ac');
    if (!coauthorCheck) {
      const coauthorPass = hashPassword('coauthor123');
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Dr. Sarah Chen (Co-Author)', 'coauthor@litsphere.ac', coauthorPass, 'user', 'AI & Machine Learning Lab', 'active', 120000, 800);
    }

    const advisorCheck = db.prepare("SELECT id FROM users WHERE email = ?").get('advisor@litsphere.ac');
    if (!advisorCheck) {
      const advisorPass = hashPassword('advisor123');
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, institution, status, ai_token_quota, storage_quota_mb)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Prof. Robert Vance (Advisor)', 'advisor@litsphere.ac', advisorPass, 'supervisor', 'Graduate Faculty of Engineering', 'active', 300000, 2000);
    }

    // Ensure all existing projects have an owner registered in project_members
    const allProjects = db.prepare("SELECT id, owner_id FROM projects").all();
    const insertMember = db.prepare(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, user_id) DO NOTHING
    `);
    allProjects.forEach(p => {
      insertMember.run(p.id, p.owner_id || 1, 'owner');
    });

    // Seed default system settings
    const defaultSettings = [
      ['maintenance_mode', 'false'],
      ['maintenance_message', 'LitSphere Platform is currently undergoing scheduled database maintenance. Please check back shortly.'],
      ['active_llm_provider', 'gemini'],
      ['gemini_model', 'gemini-1.5-pro'],
      ['claude_model', 'claude-3-5-sonnet'],
      ['openai_model', 'gpt-4o'],
      ['max_upload_size_mb', '50'],
      ['default_user_token_quota', '100000'],
      ['default_user_storage_quota_mb', '500'],
      ['openalex_email', 'research@litsphere.ac'],
      ['crossref_mailto', 'api@litsphere.ac']
    ];

    const insertSetting = db.prepare(`
      INSERT INTO system_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO NOTHING
    `);
    defaultSettings.forEach(([k, v]) => insertSetting.run(k, v));

    // Seed master benchmark templates
    const templateCheck = db.prepare("SELECT count(*) as count FROM master_templates").get();
    if (!templateCheck || templateCheck.count === 0) {
      const defaultTemplates = [
        {
          name: '6-Pillar Feature Selection & Dimensionality Reduction Benchmark',
          category: 'Machine Learning',
          description: 'Comprehensive taxonomy comparing Filter (MI, ReliefF), Wrapper (PSO, GA), Embedded (LASSO), Hybrid, Deep Sparse, and GNN feature selection algorithms.',
          clusters: [
            { name: '1. Filter Methods (Information & Distance)', color: '#38bdf8', description: 'Mutual Information, ReliefF, Chi-Square, Fisher Score', columns: ['Objective Function', 'Ranking Metric', 'Time Complexity', 'Space Complexity'] },
            { name: '2. Wrapper & Evolutionary Swarm', color: '#f59e0b', description: 'Particle Swarm (PSO), Genetic Algorithms (GA), Ant Colony (ACO)', columns: ['Search Strategy', 'Fitness Function', 'Population Size', 'Convergence Rate'] },
            { name: '3. Embedded & Regularized Models', color: '#10b981', description: 'LASSO (L1), ElasticNet, Tree Importance (Random Forest, XGBoost)', columns: ['Penalty Regularization', 'Sparsity Inducer', 'Optimization Solver', 'Stability'] },
            { name: '4. Hybrid & Multi-Stage Ensembles', color: '#a855f7', description: 'Filter-Wrapper Hybrids, Multi-objective Pareto Optimization', columns: ['Pipeline Stages', 'Pruning Ratio', 'Evaluation Classifier', 'Cross-Validation'] },
            { name: '5. Deep & Neural Feature Selection', color: '#6366f1', description: 'Concrete Autoencoders, Variational Dropout, Gated Attentive Networks', columns: ['Network Architecture', 'Gating Mechanism', 'Loss Function', 'Training Epochs'] },
            { name: '6. Graph Neural Networks (GNN) for Feature Graph', color: '#ec4899', description: 'Feature-Graph Attention, Relational Graph Embeddings', columns: ['Graph Representation', 'Message Passing', 'Neighborhood Aggregation', 'Hardware'] }
          ]
        },
        {
          name: 'Systematic NLP & Large Language Model (LLM) Benchmarking',
          category: 'Natural Language Processing',
          description: 'Standardized PRISMA-compliant survey template for evaluating Transformer architectures, fine-tuning techniques (LoRA, QLoRA), and RAG evaluation metrics.',
          clusters: [
            { name: '1. Instruction Tuning & Alignment (RLHF / DPO)', color: '#38bdf8', description: 'Reinforcement Learning from Human Feedback and Direct Preference Optimization', columns: ['Alignment Objective', 'Reward Model', 'KL Penalty', 'Evaluation Benchmark'] },
            { name: '2. Parameter-Efficient Fine-Tuning (PEFT / LoRA)', color: '#10b981', description: 'Low-Rank Adaptation, Prefix Tuning, Adapter Layers', columns: ['Rank Dimension (r)', 'Target Modules', 'Trainable Parameters (%)', 'VRAM Footprint'] },
            { name: '3. Retrieval-Augmented Generation (RAG)', color: '#f59e0b', description: 'Vector Embeddings, Hybrid BM25 Retrieval, Chunking Strategies', columns: ['Embedding Model', 'Vector Indexing (HNSW/FAISS)', 'Retrieval Precision@K', 'Faithfulness Score'] }
          ]
        }
      ];

      const insertTemplate = db.prepare(`
        INSERT INTO master_templates (name, category, description, clusters_json)
        VALUES (?, ?, ?, ?)
      `);
      defaultTemplates.forEach(t => {
        insertTemplate.run(t.name, t.category, t.description, JSON.stringify(t.clusters));
      });
    }
  } catch (seedErr) {
    console.warn('Seeding note:', seedErr.message);
  }

  return db;
}

module.exports = {
  getDb,
  initDb,
  hashPassword,
  verifyPassword,
  DB_PATH
};
