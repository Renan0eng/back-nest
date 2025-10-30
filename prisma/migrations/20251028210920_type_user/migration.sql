-- CreateEnum
CREATE TYPE "public"."EnumUserType" AS ENUM ('ADMIN', 'USUARIO', 'PACIENTE');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "type" "public"."EnumUserType" NOT NULL DEFAULT 'PACIENTE';
