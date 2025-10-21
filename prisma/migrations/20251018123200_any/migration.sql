/*
  Warnings:

  - You are about to drop the `community_requests` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `poll_options` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `polls` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `request_images` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `roles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `votes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."community_requests" DROP CONSTRAINT "community_requests_authorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."poll_options" DROP CONSTRAINT "poll_options_pollId_fkey";

-- DropForeignKey
ALTER TABLE "public"."request_images" DROP CONSTRAINT "request_images_requestId_fkey";

-- DropForeignKey
ALTER TABLE "public"."users" DROP CONSTRAINT "users_roleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."votes" DROP CONSTRAINT "votes_optionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."votes" DROP CONSTRAINT "votes_pollId_fkey";

-- DropForeignKey
ALTER TABLE "public"."votes" DROP CONSTRAINT "votes_userId_fkey";

-- DropTable
DROP TABLE "public"."community_requests";

-- DropTable
DROP TABLE "public"."poll_options";

-- DropTable
DROP TABLE "public"."polls";

-- DropTable
DROP TABLE "public"."request_images";

-- DropTable
DROP TABLE "public"."roles";

-- DropTable
DROP TABLE "public"."users";

-- DropTable
DROP TABLE "public"."votes";

-- DropEnum
DROP TYPE "public"."PollStatus";

-- DropEnum
DROP TYPE "public"."RequestStatus";

-- CreateTable
CREATE TABLE "public"."User" (
    "idUser" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "cpf" TEXT,
    "cep" TEXT,
    "phone" TEXT,
    "user_id_create" INTEGER,
    "user_id_update" INTEGER,
    "user_id_delete" INTEGER,
    "dt_delete" TIMESTAMP(3),
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "nivelAcessoId" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("idUser")
);

-- CreateTable
CREATE TABLE "public"."Nivel_Acesso" (
    "idNivelAcesso" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Nivel_Acesso_pkey" PRIMARY KEY ("idNivelAcesso")
);

-- CreateTable
CREATE TABLE "public"."Menu_Acesso" (
    "idMenuAcesso" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "visualizar" BOOLEAN NOT NULL DEFAULT false,
    "criar" BOOLEAN NOT NULL DEFAULT false,
    "editar" BOOLEAN NOT NULL DEFAULT false,
    "excluir" BOOLEAN NOT NULL DEFAULT false,
    "relatorio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Menu_Acesso_pkey" PRIMARY KEY ("idMenuAcesso")
);

-- CreateTable
CREATE TABLE "public"."_Menu_AcessoToNivel_Acesso" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_Menu_AcessoToNivel_Acesso_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_cpf_key" ON "public"."User"("cpf");

-- CreateIndex
CREATE INDEX "User_idUser_idx" ON "public"."User"("idUser");

-- CreateIndex
CREATE INDEX "User_user_id_create_idx" ON "public"."User"("user_id_create");

-- CreateIndex
CREATE INDEX "User_user_id_update_idx" ON "public"."User"("user_id_update");

-- CreateIndex
CREATE INDEX "User_user_id_delete_idx" ON "public"."User"("user_id_delete");

-- CreateIndex
CREATE INDEX "Nivel_Acesso_idNivelAcesso_idx" ON "public"."Nivel_Acesso"("idNivelAcesso");

-- CreateIndex
CREATE INDEX "_Menu_AcessoToNivel_Acesso_B_index" ON "public"."_Menu_AcessoToNivel_Acesso"("B");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_nivelAcessoId_fkey" FOREIGN KEY ("nivelAcessoId") REFERENCES "public"."Nivel_Acesso"("idNivelAcesso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_Menu_AcessoToNivel_Acesso" ADD CONSTRAINT "_Menu_AcessoToNivel_Acesso_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Menu_Acesso"("idMenuAcesso") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_Menu_AcessoToNivel_Acesso" ADD CONSTRAINT "_Menu_AcessoToNivel_Acesso_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Nivel_Acesso"("idNivelAcesso") ON DELETE CASCADE ON UPDATE CASCADE;
