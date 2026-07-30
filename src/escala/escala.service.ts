import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlantaoEventType } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CreatePlantaoDto, UpdatePlantaoDto } from './dto/plantao.dto';
import { EscalaChange, EscalaGateway } from './escala.gateway';

const doctorInclude = {
    doctor: { select: { idUser: true, name: true, avatar: true, especialidade: true } },
};

@Injectable()
export class EscalaService {
    constructor(private prisma: PrismaService, private gateway: EscalaGateway) { }

    /** Papel exibido na timeline (Médico para médicos; senão o nome do nível). */
    private roleOf(user: any): string {
        if (user?.type === 'MEDICO') return 'Médico';
        return user?.nivel_acesso?.nome || 'Sistema';
    }

    /** Registra um evento de histórico do plantão. */
    private async logEvent(plantaoId: string, type: PlantaoEventType, user: any, detail?: string | null) {
        await this.prisma.plantaoEvent.create({
            data: {
                plantaoId,
                type,
                detail: detail ?? null,
                actorId: user?.idUser ?? null,
                actorName: user?.name ?? null,
                actorRole: this.roleOf(user),
            },
        });
    }

    /** Executa a mutação, registra o evento e emite o sinal em tempo real. */
    private async record<T extends { id: string }>(
        p: Promise<T>,
        opts: { event: PlantaoEventType; user: any; detail?: string | null; change: EscalaChange['type'] },
    ): Promise<T> {
        const r = await p;
        await this.logEvent(r.id, opts.event, opts.user, opts.detail);
        this.gateway.emitChange({ type: opts.change, id: r.id });
        return r;
    }

    /** Histórico de eventos do plantão (para a timeline). */
    history(id: string) {
        return this.prisma.plantaoEvent.findMany({
            where: { plantaoId: id },
            include: { actor: { select: { idUser: true, name: true, avatar: true, type: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Senhas/atendimentos do plantão.
     *
     * Não há vínculo direto no banco: uma senha pertence ao plantão quando é do
     * MESMO SETOR e foi GERADA enquanto o plantão estava ATIVO — ou seja, entre um
     * check-in e o check-out/devolução do médico.
     *
     * Os períodos ativos são reconstruídos a partir do LOG DE EVENTOS (permanente),
     * e não das colunas `checkinAt`/`checkoutAt` — que são zeradas ao devolver o
     * plantão ao mercado. Assim o histórico de atendimentos NÃO some quando o
     * plantão é devolvido, e vários ciclos de check-in/out são respeitados.
     */
    async atendimentos(id: string) {
        const plantao = await this.prisma.plantao.findFirst({
            where: { id, deletedAt: null },
            select: { id: true, setor: true, checkinAt: true, checkoutAt: true },
        });
        if (!plantao) throw new NotFoundException('Plantão não encontrado.');

        // Períodos ativos = intervalos entre CheckIn e o CheckOut/Devolvido/Removido seguinte.
        // Cada intervalo guarda o SETOR que estava ativo naquele check-in (evento `detail`),
        // para o vínculo sobreviver a edições de setor posteriores.
        const events = await this.prisma.plantaoEvent.findMany({
            where: { plantaoId: id },
            select: { type: true, detail: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
        const intervals: { start: Date; end: Date; setor: string }[] = [];
        let open: { start: Date; setor: string } | null = null;
        for (const e of events) {
            if (e.type === 'CheckIn') {
                if (open === null) open = { start: e.createdAt, setor: e.detail ?? plantao.setor };
            } else if (e.type === 'CheckOut' || e.type === 'Devolvido' || e.type === 'Removido') {
                if (open !== null) { intervals.push({ ...open, end: e.createdAt }); open = null; }
            }
        }
        // Check-in ainda aberto (plantão em andamento) → conta até agora.
        if (open !== null) intervals.push({ ...open, end: new Date() });
        // Fallback p/ dados sem eventos de check-in mas com a coluna preenchida.
        if (intervals.length === 0 && plantao.checkinAt) {
            intervals.push({ start: plantao.checkinAt, end: plantao.checkoutAt ?? new Date(), setor: plantao.setor });
        }
        if (intervals.length === 0) return [];

        const windowStart = intervals.reduce((min, iv) => (iv.start < min ? iv.start : min), intervals[0].start);
        const windowEnd = intervals.reduce((max, iv) => (iv.end > max ? iv.end : max), intervals[0].end);
        const setores = Array.from(new Set(intervals.map((iv) => iv.setor)));

        const tickets = await this.prisma.queueTicket.findMany({
            where: {
                setor: { in: setores },
                dt_delete: null,
                issuedAt: { gte: windowStart, lte: windowEnd },
            },
            include: {
                patient: { select: { idUser: true, name: true } },
                doctor: { select: { idUser: true, name: true } },
                attendance: {
                    select: {
                        id: true, diagnosis: true, treatment: true, chiefComplaint: true,
                        status: true, createdAt: true, updatedAt: true,
                    },
                },
            },
            orderBy: { issuedAt: 'asc' },
        });

        // Mantém só as senhas geradas dentro de algum período ativo E no setor que
        // estava ativo naquele período (imune a edições de setor posteriores).
        return tickets.filter((t) => intervals.some((iv) => t.setor === iv.setor && t.issuedAt >= iv.start && t.issuedAt <= iv.end)).map((t) => {
            const waitEnd = t.calledAt ?? t.confirmedAt;
            const waitMs = waitEnd ? waitEnd.getTime() - t.issuedAt.getTime() : null;
            const consultStart = t.confirmedAt ?? t.calledAt;
            const consultMs = consultStart && t.closedAt ? t.closedAt.getTime() - consultStart.getTime() : null;
            return {
                id: t.id,
                code: t.code,
                patientName: t.patient?.name ?? t.patientName ?? 'Paciente',
                doctorName: t.doctor?.name ?? null,
                setor: t.setor,
                status: t.status,
                attendanceId: t.attendanceId,
                issuedAt: t.issuedAt,
                calledAt: t.calledAt,
                confirmedAt: t.confirmedAt,
                closedAt: t.closedAt,
                waitSeconds: waitMs != null ? Math.round(waitMs / 1000) : null,
                consultSeconds: consultMs != null ? Math.round(consultMs / 1000) : null,
                attendance: t.attendance,
            };
        });
    }

    /** Usuário cujo nível possui o menu escala-admin. */
    private isEscalaAdmin(user: any): boolean {
        return (user?.nivel_acesso?.menus || []).some((m: any) => m?.slug === 'escala-admin');
    }

    /** Admin da escala pode solicitar novamente o check-in de um plantão atrasado. */
    async notifyCheckin(id: string, user?: any) {
        if (!this.isEscalaAdmin(user)) {
            throw new ForbiddenException('Apenas o Escala de Plantão Admin pode solicitar check-in.');
        }

        const plantao = await this.findOne(id);
        const now = new Date();
        if (!plantao.doctorId || plantao.status !== 'Agendado' || now < plantao.startsAt || now >= plantao.endsAt) {
            throw new BadRequestException('Este plantão não está aguardando check-in.');
        }

        await this.logEvent(
            id,
            'NotificacaoCheckIn',
            user,
            'Solicitou check-in ao médico atribuído',
        );
        this.gateway.emitCheckinReminder({
            id,
            doctorId: plantao.doctorId,
            notifiedAt: now.toISOString(),
        });

        return { message: 'Solicitação de check-in enviada.', notifiedAt: now.toISOString() };
    }

    /** Check-in, check-out e devolução só pelo próprio médico do plantão ou por um admin da escala. */
    private assertCanManageShift(plantao: { doctorId: string | null }, user: any) {
        if (this.isEscalaAdmin(user)) return;
        if (plantao.doctorId && plantao.doctorId === user?.idUser) return;
        throw new ForbiddenException('Apenas o médico do plantão ou o Escala de Plantão Admin podem realizar esta ação.');
    }

    findAll(filter: { from?: string; to?: string; setor?: string; grupoId?: number; deleted?: boolean }) {
        return this.prisma.plantao.findMany({
            where: {
                deletedAt: filter.deleted ? { not: null } : null,
                setor: filter.setor || undefined,
                grupoId: filter.grupoId ?? undefined,
                startsAt: filter.from ? { gte: new Date(filter.from) } : undefined,
                endsAt: filter.to ? { lte: new Date(filter.to) } : undefined,
            },
            include: doctorInclude,
            orderBy: { startsAt: 'asc' },
        });
    }

    async findOne(id: string) {
        const plantao = await this.prisma.plantao.findFirst({ where: { id, deletedAt: null }, include: doctorInclude });
        if (!plantao) throw new NotFoundException('Plantão não encontrado.');
        return plantao;
    }

    async create(dto: CreatePlantaoDto, user?: any) {
        if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
            throw new BadRequestException('O fim do plantão deve ser depois do início.');
        }

        // Sem médico → plantão Aberto (mercado). Com médico → Agendado.
        let doctorName: string | null = null;
        if (dto.doctorId) {
            const doctor = await this.prisma.user.findFirst({ where: { idUser: dto.doctorId, type: 'MEDICO' } });
            if (!doctor) throw new BadRequestException('Médico não encontrado.');
            await this.assertNoOverlap(dto.doctorId, dto.startsAt, dto.endsAt);
            doctorName = doctor.name;
        }

        return this.record(this.prisma.plantao.create({
            data: {
                doctorId: dto.doctorId ?? null,
                setor: dto.setor,
                startsAt: new Date(dto.startsAt),
                endsAt: new Date(dto.endsAt),
                grupoId: dto.grupoId ?? null,
                status: dto.doctorId ? 'Agendado' : 'Aberto',
            },
            include: doctorInclude,
        }), { event: 'Criado', user, detail: doctorName, change: 'created' });
    }

    /** Um médico do grupo "pega" um plantão aberto. */
    async pegar(id: string, user: any) {
        const userId = user?.idUser;
        const medico = await this.prisma.user.findFirst({ where: { idUser: userId, type: 'MEDICO' } });
        if (!medico) throw new BadRequestException('Apenas médicos podem pegar um plantão.');

        const plantao = await this.findOne(id);
        if (plantao.status !== 'Aberto' || plantao.doctorId) {
            throw new BadRequestException('Este plantão não está mais disponível.');
        }

        await this.assertNoOverlap(userId, plantao.startsAt.toISOString(), plantao.endsAt.toISOString());

        return this.record(this.prisma.plantao.update({
            where: { id },
            data: { doctorId: userId, status: 'Agendado' },
            include: doctorInclude,
        }), { event: 'Pegou', user, change: 'updated' });
    }

    /** Devolve um plantão para o mercado (fica Aberto de novo). */
    async liberar(id: string, user?: any) {
        const plantao = await this.findOne(id);
        this.assertCanManageShift(plantao, user);
        if (plantao.status === 'Concluido' || plantao.status === 'Cancelado') {
            throw new BadRequestException('Este plantão não pode ser liberado.');
        }
        return this.record(this.prisma.plantao.update({
            where: { id },
            data: { doctorId: null, status: 'Aberto', checkinAt: null, checkoutAt: null },
            include: doctorInclude,
        }), { event: 'Devolvido', user, change: 'updated' });
    }

    private async assertNoOverlap(doctorId: string, startsAt: string, endsAt: string, excludeId?: string) {
        const overlap = await this.prisma.plantao.findFirst({
            where: {
                id: excludeId ? { not: excludeId } : undefined,
                doctorId,
                deletedAt: null,
                status: { notIn: ['Cancelado', 'Aberto'] },
                startsAt: { lt: new Date(endsAt) },
                endsAt: { gt: new Date(startsAt) },
            },
        });
        if (overlap) throw new BadRequestException('Este médico já tem um plantão nesse horário.');
    }

    async update(id: string, dto: UpdatePlantaoDto, user?: any) {
        const current = await this.findOne(id);

        const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
        const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
        if (endsAt <= startsAt) {
            throw new BadRequestException('O fim do plantão deve ser depois do início.');
        }

        const data: any = {
            setor: dto.setor,
            startsAt: dto.startsAt ? startsAt : undefined,
            endsAt: dto.endsAt ? endsAt : undefined,
            grupoId: dto.grupoId,
        };

        // Tipo de evento: por padrão "Editado" (ex.: mover/redimensionar/alterar setor).
        let event: PlantaoEventType = 'Editado';
        let detail: string | null = null;

        // Reatribuição de médico (só quando doctorId vem no payload — ex.: modal de edição).
        // O move/resize por arraste não envia doctorId e mantém o médico atual.
        if (dto.doctorId !== undefined) {
            const newDoctorId = dto.doctorId || null;
            if (newDoctorId) {
                const doctor = await this.prisma.user.findFirst({ where: { idUser: newDoctorId, type: 'MEDICO' } });
                if (!doctor) throw new BadRequestException('Médico não encontrado.');
                await this.assertNoOverlap(newDoctorId, startsAt.toISOString(), endsAt.toISOString(), id);
                if (newDoctorId !== current.doctorId) { event = 'Atribuido'; detail = doctor.name; }
            } else if (current.doctorId) {
                event = 'Devolvido';
            }
            data.doctorId = newDoctorId;
            if (!newDoctorId) data.status = 'Aberto';
            else if (current.status === 'Aberto') data.status = 'Agendado';
        }

        return this.record(this.prisma.plantao.update({
            where: { id },
            data,
            include: doctorInclude,
        }), { event, user, detail, change: 'updated' });
    }

    /** Soft delete. */
    async remove(id: string, user?: any) {
        await this.findOne(id);
        await this.prisma.plantao.update({ where: { id }, data: { deletedAt: new Date() } });
        await this.logEvent(id, 'Removido', user);
        this.gateway.emitChange({ type: 'deleted', id });
        return { message: 'Plantão removido.' };
    }

    async restore(id: string, user?: any) {
        const plantao = await this.prisma.plantao.findFirst({ where: { id, deletedAt: { not: null } } });
        if (!plantao) throw new NotFoundException('Plantão excluído não encontrado.');
        return this.record(this.prisma.plantao.update({ where: { id }, data: { deletedAt: null }, include: doctorInclude }), { event: 'Restaurado', user, change: 'restored' });
    }

    async checkin(id: string, user?: any) {
        const plantao = await this.findOne(id);
        this.assertCanManageShift(plantao, user);
        return this.record(this.prisma.plantao.update({
            where: { id },
            data: { checkinAt: new Date(), status: 'EmAndamento' },
            include: doctorInclude,
        // Grava o setor ATIVO no check-in: editar o setor depois não desvincula os
        // atendimentos deste período (o vínculo é por setor-no-momento-do-check-in).
        }), { event: 'CheckIn', user, detail: plantao.setor, change: 'updated' });
    }

    async checkout(id: string, user?: any) {
        const plantao = await this.findOne(id);
        this.assertCanManageShift(plantao, user);
        return this.record(this.prisma.plantao.update({
            where: { id },
            data: { checkoutAt: new Date(), status: 'Concluido' },
            include: doctorInclude,
        }), { event: 'CheckOut', user, change: 'updated' });
    }
}
