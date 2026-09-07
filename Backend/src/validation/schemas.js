const { z } = require('zod');

// ======================================================================
// 1. ROUTE PARAMETER SCHEMAS
// ======================================================================

const idParamSchema = z.object({
  id: z.coerce.number({ invalid_type_error: 'ID must be a numeric integer' }).int().positive('ID must be a positive integer'),
});

const clusterIdParamSchema = z.object({
  id: z.union([
    z.coerce.number().int().positive(),
    z.literal('all'),
    z.literal('unassigned'),
  ]),
});

const jobParamSchema = z.object({
  queueName: z.enum(
    ['pdf-processing-queue', 'crossref-enrichment-queue', 'citation-export-queue'],
    { message: "queueName must be 'pdf-processing-queue', 'crossref-enrichment-queue', or 'citation-export-queue'" }
  ),
  jobId: z.string().min(1, 'jobId parameter is required'),
});

const tokenParamSchema = z.object({
  token: z.string().min(1, 'Token parameter is required'),
});

const exportTokenParamSchema = z.object({
  exportToken: z.string().min(1, 'exportToken parameter is required'),
});

// ======================================================================
// 2. QUERY PARAMETER SCHEMAS
// ======================================================================

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['year_desc', 'year_asc', 'title_asc', 'title_desc', 'id_asc', 'id_desc']).default('year_desc'),
});

const paperFilterQuerySchema = z.object({
  project_id: z.coerce.number().int().positive().optional(),
  cluster_id: z.union([z.coerce.number().int().positive(), z.literal('all'), z.literal('unassigned')]).optional(),
  domain: z.string().optional(),
  status: z.enum(['all', 'unread', 'reading', 'analyzed', 'synthesized', 'rejected']).optional(),
  search: z.string().optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  sort: z.string().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query parameter q is required'),
  project_id: z.coerce.number().int().positive().optional(),
  mode: z.enum(['auto', 'fts', 'fuzzy']).default('auto'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const exportQuerySchema = z.object({
  format: z.enum(['xlsx', 'bibtex', 'bib', 'ris', 'csv', 'json']).default('xlsx'),
  project_id: z.coerce.number().int().positive().optional(),
  cluster_id: z.union([z.coerce.number().int().positive(), z.literal('all')]).optional(),
  cols: z.string().optional(),
  columns: z.string().optional(),
});

// ======================================================================
// 3. AUTHENTICATION & USER SCHEMAS
// ======================================================================

const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  institution: z.string().optional().default(''),
  role: z.enum(['admin', 'researcher', 'user']).optional().default('researcher'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  institution: z.string().optional(),
  avatar: z.string().optional(),
});

// ======================================================================
// 4. PROJECT & SURVEY SCHEMAS
// ======================================================================

const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(150, 'Project name cannot exceed 150 characters'),
  description: z.string().max(1000).optional().default(''),
  domain: z.string().max(100).optional().default('General'),
  is_public: z.coerce.boolean().optional().default(false),
});

const updateProjectSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional(),
  domain: z.string().max(100).optional(),
  is_public: z.coerce.boolean().optional(),
});

const addMemberSchema = z.object({
  email: z.string().email('Invalid member email address'),
  role: z.enum(['owner', 'editor', 'reviewer', 'viewer'], {
    message: "Role must be 'owner', 'editor', 'reviewer', or 'viewer'",
  }).default('viewer'),
});

// ======================================================================
// 5. TAXONOMY CLUSTER SCHEMAS
// ======================================================================

const createClusterSchema = z.object({
  project_id: z.coerce.number().int().positive('project_id must be a positive integer'),
  name: z.string().min(2, 'Cluster name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().default(''),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code (e.g. #38bdf8)').default('#38bdf8'),
  sort_order: z.coerce.number().int().optional().default(0),
});

const updateClusterSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color must be a valid hex code').optional(),
  sort_order: z.coerce.number().int().optional(),
});

const reorderClustersSchema = z.object({
  cluster_ids: z.array(z.coerce.number().int().positive()).min(1, 'cluster_ids array cannot be empty'),
});

// ======================================================================
// 6. DYNAMIC COLUMN SCHEMAS
// ======================================================================

const createColumnSchema = z.object({
  project_id: z.coerce.number().int().positive().optional().default(1),
  cluster_id: z.coerce.number().int().positive().optional(),
  column_name: z.string().min(1, 'Column name is required').max(100),
  col_type: z.enum(['text', 'number', 'boolean', 'rating', 'select', 'formula']).default('text'),
  parent_column_id: z.coerce.number().int().positive().nullable().optional(),
});

const splitColumnSchema = z.object({
  sub_columns: z.array(z.string().min(1, 'Sub-column name cannot be empty')).min(1, 'At least one sub-column name is required'),
});

const setCellValueSchema = z.object({
  paper_id: z.coerce.number().int().positive('paper_id must be a positive integer'),
  column_id: z.coerce.number().int().positive('column_id must be a positive integer'),
  value: z.union([z.string(), z.number(), z.boolean()]).transform(v => String(v)),
});

const batchCellValuesSchema = z.object({
  values: z.array(setCellValueSchema).min(1, 'Values array cannot be empty'),
});

// ======================================================================
// 7. PAPER SCHEMAS
// ======================================================================

const createPaperSchema = z.object({
  project_id: z.coerce.number().int().positive().default(1),
  cluster_id: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(2, 'Paper title must be at least 2 characters'),
  authors: z.string().default('Academic Researchers'),
  year: z.union([z.coerce.number().int().min(1900).max(2100), z.string()]).transform(v => String(v)).default(() => String(new Date().getFullYear())),
  pub: z.string().default(''),
  doi: z.string().default(''),
  domain: z.string().default('General'),
  status: z.enum(['unread', 'reading', 'analyzed', 'synthesized', 'rejected']).default('unread'),
  intuition: z.string().default(''),
  pdf_url: z.string().default(''),
});

const updatePaperSchema = z.object({
  cluster_id: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(2).optional(),
  authors: z.string().optional(),
  year: z.union([z.coerce.number().int().min(1900).max(2100), z.string()]).transform(v => String(v)).optional(),
  pub: z.string().optional(),
  doi: z.string().optional(),
  domain: z.string().optional(),
  status: z.enum(['unread', 'reading', 'analyzed', 'synthesized', 'rejected']).optional(),
  intuition: z.string().optional(),
  pdf_url: z.string().optional(),
});

const patchStatusSchema = z.object({
  status: z.enum(['unread', 'reading', 'analyzed', 'synthesized', 'rejected'], {
    message: "status must be 'unread', 'reading', 'analyzed', 'synthesized', or 'rejected'",
  }),
});

const bulkAssignSchema = z.object({
  paper_ids: z.array(z.coerce.number().int().positive()).min(1, 'paper_ids array cannot be empty'),
  target_cluster_id: z.union([z.coerce.number().int().positive(), z.literal('unassigned'), z.null()]).optional(),
  target_project_id: z.coerce.number().int().positive().optional(),
});

// ======================================================================
// 8. BACKGROUND JOBS & ASYNC TASK SCHEMAS
// ======================================================================

const processPdfJobSchema = z.object({
  paperId: z.coerce.number().int().positive('paperId must be a positive integer'),
  projectId: z.coerce.number().int().positive().optional(),
  originalFilename: z.string().optional(),
});

const enrichDoiJobSchema = z.object({
  doi: z.string().min(5, 'DOI is required'),
  paperId: z.coerce.number().int().positive().optional(),
  title: z.string().optional(),
  projectId: z.coerce.number().int().positive().optional(),
});

const asyncExportSchema = z.object({
  project_id: z.coerce.number().int().positive().default(1),
  cluster_id: z.coerce.number().int().positive().nullable().optional(),
  format: z.enum(['xlsx', 'bibtex', 'bib', 'ris', 'csv', 'json']).default('xlsx'),
  selectedColumns: z.array(z.string()).optional(),
});

module.exports = {
  // Params
  idParamSchema,
  clusterIdParamSchema,
  jobParamSchema,
  tokenParamSchema,
  exportTokenParamSchema,

  // Queries
  paginationQuerySchema,
  paperFilterQuerySchema,
  searchQuerySchema,
  exportQuerySchema,

  // Auth
  registerSchema,
  loginSchema,
  updateProfileSchema,

  // Projects
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,

  // Clusters
  createClusterSchema,
  updateClusterSchema,
  reorderClustersSchema,

  // Columns
  createColumnSchema,
  splitColumnSchema,
  setCellValueSchema,
  batchCellValuesSchema,

  // Papers
  createPaperSchema,
  updatePaperSchema,
  patchStatusSchema,
  bulkAssignSchema,

  // Jobs
  processPdfJobSchema,
  enrichDoiJobSchema,
  asyncExportSchema,
};
