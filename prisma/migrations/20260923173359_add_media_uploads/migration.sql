-- CreateTable
CREATE TABLE "media_uploads" (
    "id" TEXT NOT NULL,
    "contentProjectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_uploads_contentProjectId_key" ON "media_uploads"("contentProjectId");

-- AddForeignKey
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_contentProjectId_fkey" FOREIGN KEY ("contentProjectId") REFERENCES "content_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
