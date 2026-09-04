ALTER TABLE "SupplyGroup" ADD COLUMN "isCampaign" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "CampaignStage" AS ENUM ('IDEIA', 'IMAGEM', 'AGENDADA', 'PUBLICADA');
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "stage" "CampaignStage" NOT NULL DEFAULT 'IDEIA',
  "scheduledAt" TIMESTAMP(3),
  "imageUrl" TEXT,
  "instagramPostId" TEXT,
  "emailSubject" TEXT,
  "emailBody" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_stage_idx" ON "Campaign"("stage");
CREATE INDEX "Campaign_scheduledAt_idx" ON "Campaign"("scheduledAt");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("idUser") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "CampaignSupply" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "supplyId" TEXT NOT NULL,
  "expectedQuantity" INTEGER NOT NULL,
  "campaignEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSupply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignSupply_campaignId_supplyId_key" ON "CampaignSupply"("campaignId", "supplyId");
CREATE INDEX "CampaignSupply_supplyId_idx" ON "CampaignSupply"("supplyId");
ALTER TABLE "CampaignSupply" ADD CONSTRAINT "CampaignSupply_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignSupply" ADD CONSTRAINT "CampaignSupply_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
