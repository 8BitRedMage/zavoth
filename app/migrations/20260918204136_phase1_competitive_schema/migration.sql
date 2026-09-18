-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PortfolioKind" AS ENUM ('COMPETITOR', 'VENDOR', 'INVESTOR', 'PARTNER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PortfolioTier" AS ENUM ('PRIMARY', 'SECONDARY', 'WATCH');

-- CreateEnum
CREATE TYPE "Signal" AS ENUM ('WEBSITE', 'HIRING', 'SENTIMENT', 'STOCK', 'NEWS');

-- CreateEnum
CREATE TYPE "TrackerStatus" AS ENUM ('OK', 'ERROR', 'RATE_LIMITED', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "TouchpointKind" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'DEMO', 'NOTE', 'WON_DEAL', 'LOST_DEAL');

-- CreateEnum
CREATE TYPE "ManualImportStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "touchpointId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","orgId")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PortfolioKind" NOT NULL DEFAULT 'COMPETITOR',
    "description" TEXT,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "portfolioId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "tier" "PortfolioTier",
    "notes" TEXT,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("portfolioId","entityId")
);

-- CreateTable
CREATE TABLE "TrackedEntity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "parentId" TEXT,
    "ticker" TEXT,
    "exchange" TEXT,
    "careersUrl" TEXT,
    "atsProvider" TEXT,
    "subreddits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enrichedAt" TIMESTAMP(3),

    CONSTRAINT "TrackedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "entityId" TEXT NOT NULL,
    "signal" "Signal" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "intervalMin" INTEGER NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "TrackerStatus",
    "lastError" TEXT,

    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTag" (
    "tagId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "EntityTag_pkey" PRIMARY KEY ("tagId","entityId")
);

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "TouchpointKind" NOT NULL DEFAULT 'NOTE',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualImport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orgId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "signal" "Signal" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "fileId" TEXT,
    "text" TEXT,
    "status" "ManualImportStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ManualImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE INDEX "Portfolio_orgId_idx" ON "Portfolio"("orgId");

-- CreateIndex
CREATE INDEX "PortfolioItem_entityId_idx" ON "PortfolioItem"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEntity_domain_key" ON "TrackedEntity"("domain");

-- CreateIndex
CREATE INDEX "TrackedEntity_parentId_idx" ON "TrackedEntity"("parentId");

-- CreateIndex
CREATE INDEX "Tracker_enabled_nextRunAt_idx" ON "Tracker"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tracker_entityId_signal_key" ON "Tracker"("entityId", "signal");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_orgId_name_key" ON "Tag"("orgId", "name");

-- CreateIndex
CREATE INDEX "EntityTag_entityId_idx" ON "EntityTag"("entityId");

-- CreateIndex
CREATE INDEX "Touchpoint_orgId_entityId_occurredAt_idx" ON "Touchpoint"("orgId", "entityId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualImport_fileId_key" ON "ManualImport"("fileId");

-- CreateIndex
CREATE INDEX "ManualImport_entityId_signal_idx" ON "ManualImport"("entityId", "signal");

-- CreateIndex
CREATE INDEX "ManualImport_status_idx" ON "ManualImport"("status");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_touchpointId_fkey" FOREIGN KEY ("touchpointId") REFERENCES "Touchpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TrackedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedEntity" ADD CONSTRAINT "TrackedEntity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TrackedEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TrackedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTag" ADD CONSTRAINT "EntityTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTag" ADD CONSTRAINT "EntityTag_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TrackedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TrackedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualImport" ADD CONSTRAINT "ManualImport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualImport" ADD CONSTRAINT "ManualImport_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TrackedEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualImport" ADD CONSTRAINT "ManualImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualImport" ADD CONSTRAINT "ManualImport_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
