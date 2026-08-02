import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

const membroInclude = {
    membros: {
        include: {
            user: {
                select: {
                    idUser: true,
                    name: true,
                    email: true,
                    avatar: true,
                    type: true,
                    active: true,
                    nivel_acesso: { select: { idNivelAcesso: true, nome: true } },
                },
            },
        },
        orderBy: { joinedAt: 'asc' as const },
    },
};

const afiliacaoInclude = {
    origem: { select: { idGrupo: true, nome: true } },
    destino: { select: { idGrupo: true, nome: true } },
    solicitadoPor: { select: { idUser: true, name: true, email: true } },
};

@Injectable()
export class GruposService {
    constructor(private prisma: PrismaService) { }

    async findAll() {
        return this.prisma.grupo.findMany({
            include: membroInclude,
            orderBy: { nome: 'asc' },
        });
    }

    async findAffiliations() {
        return this.prisma.grupoAfiliacao.findMany({ include: afiliacaoInclude, orderBy: { criadoEm: 'desc' } });
    }

    async findOne(idGrupo: number) {
        const grupo = await this.prisma.grupo.findUnique({
            where: { idGrupo },
            include: membroInclude,
        });
        if (!grupo) throw new NotFoundException('Grupo não encontrado.');
        return grupo;
    }

    async create(data: { nome: string; descricao?: string }, createdById?: string) {
        return this.prisma.grupo.create({
            data: {
                nome: data.nome,
                descricao: data.descricao,
                createdById: createdById || null,
            },
            include: membroInclude,
        });
    }

    async update(idGrupo: number, data: { nome?: string; descricao?: string }) {
        await this.findOne(idGrupo);
        return this.prisma.grupo.update({
            where: { idGrupo },
            data,
            include: membroInclude,
        });
    }

    async remove(idGrupo: number) {
        const grupo = await this.findOne(idGrupo);
        if ((grupo as any).isDefault) {
            throw new BadRequestException('O grupo padrão do sistema não pode ser excluído.');
        }
        await this.prisma.grupo.delete({ where: { idGrupo } });
        return { message: 'Grupo excluído com sucesso.' };
    }

    async addMembros(idGrupo: number, userIds: string[]) {
        await this.findOne(idGrupo);
        if (!userIds?.length) throw new BadRequestException('Informe ao menos um usuário.');

        const users = await this.prisma.user.findMany({
            where: { idUser: { in: userIds }, dt_delete: null },
            select: { idUser: true },
        });
        const validIds = users.map(u => u.idUser);
        if (!validIds.length) throw new BadRequestException('Nenhum usuário válido encontrado.');

        await this.prisma.grupo_Membro.createMany({
            data: validIds.map(userId => ({ grupoId: idGrupo, userId })),
            skipDuplicates: true,
        });

        return this.findOne(idGrupo);
    }

    async removeMembro(idGrupo: number, userId: string) {
        await this.prisma.grupo_Membro.deleteMany({
            where: { grupoId: idGrupo, userId },
        });
        return this.findOne(idGrupo);
    }

    async moveMembro(idGrupo: number, userId: string) {
        await this.findOne(idGrupo);
        await this.prisma.$transaction([
            this.prisma.grupo_Membro.deleteMany({ where: { userId } }),
            this.prisma.grupo_Membro.create({ data: { grupoId: idGrupo, userId } }),
        ]);
        return this.findOne(idGrupo);
    }

    async requestAffiliation(origemId: number, destinoId: number, solicitadoPorId?: string) {
        if (origemId === destinoId) throw new BadRequestException('Um grupo não pode se afiliar a ele mesmo.');
        const [origem, destino] = await Promise.all([
            this.prisma.grupo.findUnique({ where: { idGrupo: origemId } }),
            this.prisma.grupo.findUnique({ where: { idGrupo: destinoId } }),
        ]);
        if (!origem || !destino) throw new NotFoundException('Grupo de afiliação não encontrado.');
        const existing = await this.prisma.grupoAfiliacao.findFirst({ where: { OR: [{ origemId, destinoId }, { origemId: destinoId, destinoId: origemId }], status: { in: ['Pendente', 'Ativa'] } } });
        if (existing) throw new BadRequestException('Já existe uma solicitação ou afiliação entre esses grupos.');
        return this.prisma.grupoAfiliacao.create({ data: { origemId, destinoId, solicitadoPorId }, include: afiliacaoInclude });
    }

    async updateAffiliation(id: number, status: 'Ativa' | 'Recusada' | 'Encerrada') {
        const affiliation = await this.prisma.grupoAfiliacao.findUnique({ where: { id } });
        if (!affiliation) throw new NotFoundException('Afiliação não encontrada.');
        return this.prisma.grupoAfiliacao.update({ where: { id }, data: { status, respondidoEm: new Date() }, include: afiliacaoInclude });
    }

    private async expandAffiliatedGroups(groupIds: number[]): Promise<number[]> {
        const known = new Set(groupIds);
        let frontier = [...known];
        while (frontier.length) {
            const links = await this.prisma.grupoAfiliacao.findMany({ where: { status: 'Ativa', OR: [{ origemId: { in: frontier } }, { destinoId: { in: frontier } }] }, select: { origemId: true, destinoId: true } });
            const next: number[] = [];
            for (const link of links) {
                for (const id of [link.origemId, link.destinoId]) if (!known.has(id)) { known.add(id); next.push(id); }
            }
            frontier = next;
        }
        return [...known];
    }

    /**
     * Calcula o escopo de visibilidade de dados para um usuário.
     * Retorna null quando o usuário vê tudo (Admin / Admin Prefeitura),
     * ou os IDs de usuários visíveis + os IDs dos grupos aos quais pertence.
     */
    async getScopeForUser(user: any): Promise<{ visibleUserIds: string[]; groupIds: number[] } | null> {
        if (!user) return null; // sem informação do usuário → sem escopo (compatibilidade)

        const nivel = user.nivelAcessoId ?? user.nivel_acesso?.idNivelAcesso;
        if (user.type === 'ADMIN' || nivel === 2 || nivel === 3) return null;

        const memberships = await this.prisma.grupo_Membro.findMany({
            where: { userId: user.idUser },
            select: { grupoId: true },
        });
        const groupIds = await this.expandAffiliatedGroups(memberships.map(m => m.grupoId));

        let visibleUserIds: string[];
        if (!groupIds.length) {
            visibleUserIds = [user.idUser];
        } else {
            const membros = await this.prisma.grupo_Membro.findMany({
                where: { grupoId: { in: groupIds } },
                select: { userId: true },
            });
            const ids = new Set<string>(membros.map(m => m.userId));
            ids.add(user.idUser);
            visibleUserIds = [...ids];
        }

        return { visibleUserIds, groupIds };
    }

    /**
     * Retorna os IDs de usuários cujos dados o usuário pode ver:
     * ele próprio + todos os membros dos grupos aos quais pertence.
     */
    async getVisibleUserIds(userId: string): Promise<string[]> {
        const memberships = await this.prisma.grupo_Membro.findMany({
            where: { userId },
            select: { grupoId: true },
        });

        if (!memberships.length) return [userId];

        const grupoIds = await this.expandAffiliatedGroups(memberships.map(m => m.grupoId));
        const membros = await this.prisma.grupo_Membro.findMany({
            where: { grupoId: { in: grupoIds } },
            select: { userId: true },
        });

        const ids = new Set<string>(membros.map(m => m.userId));
        ids.add(userId);
        return [...ids];
    }
}
