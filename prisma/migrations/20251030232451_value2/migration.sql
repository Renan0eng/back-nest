/*
  Warnings:

  - You are about to drop the column `value` on the `Question` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Option" ADD COLUMN     "value" INTEGER;

-- AlterTable
ALTER TABLE "public"."Question" DROP COLUMN "value";
