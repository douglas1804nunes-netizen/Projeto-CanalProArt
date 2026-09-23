-- CreateTable
CREATE TABLE "search_videos" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_videos_videoId_idx" ON "search_videos"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "search_videos_searchId_videoId_key" ON "search_videos"("searchId", "videoId");

-- AddForeignKey
ALTER TABLE "search_videos" ADD CONSTRAINT "search_videos_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_videos" ADD CONSTRAINT "search_videos_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
