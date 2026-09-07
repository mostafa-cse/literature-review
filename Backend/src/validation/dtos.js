require('reflect-metadata');
const {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsIn,
  Matches,
  IsBoolean,
  IsArray,
} = require('class-validator');

// Helper to attach decorators cleanly in CommonJS
function applyDecorators(Class, prop, ...decorators) {
  for (const dec of decorators) {
    dec(Class.prototype, prop);
  }
}

// ======================================================================
// 1. WORKER QUEUE JOB DTOs
// ======================================================================

class ProcessPdfJobDto {
  constructor(data = {}) {
    this.paperId = data.paperId;
    this.projectId = data.projectId;
    this.originalFilename = data.originalFilename;
    this.localPath = data.localPath;
  }
}
applyDecorators(ProcessPdfJobDto, 'paperId', IsInt({ message: 'paperId must be an integer' }), Min(1, { message: 'paperId must be at least 1' }));
applyDecorators(ProcessPdfJobDto, 'projectId', IsOptional(), IsInt({ message: 'projectId must be an integer' }), Min(1));
applyDecorators(ProcessPdfJobDto, 'originalFilename', IsOptional(), IsString({ message: 'originalFilename must be a string' }));
applyDecorators(ProcessPdfJobDto, 'localPath', IsOptional(), IsString({ message: 'localPath must be a string' }));

class CrossRefJobDto {
  constructor(data = {}) {
    this.doi = data.doi;
    this.paperId = data.paperId;
    this.title = data.title;
    this.projectId = data.projectId;
  }
}
applyDecorators(CrossRefJobDto, 'doi', IsString({ message: 'Valid DOI is required' }), MinLength(5, { message: 'Valid DOI is required' }));
applyDecorators(CrossRefJobDto, 'paperId', IsOptional(), IsInt({ message: 'paperId must be an integer' }), Min(1));
applyDecorators(CrossRefJobDto, 'title', IsOptional(), IsString({ message: 'title must be a string' }));
applyDecorators(CrossRefJobDto, 'projectId', IsOptional(), IsInt({ message: 'projectId must be an integer' }), Min(1));

class CitationExportJobDto {
  constructor(data = {}) {
    this.projectId = data.projectId ?? 1;
    this.clusterId = data.clusterId;
    this.format = data.format ?? 'xlsx';
    this.selectedColumns = data.selectedColumns;
  }
}
applyDecorators(CitationExportJobDto, 'projectId', IsOptional(), IsInt({ message: 'projectId must be an integer' }), Min(1));
applyDecorators(CitationExportJobDto, 'clusterId', IsOptional(), IsInt({ message: 'clusterId must be an integer' }));
applyDecorators(CitationExportJobDto, 'format', IsIn(['xlsx', 'bibtex', 'bib', 'ris', 'csv', 'json'], {
  message: "format must be 'xlsx', 'bibtex', 'bib', 'ris', 'csv', or 'json'",
}));
applyDecorators(CitationExportJobDto, 'selectedColumns', IsOptional(), IsArray({ message: 'selectedColumns must be an array of strings' }));

// ======================================================================
// 2. DOMAIN MUTATION DTOs
// ======================================================================

class CreatePaperDto {
  constructor(data = {}) {
    this.projectId = data.projectId ?? 1;
    this.clusterId = data.clusterId;
    this.title = data.title;
    this.authors = data.authors ?? 'Academic Researchers';
    this.year = data.year;
    this.pub = data.pub;
    this.doi = data.doi;
    this.domain = data.domain ?? 'General';
    this.status = data.status ?? 'unread';
    this.intuition = data.intuition;
  }
}
applyDecorators(CreatePaperDto, 'projectId', IsInt({ message: 'projectId must be an integer' }), Min(1));
applyDecorators(CreatePaperDto, 'clusterId', IsOptional(), IsInt({ message: 'clusterId must be an integer' }));
applyDecorators(CreatePaperDto, 'title', IsString({ message: 'Paper title is required' }), MinLength(2, { message: 'Title must be at least 2 characters' }), MaxLength(300, { message: 'Title cannot exceed 300 characters' }));
applyDecorators(CreatePaperDto, 'authors', IsOptional(), IsString({ message: 'authors must be a string' }));
applyDecorators(CreatePaperDto, 'year', IsOptional(), IsInt({ message: 'Year must be a 4-digit number between 1900 and 2100' }), Min(1900), Max(2100));
applyDecorators(CreatePaperDto, 'pub', IsOptional(), IsString());
applyDecorators(CreatePaperDto, 'doi', IsOptional(), IsString());
applyDecorators(CreatePaperDto, 'domain', IsOptional(), IsString());
applyDecorators(CreatePaperDto, 'status', IsOptional(), IsIn(['unread', 'reading', 'analyzed', 'synthesized', 'rejected'], {
  message: "status must be 'unread', 'reading', 'analyzed', 'synthesized', or 'rejected'",
}));
applyDecorators(CreatePaperDto, 'intuition', IsOptional(), IsString());

class CellUpdateDto {
  constructor(data = {}) {
    this.paperId = data.paperId;
    this.columnId = data.columnId;
    this.value = data.value;
  }
}
applyDecorators(CellUpdateDto, 'paperId', IsInt({ message: 'paperId must be an integer' }), Min(1));
applyDecorators(CellUpdateDto, 'columnId', IsInt({ message: 'columnId must be an integer' }), Min(1));
applyDecorators(CellUpdateDto, 'value', IsString({ message: 'value must be a string' }));

class TaxonomyClusterDto {
  constructor(data = {}) {
    this.projectId = data.projectId;
    this.name = data.name;
    this.description = data.description ?? '';
    this.color = data.color ?? '#38bdf8';
    this.sortOrder = data.sortOrder ?? 0;
  }
}
applyDecorators(TaxonomyClusterDto, 'projectId', IsInt({ message: 'projectId must be an integer' }), Min(1));
applyDecorators(TaxonomyClusterDto, 'name', IsString({ message: 'Cluster name is required' }), MinLength(2, { message: 'Cluster name must be at least 2 characters' }), MaxLength(100));
applyDecorators(TaxonomyClusterDto, 'description', IsOptional(), IsString(), MaxLength(500));
applyDecorators(TaxonomyClusterDto, 'color', Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
  message: 'color must be a valid hex color code (e.g. #38bdf8)',
}));
applyDecorators(TaxonomyClusterDto, 'sortOrder', IsOptional(), IsInt());

class ProjectCreateDto {
  constructor(data = {}) {
    this.name = data.name;
    this.description = data.description ?? '';
    this.domain = data.domain ?? 'General';
    this.isPublic = data.isPublic ?? false;
  }
}
applyDecorators(ProjectCreateDto, 'name', IsString({ message: 'Project name is required' }), MinLength(2, { message: 'Project name must be at least 2 characters' }), MaxLength(150));
applyDecorators(ProjectCreateDto, 'description', IsOptional(), IsString(), MaxLength(1000));
applyDecorators(ProjectCreateDto, 'domain', IsOptional(), IsString());
applyDecorators(ProjectCreateDto, 'isPublic', IsOptional(), IsBoolean({ message: 'isPublic must be a boolean' }));

module.exports = {
  ProcessPdfJobDto,
  CrossRefJobDto,
  CitationExportJobDto,
  CreatePaperDto,
  CellUpdateDto,
  TaxonomyClusterDto,
  ProjectCreateDto,
};
