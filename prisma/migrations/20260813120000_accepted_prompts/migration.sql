-- CreateTable
CREATE TABLE "AcceptedPrompt" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "shotIdea" TEXT NOT NULL,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcceptedPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedPrompt_sku_shotIdea_key" ON "AcceptedPrompt"("sku", "shotIdea");

-- CreateIndex
CREATE INDEX "AcceptedPrompt_sku_idx" ON "AcceptedPrompt"("sku");

-- AddForeignKey
ALTER TABLE "AcceptedPrompt" ADD CONSTRAINT "AcceptedPrompt_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: copy any existing Product.shotIdea into AcceptedPrompt before dropping the
-- column, so pre-existing catalog shot ideas (e.g. sample data's HG-002) aren't lost.
INSERT INTO "AcceptedPrompt" ("id", "sku", "shotIdea", "imageUrl", "source", "approvedBy", "requestId", "createdAt")
SELECT gen_random_uuid()::text, "sku", "shotIdea", NULL, 'csv', 'csv-import', NULL, "updatedAt"
FROM "Product"
WHERE "shotIdea" IS NOT NULL AND trim("shotIdea") <> '';

-- DropColumn
ALTER TABLE "Product" DROP COLUMN "shotIdea";
