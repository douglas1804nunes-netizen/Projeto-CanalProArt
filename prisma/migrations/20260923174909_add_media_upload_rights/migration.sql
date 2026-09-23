-- AlterTable
ALTER TABLE "media_uploads" ADD COLUMN     "containsSyntheticMedia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rightsStatus" "RightsStatus";
