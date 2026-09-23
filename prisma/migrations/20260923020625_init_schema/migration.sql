-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('ORIGINAL', 'AUTHORIZED', 'LICENSED', 'PUBLIC_DOMAIN');

-- CreateEnum
CREATE TYPE "TrendClassification" AS ENUM ('RISING', 'HOT', 'STABLE', 'DECLINING');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DISMISSED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "ContentProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PublishedVideoStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT,
    "regionCode" TEXT NOT NULL,
    "categoryId" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "categoryId" TEXT,
    "tags" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_metrics" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "viewCount" BIGINT NOT NULL,
    "likeCount" BIGINT NOT NULL,
    "commentCount" BIGINT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trends" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "trendScore" DOUBLE PRECISION NOT NULL,
    "classification" "TrendClassification" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_videos" (
    "id" TEXT NOT NULL,
    "trendId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trendId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ContentProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL,
    "contentProjectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "aiProvider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_titles" (
    "id" TEXT NOT NULL,
    "contentProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_descriptions" (
    "id" TEXT NOT NULL,
    "contentProjectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_videos" (
    "id" TEXT NOT NULL,
    "contentProjectId" TEXT NOT NULL,
    "youtubeAccountId" TEXT NOT NULL,
    "youtubeVideoId" TEXT,
    "rightsStatus" "RightsStatus" NOT NULL,
    "containsSyntheticMedia" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublishedVideoStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_accounts_channelId_key" ON "youtube_accounts"("channelId");

-- CreateIndex
CREATE INDEX "youtube_accounts_userId_idx" ON "youtube_accounts"("userId");

-- CreateIndex
CREATE INDEX "searches_userId_idx" ON "searches"("userId");

-- CreateIndex
CREATE INDEX "searches_fetchedAt_idx" ON "searches"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtubeVideoId_key" ON "videos"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "videos_channelId_idx" ON "videos"("channelId");

-- CreateIndex
CREATE INDEX "videos_publishedAt_idx" ON "videos"("publishedAt");

-- CreateIndex
CREATE INDEX "videos_fetchedAt_idx" ON "videos"("fetchedAt");

-- CreateIndex
CREATE INDEX "video_metrics_fetchedAt_idx" ON "video_metrics"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "video_metrics_videoId_fetchedAt_key" ON "video_metrics"("videoId", "fetchedAt");

-- CreateIndex
CREATE INDEX "trends_userId_idx" ON "trends"("userId");

-- CreateIndex
CREATE INDEX "trends_trendScore_idx" ON "trends"("trendScore");

-- CreateIndex
CREATE INDEX "trends_fetchedAt_idx" ON "trends"("fetchedAt");

-- CreateIndex
CREATE INDEX "trend_videos_videoId_idx" ON "trend_videos"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "trend_videos_trendId_videoId_key" ON "trend_videos"("trendId", "videoId");

-- CreateIndex
CREATE INDEX "opportunities_userId_idx" ON "opportunities"("userId");

-- CreateIndex
CREATE INDEX "opportunities_trendId_idx" ON "opportunities"("trendId");

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

-- CreateIndex
CREATE INDEX "content_projects_userId_idx" ON "content_projects"("userId");

-- CreateIndex
CREATE INDEX "content_projects_opportunityId_idx" ON "content_projects"("opportunityId");

-- CreateIndex
CREATE INDEX "content_projects_status_idx" ON "content_projects"("status");

-- CreateIndex
CREATE INDEX "scripts_contentProjectId_idx" ON "scripts"("contentProjectId");

-- CreateIndex
CREATE INDEX "generated_titles_contentProjectId_idx" ON "generated_titles"("contentProjectId");

-- CreateIndex
CREATE INDEX "generated_descriptions_contentProjectId_idx" ON "generated_descriptions"("contentProjectId");

-- CreateIndex
CREATE INDEX "published_videos_contentProjectId_idx" ON "published_videos"("contentProjectId");

-- CreateIndex
CREATE INDEX "published_videos_youtubeAccountId_idx" ON "published_videos"("youtubeAccountId");

-- CreateIndex
CREATE INDEX "published_videos_status_idx" ON "published_videos"("status");

-- CreateIndex
CREATE INDEX "published_videos_publishedAt_idx" ON "published_videos"("publishedAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "youtube_accounts" ADD CONSTRAINT "youtube_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "searches" ADD CONSTRAINT "searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_metrics" ADD CONSTRAINT "video_metrics_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trends" ADD CONSTRAINT "trends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_videos" ADD CONSTRAINT "trend_videos_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "trends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_videos" ADD CONSTRAINT "trend_videos_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "trends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_projects" ADD CONSTRAINT "content_projects_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_titles" ADD CONSTRAINT "generated_titles_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_descriptions" ADD CONSTRAINT "generated_descriptions_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_videos" ADD CONSTRAINT "published_videos_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_videos" ADD CONSTRAINT "published_videos_youtubeAccountId_fkey" FOREIGN KEY ("youtubeAccountId") REFERENCES "youtube_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
