-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER', 'REVIEWER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'BANNED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('UNREAD', 'READING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScreeningDecision" AS ENUM ('INCLUDED', 'EXCLUDED', 'UNCERTAIN', 'PENDING');

-- CreateEnum
CREATE TYPE "ColumnType" AS ENUM ('TEXT', 'NUMBER', 'LATEX', 'TAGS', 'SELECT');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "institution" TEXT NOT NULL DEFAULT 'Academic Research Institute',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "bio" TEXT,
    "orcid" TEXT,
    "google_scholar" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "firebase_uid" TEXT,
    "ai_token_quota" INTEGER NOT NULL DEFAULT 100000,
    "ai_tokens_used" INTEGER NOT NULL DEFAULT 0,
    "storage_quota_mb" INTEGER NOT NULL DEFAULT 500,
    "storage_used_mb" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT NOT NULL DEFAULT 'Computer Science',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "share_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
    "invited_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dynamic_columns" (
    "id" SERIAL NOT NULL,
    "cluster_id" INTEGER NOT NULL,
    "column_name" TEXT NOT NULL,
    "parent_column_id" INTEGER,
    "col_type" "ColumnType" NOT NULL DEFAULT 'TEXT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dynamic_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_column_values" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "column_id" INTEGER NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_column_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL DEFAULT 1,
    "cluster_id" INTEGER,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "year" INTEGER,
    "pub" TEXT,
    "domain" TEXT,
    "doi" TEXT,
    "pdf_url" TEXT,
    "status" "PaperStatus" NOT NULL DEFAULT 'UNREAD',
    "intuition" TEXT,
    "equation" TEXT,
    "strengths" TEXT,
    "gaps" TEXT,
    "advantages" TEXT,
    "criticism" TEXT,
    "future_directions" TEXT,
    "screening_decision" "ScreeningDecision" NOT NULL DEFAULT 'PENDING',
    "screening_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_files" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size" INTEGER NOT NULL,
    "r2_object_key" TEXT,
    "r2_bucket" TEXT,
    "sha256" TEXT,
    "public_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_comments" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "user_role" TEXT DEFAULT 'reviewer',
    "comment_text" TEXT NOT NULL,
    "quote_text" TEXT,
    "page_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_highlights" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "user_role" TEXT DEFAULT 'reviewer',
    "page_number" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "color_label" TEXT,
    "selected_text" TEXT NOT NULL,
    "quads_json" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_screening" (
    "id" SERIAL NOT NULL,
    "paper_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "decision" "ScreeningDecision" NOT NULL,
    "exclusion_reason" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_screening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "user_email" TEXT,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "details" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "clusters_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_email_idx" ON "password_resets"("email");

-- CreateIndex
CREATE INDEX "password_resets_token_idx" ON "password_resets"("token");

-- CreateIndex
CREATE UNIQUE INDEX "projects_share_token_key" ON "projects"("share_token");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "clusters_project_id_idx" ON "clusters"("project_id");

-- CreateIndex
CREATE INDEX "dynamic_columns_cluster_id_idx" ON "dynamic_columns"("cluster_id");

-- CreateIndex
CREATE INDEX "dynamic_columns_parent_column_id_idx" ON "dynamic_columns"("parent_column_id");

-- CreateIndex
CREATE INDEX "paper_column_values_paper_id_idx" ON "paper_column_values"("paper_id");

-- CreateIndex
CREATE INDEX "paper_column_values_column_id_idx" ON "paper_column_values"("column_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_column_values_paper_id_column_id_key" ON "paper_column_values"("paper_id", "column_id");

-- CreateIndex
CREATE INDEX "papers_project_id_idx" ON "papers"("project_id");

-- CreateIndex
CREATE INDEX "papers_cluster_id_idx" ON "papers"("cluster_id");

-- CreateIndex
CREATE INDEX "papers_doi_idx" ON "papers"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "paper_files_paper_id_key" ON "paper_files"("paper_id");

-- CreateIndex
CREATE INDEX "keywords_paper_id_idx" ON "keywords"("paper_id");

-- CreateIndex
CREATE INDEX "keywords_keyword_idx" ON "keywords"("keyword");

-- CreateIndex
CREATE INDEX "paper_comments_paper_id_idx" ON "paper_comments"("paper_id");

-- CreateIndex
CREATE INDEX "paper_comments_user_id_idx" ON "paper_comments"("user_id");

-- CreateIndex
CREATE INDEX "paper_highlights_paper_id_idx" ON "paper_highlights"("paper_id");

-- CreateIndex
CREATE INDEX "paper_highlights_user_id_idx" ON "paper_highlights"("user_id");

-- CreateIndex
CREATE INDEX "paper_screening_paper_id_idx" ON "paper_screening"("paper_id");

-- CreateIndex
CREATE INDEX "paper_screening_user_id_idx" ON "paper_screening"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_screening_paper_id_user_id_key" ON "paper_screening"("paper_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dynamic_columns" ADD CONSTRAINT "dynamic_columns_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dynamic_columns" ADD CONSTRAINT "dynamic_columns_parent_column_id_fkey" FOREIGN KEY ("parent_column_id") REFERENCES "dynamic_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_column_values" ADD CONSTRAINT "paper_column_values_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_column_values" ADD CONSTRAINT "paper_column_values_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "dynamic_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_files" ADD CONSTRAINT "paper_files_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_highlights" ADD CONSTRAINT "paper_highlights_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_highlights" ADD CONSTRAINT "paper_highlights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_screening" ADD CONSTRAINT "paper_screening_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_screening" ADD CONSTRAINT "paper_screening_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

