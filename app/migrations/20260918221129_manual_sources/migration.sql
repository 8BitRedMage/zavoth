-- AlterTable
ALTER TABLE "ManualImport" ADD COLUMN     "data" JSONB,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "TrackedEntity" ADD COLUMN     "profileUrls" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "ManualImport_orgId_entityId_source_capturedAt_idx" ON "ManualImport"("orgId", "entityId", "source", "capturedAt");
