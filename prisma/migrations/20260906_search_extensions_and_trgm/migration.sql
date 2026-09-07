-- Enable PostgreSQL Extensions for Full-Text & Trigram Search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add Generated Weighted tsvector Search Column to papers
ALTER TABLE "papers" ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("authors", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("domain", '') || ' ' || coalesce("pub", '')), 'C') ||
  setweight(to_tsvector('english', coalesce("intuition", '') || ' ' || coalesce("advantages", '') || ' ' || coalesce("strengths", '') || ' ' || coalesce("future_directions", '')), 'D')
) STORED;

-- Full-Text GIN Index
CREATE INDEX IF NOT EXISTS "papers_search_vector_idx" ON "papers" USING GIN ("search_vector");

-- Trigram Fuzzy Matching & Autocomplete Indexes
CREATE INDEX IF NOT EXISTS "papers_title_trgm_idx" ON "papers" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "papers_authors_trgm_idx" ON "papers" USING GIN ("authors" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "keywords_trgm_idx" ON "keywords" USING GIN ("keyword" gin_trgm_ops);
