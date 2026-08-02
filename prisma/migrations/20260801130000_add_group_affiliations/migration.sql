CREATE TYPE "public"."GrupoAfiliacaoStatus" AS ENUM ('Pendente', 'Ativa', 'Recusada', 'Encerrada');

CREATE TABLE "public"."GrupoAfiliacao" (
    "id" SERIAL NOT NULL,
    "origemId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "status" "public"."GrupoAfiliacaoStatus" NOT NULL DEFAULT 'Pendente',
    "solicitadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "respondidoEm" TIMESTAMP(3),
    CONSTRAINT "GrupoAfiliacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrupoAfiliacao_origemId_destinoId_key" ON "public"."GrupoAfiliacao"("origemId", "destinoId");
CREATE INDEX "GrupoAfiliacao_origemId_status_idx" ON "public"."GrupoAfiliacao"("origemId", "status");
CREATE INDEX "GrupoAfiliacao_destinoId_status_idx" ON "public"."GrupoAfiliacao"("destinoId", "status");

ALTER TABLE "public"."GrupoAfiliacao" ADD CONSTRAINT "GrupoAfiliacao_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "public"."Grupo"("idGrupo") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GrupoAfiliacao" ADD CONSTRAINT "GrupoAfiliacao_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "public"."Grupo"("idGrupo") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."GrupoAfiliacao" ADD CONSTRAINT "GrupoAfiliacao_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "public"."User"("idUser") ON DELETE SET NULL ON UPDATE CASCADE;
