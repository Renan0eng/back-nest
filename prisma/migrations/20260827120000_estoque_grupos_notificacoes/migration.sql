CREATE TABLE "SupplyGroup" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplyGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplyGroup_name_key" ON "SupplyGroup"("name");
ALTER TABLE "Supply" ADD COLUMN "supplyGroupId" INTEGER;
CREATE INDEX "Supply_supplyGroupId_idx" ON "Supply"("supplyGroupId");
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_supplyGroupId_fkey" FOREIGN KEY ("supplyGroupId") REFERENCES "SupplyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserNotification" ADD COLUMN "confirmedAt" TIMESTAMP(3);
