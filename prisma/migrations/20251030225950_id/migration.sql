/*
  Warnings:

  - The primary key for the `Answer` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Answer` table. All the data in the column will be lost.
  - The primary key for the `Form` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Form` table. All the data in the column will be lost.
  - The primary key for the `Option` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Option` table. All the data in the column will be lost.
  - The primary key for the `Question` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Question` table. All the data in the column will be lost.
  - The primary key for the `Response` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Response` table. All the data in the column will be lost.
  - The required column `idAnswer` was added to the `Answer` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `idForm` was added to the `Form` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `idOption` was added to the `Option` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `idQuestion` was added to the `Question` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `idResponse` was added to the `Response` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_responseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Option" DROP CONSTRAINT "Option_questionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Question" DROP CONSTRAINT "Question_formId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Response" DROP CONSTRAINT "Response_formId_fkey";

-- AlterTable
ALTER TABLE "public"."Answer" DROP CONSTRAINT "Answer_pkey",
DROP COLUMN "id",
ADD COLUMN     "idAnswer" TEXT NOT NULL,
ADD CONSTRAINT "Answer_pkey" PRIMARY KEY ("idAnswer");

-- AlterTable
ALTER TABLE "public"."Form" DROP CONSTRAINT "Form_pkey",
DROP COLUMN "id",
ADD COLUMN     "idForm" TEXT NOT NULL,
ADD CONSTRAINT "Form_pkey" PRIMARY KEY ("idForm");

-- AlterTable
ALTER TABLE "public"."Option" DROP CONSTRAINT "Option_pkey",
DROP COLUMN "id",
ADD COLUMN     "idOption" TEXT NOT NULL,
ADD CONSTRAINT "Option_pkey" PRIMARY KEY ("idOption");

-- AlterTable
ALTER TABLE "public"."Question" DROP CONSTRAINT "Question_pkey",
DROP COLUMN "id",
ADD COLUMN     "idQuestion" TEXT NOT NULL,
ADD CONSTRAINT "Question_pkey" PRIMARY KEY ("idQuestion");

-- AlterTable
ALTER TABLE "public"."Response" DROP CONSTRAINT "Response_pkey",
DROP COLUMN "id",
ADD COLUMN     "idResponse" TEXT NOT NULL,
ADD CONSTRAINT "Response_pkey" PRIMARY KEY ("idResponse");

-- AddForeignKey
ALTER TABLE "public"."Question" ADD CONSTRAINT "Question_formId_fkey" FOREIGN KEY ("formId") REFERENCES "public"."Form"("idForm") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("idQuestion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Response" ADD CONSTRAINT "Response_formId_fkey" FOREIGN KEY ("formId") REFERENCES "public"."Form"("idForm") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "public"."Response"("idResponse") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."Question"("idQuestion") ON DELETE CASCADE ON UPDATE CASCADE;
