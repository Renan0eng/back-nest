import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QueueStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { EscalaGateway } from 'src/escala/escala.gateway';
import { EscalaService } from 'src/escala/escala.service';
import { NotificationHelperService } from 'src/notifications/notification-helper.service';
import { CallTicketDto, CreateTicketDto } from './dto/fila.dto';

const ticketInclude = {
    patient: { select: { idUser: true, name: true } },
    doctor: { select: { idUser: true, name: true } },
    appointment: { select: { id: true, scheduledAt: true, status: true, modality: true } },
};

// Prefixo da senha por prioridade
const PREFIX: Record<string, string> = { Normal: 'N', Preferencial: 'P', Urgencia: 'A' };

@Injectable()
export class FilaService {
    constructor(private prisma: PrismaService, private escalaGateway: EscalaGateway, private escalaService: EscalaService, private notifications: NotificationHelperService) { }

    private readonly notificationStatuses: QueueStatus[] = ['Aguardando', 'Chamado', 'EmAtendimento', 'Concluido'];

    private isGlobalAdmin(user: any) {
        return user?.type === 'ADMIN' || [2, 3].includes(user?.nivelAcessoId ?? user?.nivel_acesso?.idNivelAcesso);
    }

    private async managedGroupIds(user: any): Promise<number[]> {
        if (this.isGlobalAdmin(user)) {
            const groups = await this.prisma.grupo.findMany({ select: { idGrupo: true } });
            return groups.map(g => g.idGrupo);
        }
        const groups = await this.prisma.grupo.findMany({ where: { createdById: user?.idUser }, select: { idGrupo: true } });
        return groups.map(g => g.idGrupo);
    }

    async notificationConfig(user: any) {
        const memberships = await this.prisma.grupo_Membro.findMany({ where: { userId: user.idUser }, select: { grupoId: true } });
        const managed = await this.managedGroupIds(user);
        const groupIds = [...new Set([...memberships.map(m => m.grupoId), ...managed])];
        const [groupSettings, personalSettings] = await Promise.all([
            this.prisma.filaNotificacaoGrupo.findMany({ where: { grupoId: { in: groupIds }, ativo: true } }),
            this.prisma.filaNotificacaoUsuario.findMany({ where: { userId: user.idUser } }),
        ]);
        const groupForced = Object.fromEntries(this.notificationStatuses.map(status => [status, groupSettings.some(s => s.status === status)]));
        const pessoal = Object.fromEntries(this.notificationStatuses.map(status => [status, personalSettings.find(s => s.status === status)?.ativo ?? false]));
        return { permission: true, canManageGroup: managed.length > 0, groupForced, pessoal, effective: Object.fromEntries(this.notificationStatuses.map(status => [status, groupForced[status] || pessoal[status]])) };
    }

    async setGroupNotification(user: any, status: QueueStatus, ativo: boolean) {
        if (!this.notificationStatuses.includes(status)) throw new BadRequestException('Coluna de fila inválida.');
        const grupoIds = await this.managedGroupIds(user);
        if (!grupoIds.length) throw new BadRequestException('Você não administra nenhum grupo.');
        await this.prisma.filaNotificacaoGrupo.deleteMany({ where: { grupoId: { in: grupoIds }, status } });
        await this.prisma.filaNotificacaoGrupo.createMany({ data: grupoIds.map(grupoId => ({ grupoId, status, ativo })) });
        return this.notificationConfig(user);
    }

    async setPersonalNotification(user: any, status: QueueStatus, ativo: boolean) {
        if (!this.notificationStatuses.includes(status)) throw new BadRequestException('Coluna de fila inválida.');
        await this.prisma.filaNotificacaoUsuario.upsert({ where: { userId_status: { userId: user.idUser, status } }, update: { ativo }, create: { userId: user.idUser, status, ativo } });
        return this.notificationConfig(user);
    }

    private async notifyQueueTicket(ticket: { id: string; code: string; setor: string; status: QueueStatus; doctorId: string | null; grupoId: number | null }) {
        if (!this.notificationStatuses.includes(ticket.status)) return;
        const now = new Date();
        const shifts = await this.prisma.plantao.findMany({
            where: { setor: ticket.setor, startsAt: { lte: now }, endsAt: { gt: now }, status: { in: ['Agendado', 'EmAndamento'] }, doctorId: { not: null } },
            select: { id: true, doctorId: true, grupoId: true },
        });
        const matchingShift = shifts.find((shift) => ticket.grupoId && shift.grupoId === ticket.grupoId) ?? shifts[0];
        const resolvedDoctorId = ticket.doctorId ?? matchingShift?.doctorId ?? null;
        if (!resolvedDoctorId) return;
        const notificationGroupId = matchingShift?.grupoId ?? ticket.grupoId ?? null;
        const groupForced = notificationGroupId ? await this.prisma.filaNotificacaoGrupo.findFirst({ where: { grupoId: notificationGroupId, status: ticket.status, ativo: true } }) : null;
        const personal = groupForced ? null : await this.prisma.filaNotificacaoUsuario.findUnique({ where: { userId_status: { userId: resolvedDoctorId, status: ticket.status } } });
        if (!groupForced && !personal?.ativo) return;
        if (!ticket.doctorId) {
            const shiftBody = `Senha ${ticket.code} (${ticket.setor}) está na coluna ${ticket.status}.`;
            void this.notifications.sendToUser(resolvedDoctorId, { title: 'Nova senha na fila de atendimento', body: shiftBody, route: '/admin/fila', data: { type: 'fila_atendimento', ticketId: ticket.id, status: ticket.status } });
            this.escalaGateway.emitQueueNotification({ doctorId: resolvedDoctorId, ticketId: ticket.id, code: ticket.code, status: ticket.status, setor: ticket.setor });
            for (const shift of shifts) void this.escalaService.logQueueNotification(shift.id, `Notificou o médico sobre a senha ${ticket.code} da fila (${ticket.status}).`);
            return;
        }
        const body = `Senha ${ticket.code} (${ticket.setor}) está na coluna ${ticket.status}.`;
        void this.notifications.sendToUser(ticket.doctorId, { title: 'Atualização da fila de atendimento', body, route: '/admin/fila', data: { type: 'fila_atendimento', ticketId: ticket.id, status: ticket.status } });
        this.escalaGateway.emitQueueNotification({ doctorId: ticket.doctorId, ticketId: ticket.id, code: ticket.code, status: ticket.status, setor: ticket.setor });
        for (const shift of shifts) void this.escalaService.logQueueNotification(shift.id, `Notificou o médico sobre a senha ${ticket.code} da fila (${ticket.status}).`);
    }

    /**
     * Sinaliza a mudança para os cards de plantão abertos (fixo/flutuante), que
     * reagem ao `escala:changed` refazendo o fetch dos atendimentos. Sem isso, o
     * histórico de atendimentos do plantão não atualizava em tempo real ao concluir
     * uma senha. Best-effort: nunca deixa a falha do socket quebrar a operação.
     */
    private notifyEscala() {
        try { this.escalaGateway.emitChange({ type: 'updated' }); } catch { /* ignore */ }
    }

    findAll(status?: QueueStatus, grupoId?: number, deleted = false) {
        return this.prisma.queueTicket.findMany({
            where: {
                status: status || undefined,
                grupoId: grupoId ?? undefined,
                issuedAt: { gte: startOfToday() },
                dt_delete: deleted ? { not: null } : null,
            },
            include: ticketInclude,
            orderBy: deleted
                ? [{ dt_delete: 'desc' }]
                : [{ priority: 'desc' }, { issuedAt: 'asc' }],
        });
    }

    async stats(grupoId?: number) {
        const where = { grupoId: grupoId ?? undefined, issuedAt: { gte: startOfToday() }, dt_delete: null };
        const [aguardando, chamado, emAtendimento, concluidos] = await Promise.all([
            this.prisma.queueTicket.count({ where: { ...where, status: 'Aguardando' } }),
            this.prisma.queueTicket.count({ where: { ...where, status: 'Chamado' } }),
            this.prisma.queueTicket.count({ where: { ...where, status: 'EmAtendimento' } }),
            this.prisma.queueTicket.findMany({
                where: { ...where, status: 'Concluido', calledAt: { not: null } },
                select: { issuedAt: true, calledAt: true },
            }),
        ]);

        // Espera média (emissão → chamada), em segundos
        let avgWaitSeconds = 0;
        if (concluidos.length) {
            const total = concluidos.reduce((acc, t) => acc + ((t.calledAt!.getTime() - t.issuedAt.getTime()) / 1000), 0);
            avgWaitSeconds = Math.round(total / concluidos.length);
        }

        return { aguardando, chamado, emAtendimento, concluidos: concluidos.length, avgWaitSeconds };
    }

    async create(dto: CreateTicketDto, actor?: any) {
        let patientId = dto.patientId ?? null;
        let patientName = dto.patientName ?? null;
        let doctorId: string | null = null;
        let grupoId = dto.grupoId ?? null;

        // Senha originada de um agendamento: herda paciente e médico.
        if (dto.appointmentId) {
            const appointment = await this.prisma.appointment.findUnique({
                where: { id: dto.appointmentId },
                include: { patient: { select: { idUser: true, name: true } } },
            });
            if (!appointment || appointment.dt_delete) {
                throw new NotFoundException('Agendamento não encontrado.');
            }
            const existing = await this.prisma.queueTicket.findFirst({
                where: {
                    appointmentId: dto.appointmentId,
                    status: { in: ['Aguardando', 'Chamado', 'EmAtendimento'] },
                    issuedAt: { gte: startOfToday() },
                    dt_delete: null,
                },
            });
            if (existing) {
                throw new BadRequestException(`Este agendamento já possui a senha ${existing.code} na fila.`);
            }
            patientId = patientId ?? appointment.patientId;
            patientName = patientName ?? appointment.patient?.name ?? null;
            doctorId = appointment.doctorId ?? null;
        }

        // Senhas sem grupo explícito herdam o grupo do usuário que emitiu a senha
        // ou, no caso de agendamento, o primeiro grupo do médico atribuído.
        if (!grupoId) {
            const ownerId = actor?.idUser || doctorId;
            if (ownerId) {
                const membership = await this.prisma.grupo_Membro.findFirst({ where: { userId: ownerId }, select: { grupoId: true } });
                grupoId = membership?.grupoId ?? null;
            }
        }

        if (!patientId && !patientName) {
            throw new BadRequestException('Informe o paciente (cadastro ou nome).');
        }
        const priority = dto.priority ?? 'Normal';
        const code = await this.nextCode(priority);

        const ticket = await this.prisma.queueTicket.create({
            data: {
                code,
                setor: dto.setor,
                priority,
                patientId,
                patientName,
                doctorId,
                appointmentId: dto.appointmentId ?? null,
                grupoId,
            },
            include: ticketInclude,
        });
        void this.notifyQueueTicket(ticket);
        this.notifyEscala();
        return ticket;
    }

    async call(id: string, dto: CallTicketDto) {
        const ticket = await this.get(id);
        if (ticket.status !== 'Aguardando') throw new BadRequestException('Esta senha não está aguardando.');
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { status: 'Chamado', calledAt: new Date(), doctorId: dto.doctorId ?? ticket.doctorId ?? null },
            include: ticketInclude,
        });
        void this.notifyQueueTicket(updated);
        this.notifyEscala();
        return updated;
    }

    async confirm(id: string) {
        const ticket = await this.get(id);
        if (ticket.status !== 'Chamado') throw new BadRequestException('Só é possível confirmar uma senha chamada.');
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { status: 'EmAtendimento', confirmedAt: new Date() },
            include: ticketInclude,
        });
        void this.notifyQueueTicket(updated);
        this.notifyEscala();
        return updated;
    }

    async finish(id: string, attendanceId?: string) {
        await this.get(id);
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: {
                status: 'Concluido',
                closedAt: new Date(),
                ...(attendanceId ? { attendanceId } : {}),
            },
            include: ticketInclude,
        });
        void this.notifyQueueTicket(updated);
        this.notifyEscala();
        return updated;
    }

    async cancel(id: string) {
        await this.get(id);
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { status: 'Cancelado', closedAt: new Date() },
            include: ticketInclude,
        });
        this.notifyEscala();
        return updated;
    }

    async miss(id: string) {
        await this.get(id);
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { status: 'Faltou', closedAt: new Date() },
            include: ticketInclude,
        });
        this.notifyEscala();
        return updated;
    }

    /** Soft delete de uma senha. */
    async remove(id: string) {
        const ticket = await this.get(id);
        if (ticket.dt_delete) throw new BadRequestException('Esta senha já está excluída.');
        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { dt_delete: new Date() },
            include: ticketInclude,
        });
        this.notifyEscala();
        return updated;
    }

    /**
     * Restaura uma senha excluída. Se a senha veio de um agendamento e esse
     * agendamento já possui outra senha ativa, a restauração é bloqueada.
     */
    async restore(id: string) {
        const ticket = await this.prisma.queueTicket.findUnique({ where: { id } });
        if (!ticket) throw new NotFoundException('Senha não encontrada.');
        if (!ticket.dt_delete) throw new BadRequestException('Esta senha não está excluída.');

        if (ticket.appointmentId) {
            const active = await this.prisma.queueTicket.findFirst({
                where: {
                    appointmentId: ticket.appointmentId,
                    id: { not: id },
                    status: { in: ['Aguardando', 'Chamado', 'EmAtendimento'] },
                    dt_delete: null,
                },
            });
            if (active) {
                throw new BadRequestException(
                    `Não é possível restaurar: o agendamento já possui a senha ativa ${active.code}.`,
                );
            }
        }

        const updated = await this.prisma.queueTicket.update({
            where: { id },
            data: { dt_delete: null },
            include: ticketInclude,
        });
        this.notifyEscala();
        return updated;
    }

    private async get(id: string) {
        const ticket = await this.prisma.queueTicket.findUnique({ where: { id } });
        if (!ticket) throw new NotFoundException('Senha não encontrada.');
        return ticket;
    }

    private async nextCode(priority: string): Promise<string> {
        const prefix = PREFIX[priority] ?? 'N';
        const count = await this.prisma.queueTicket.count({
            where: { priority: priority as any, issuedAt: { gte: startOfToday() } },
        });
        return `${prefix}-${String(count + 1).padStart(3, '0')}`;
    }
}

function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
