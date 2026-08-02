CREATE TABLE "public"."FilaNotificacaoGrupo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "status" "public"."QueueStatus" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FilaNotificacaoGrupo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."FilaNotificacaoUsuario" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."QueueStatus" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FilaNotificacaoUsuario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FilaNotificacaoGrupo_grupoId_status_key" ON "public"."FilaNotificacaoGrupo"("grupoId", "status");
CREATE INDEX "FilaNotificacaoGrupo_grupoId_ativo_idx" ON "public"."FilaNotificacaoGrupo"("grupoId", "ativo");
CREATE UNIQUE INDEX "FilaNotificacaoUsuario_userId_status_key" ON "public"."FilaNotificacaoUsuario"("userId", "status");
CREATE INDEX "FilaNotificacaoUsuario_userId_ativo_idx" ON "public"."FilaNotificacaoUsuario"("userId", "ativo");

ALTER TABLE "public"."FilaNotificacaoGrupo" ADD CONSTRAINT "FilaNotificacaoGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "public"."Grupo"("idGrupo") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FilaNotificacaoUsuario" ADD CONSTRAINT "FilaNotificacaoUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("idUser") ON DELETE CASCADE ON UPDATE CASCADE;
