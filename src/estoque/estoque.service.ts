import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateSupplyDto, MovimentacaoDto, UpdateSupplyDto, UpdateSupplyGroupDto } from './dto/estoque.dto';
import { NotificationsService } from '../notifications/notifications.service';

/** Deriva o status de estoque a partir do saldo e do mínimo. */
function stockStatus(balance: number, minStock: number): 'OK' | 'Baixo' | 'Critico' {
    if (balance <= 0) return 'Critico';
    if (balance <= minStock) return 'Baixo';
    if (balance <= minStock * 1.5) return 'Baixo';
    return 'OK';
}

@Injectable()
export class EstoqueService {
    constructor(private prisma: PrismaService, private notifications: NotificationsService) { }

    async findAll(grupoId?: number, deleted = false) {
        await this.ensureExpiryNotifications();
        const supplies = await this.prisma.supply.findMany({
            where: { deletedAt: deleted ? { not: null } : null, ...(grupoId ? { grupoId } : {}) },
            orderBy: { name: 'asc' },
            include: { supplyGroup: true },
        });
        return supplies.map((s) => ({ ...s, status: stockStatus(s.balance, s.minStock) }));
    }

    async findOne(id: string) {
        const supply = await this.prisma.supply.findFirst({
            where: { id, deletedAt: null },
            include: { movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
        });
        if (!supply) throw new NotFoundException('Insumo não encontrado.');
        return { ...supply, status: stockStatus(supply.balance, supply.minStock) };
    }

    create(dto: CreateSupplyDto) {
        return this.prisma.supply.create({
            data: {
                name: dto.name,
                unit: dto.unit,
                balance: dto.balance ?? 0,
                minStock: dto.minStock ?? 0,
                lot: dto.lot ?? null,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
                grupoId: dto.grupoId ?? null,
                supplyGroupId: dto.supplyGroupId ?? null,
            },
        });
    }

    async update(id: string, dto: UpdateSupplyDto) {
        await this.findOne(id);
        return this.prisma.supply.update({
            where: { id },
            data: {
                name: dto.name,
                unit: dto.unit,
                minStock: dto.minStock,
                lot: dto.lot,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
                supplyGroupId: dto.supplyGroupId,
            },
        });
    }

    /** Soft delete — mantém o histórico de movimentações. */
    async remove(id: string) {
        await this.findOne(id);
        await this.prisma.supply.update({ where: { id }, data: { deletedAt: new Date() } });
        return { message: 'Insumo removido.' };
    }

    async restore(id: string) {
        const supply = await this.prisma.supply.findFirst({ where: { id, deletedAt: { not: null } } });
        if (!supply) throw new NotFoundException('Insumo excluído não encontrado.');
        await this.prisma.supply.update({ where: { id }, data: { deletedAt: null } });
        return this.findOne(id);
    }

    /** Entrada/saída de estoque com ajuste de saldo transacional. */
    async movimentar(id: string, dto: MovimentacaoDto, userId?: string) {
        const supply = await this.prisma.supply.findFirst({ where: { id, deletedAt: null } });
        if (!supply) throw new NotFoundException('Insumo não encontrado.');

        const delta = dto.type === 'Entrada' ? dto.quantity : -dto.quantity;
        if (dto.type === 'Saida' && supply.expiresAt && supply.expiresAt <= new Date()) {
            throw new BadRequestException(`O lote ${supply.lot || ''} de ${supply.name} está vencido e não pode ser utilizado.`);
        }
        if (dto.type === 'Entrada' && dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
            throw new BadRequestException('A validade do lote de entrada deve ser futura.');
        }
        const newBalance = supply.balance + delta;
        if (newBalance < 0) {
            throw new BadRequestException(`Saldo insuficiente. Disponível: ${supply.balance} ${supply.unit}.`);
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.supplyMovement.create({
                data: {
                    supplyId: id,
                    type: dto.type,
                    quantity: dto.quantity,
                    reason: dto.reason ?? null,
                    lot: dto.lot ?? supply.lot ?? null,
                    expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : supply.expiresAt,
                    attendanceId: dto.attendanceId ?? null,
                    userId: userId ?? null,
                },
            });
            return tx.supply.update({ where: { id }, data: { balance: newBalance, ...(dto.type === 'Entrada' && dto.lot ? { lot: dto.lot } : {}), ...(dto.type === 'Entrada' && dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}) } });
        });
    }

    async movimentacoes(id: string) {
        await this.findOne(id);
        return this.prisma.supplyMovement.findMany({
            where: { supplyId: id },
            orderBy: { createdAt: 'desc' },
        });
    }

    async groups() {
        return this.prisma.supplyGroup.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { supplies: true } } } });
    }

    createGroup(dto: UpdateSupplyGroupDto) {
        if (!dto.name?.trim()) throw new BadRequestException('O nome do grupo é obrigatório.');
        return this.prisma.supplyGroup.create({ data: { name: dto.name!.trim(), description: dto.description?.trim() || null, isCampaign: dto.isCampaign ?? false } });
    }

    async updateGroup(id: number, dto: UpdateSupplyGroupDto) {
        return this.prisma.supplyGroup.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description?.trim(), isCampaign: dto.isCampaign } });
    }

    async removeGroup(id: number) {
        await this.prisma.supplyGroup.delete({ where: { id } });
        return { message: 'Grupo removido. Os insumos ficaram sem grupo.' };
    }

    async notificationHistory() {
        return this.prisma.userNotification.findMany({
            where: { notification: { category: 'estoque-validade' } }, orderBy: { createdAt: 'desc' }, take: 200,
            include: { user: { select: { idUser: true, name: true, email: true } }, notification: { select: { title: true, body: true, createdAt: true, data: true } } },
        });
    }

    private async ensureExpiryNotifications() {
        const limit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const expiring = await this.prisma.supply.findMany({ where: { deletedAt: null, expiresAt: { lte: limit } } });
        if (!expiring.length) return;
        const users = await this.prisma.user.findMany({
            where: { dt_delete: null, nivel_acesso: { permissoes: { some: { menu_acesso: { slug: { in: ['notificar-perciveis', 'notificar-perciveis-obrigatorio'] } } } } } },
            select: { idUser: true, nivel_acesso: { include: { permissoes: { include: { menu_acesso: true } } } } },
        });
        for (const supply of expiring) {
            const mandatory = users.filter(u => u.nivel_acesso?.permissoes.some(p => p.menu_acesso.slug === 'notificar-perciveis-obrigatorio')).map(u => u.idUser);
            const recipients = Array.from(new Set(users.map(u => u.idUser)));
            if (!recipients.length) continue;
            const existing = await this.prisma.notification.findFirst({ where: { category: 'estoque-validade', data: { path: ['supplyId'], equals: supply.id } } });
            if (existing) continue;
            await this.notifications.create({
                title: 'Validade de insumo próxima',
                body: `${supply.name} vence em ${supply.expiresAt!.toLocaleDateString('pt-BR')}. Verifique o lote e providencie a substituição.`,
                category: 'estoque-validade', priority: 2,
                data: { supplyId: supply.id, expiresAt: supply.expiresAt!.toISOString(), mandatoryUserIds: mandatory, route: '/admin/estoque' },
                targets: { userIds: recipients }, sendPush: true,
            } as any);
        }
    }
}
