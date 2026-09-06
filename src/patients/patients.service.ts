import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/database/prisma.service';
import { RegisterPatientDto } from './dto/register-patient.dto';

const patientSelect = Prisma.validator<Prisma.UserSelect>()({
    idUser: true,
    name: true,
    avatar: true,
    email: true,
    cpf: true,
    cep: true,
    phone: true,
    created: true,
    updated: true,
    active: true,
    nivelAcessoId: true,
    type: true,
    birthDate: true,
    sexo: true,
    unidadeSaude: true,
    medicamentos: true,
    exames: true,
    examesDetalhes: true,
    alergias: true,
    autoCadastro: true,
    alta: true,
    altaAt: true,
    nivel_acesso: {
        select: {
            idNivelAcesso: true,
            nome: true,
        },
    },
});

@Injectable()
export class PatientsService {
    constructor(private prisma: PrismaService, private authService: AuthService) { }

    async findAll(opts?: { page?: number; pageSize?: number; filters?: any; scope?: { visibleUserIds: string[]; groupIds: number[] } | null }) {
        const filters = opts?.filters;
        const where: any = { type: 'PACIENTE', dt_delete: filters?.deleted ? { not: null } : null };

        // Escopo por grupo. Paciente visível se:
        //  - não tem criador nem grupo (legado, visível a todos), ou
        //  - foi criado por usuário visível, ou
        //  - pertence a um grupo do qual o usuário atual é membro.
        if (opts?.scope) {
            where.OR = [
                { AND: [{ user_id_create: null }, { grupoPacienteId: null }] },
                { user_id_create: { in: opts.scope.visibleUserIds } },
            ];
            if (opts.scope.groupIds.length) {
                where.OR.push({ grupoPacienteId: { in: opts.scope.groupIds } });
            }
        }

        if (filters?.name) {
            where.name = { contains: filters.name, mode: 'insensitive' };
        }
        if (filters?.email) {
            where.email = { contains: filters.email, mode: 'insensitive' };
        }
        if (filters?.cpf) {
            where.cpf = { contains: filters.cpf, mode: 'insensitive' };
        }
        if (filters?.birthDateFrom || filters?.birthDateTo) {
            where.birthDate = {};
            if (filters.birthDateFrom) {
                const from = new Date(filters.birthDateFrom);
                if (!isNaN(from.getTime())) {
                    from.setHours(0, 0, 0, 0);
                    where.birthDate.gte = from;
                }
            }
            if (filters.birthDateTo) {
                const to = new Date(filters.birthDateTo);
                if (!isNaN(to.getTime())) {
                    to.setHours(23, 59, 59, 999);
                    where.birthDate.lte = to;
                }
            }
            if (Object.keys(where.birthDate).length === 0) delete where.birthDate;
        }
        if (filters?.sexo) {
            where.sexo = filters.sexo;
        }
        if (filters?.unidadeSaude) {
            where.unidadeSaude = { contains: filters.unidadeSaude, mode: 'insensitive' };
        }
        if (filters?.medicamentos) {
            where.medicamentos = { contains: filters.medicamentos, mode: 'insensitive' };
        }
        if (typeof filters?.exames === 'boolean') {
            where.exames = filters.exames;
        }
        if (filters?.examesDetalhes) {
            where.examesDetalhes = { contains: filters.examesDetalhes, mode: 'insensitive' };
        }
        if (filters?.alergias) {
            where.alergias = { contains: filters.alergias, mode: 'insensitive' };
        }
        if (typeof filters?.active === 'boolean') {
            where.active = filters.active;
        }
        if (typeof filters?.autoCadastro === 'boolean') {
            where.autoCadastro = filters.autoCadastro;
        }
        if (typeof filters?.alta === 'boolean') {
            where.alta = filters.alta;
        }

        if (!opts || (typeof opts.page === 'undefined' && typeof opts.pageSize === 'undefined')) {
            return this.prisma.user.findMany({
                where,
                select: patientSelect,
                orderBy: { name: 'asc' },
            });
        }

        const page = opts.page && opts.page > 0 ? opts.page : 1;
        const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 20;

        const [total, data] = await Promise.all([
            this.prisma.user.count({ where }),
            this.prisma.user.findMany({
                where,
                select: patientSelect,
                orderBy: { name: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return { total, page, pageSize, data: data.map((d) => ({ ...d, password: undefined, cpf: d.cpf.split('_ALTO_CADASTRO_')[0] })) };
    }

    async findOne(id: string) {
        const user = await this.prisma.user.findFirst({
            where: { idUser: id, dt_delete: null },
            select: {
                // basic user fields
                ...patientSelect,

                // forms assigned to this patient (so the UI can show which forms can be answered/edited)
                fromAssigned: {
                    where: { active: true, isScreening: true },
                    select: {
                        idForm: true,
                        title: true,
                        description: true,
                        isScreening: true,
                        createdAt: true,
                        updatedAt: true,
                        questions: {
                            orderBy: { order: 'asc' },
                            select: {
                                idQuestion: true,
                                text: true,
                                type: true,
                                required: true,
                                order: true,
                                imageUrl: true,
                                imageUrls: true,
                                options: {
                                    orderBy: { order: 'asc' },
                                    select: {
                                        idOption: true,
                                        text: true,
                                        value: true,
                                        order: true,
                                    },
                                },
                            },
                        },
                    },
                },

                // responses previously submitted by this patient
                formResponses: {
                    where: { dt_delete: null },
                    orderBy: { submittedAt: 'desc' },
                    select: {
                        idResponse: true,
                        submittedAt: true,
                        totalScore: true,
                        classification: true,
                        conduct: true,
                        form: {
                            select: {
                                idForm: true,
                                title: true,
                                isScreening: true,
                            },
                        },
                        answers: {
                            select: {
                                idAnswer: true,
                                value: true,
                                values: true,
                                question: {
                                    select: {
                                        idQuestion: true,
                                        text: true,
                                        type: true,
                                        order: true,
                                        imageUrl: true,
                                        imageUrls: true,
                                options: {
                                    orderBy: { order: 'asc' },
                                            select: {
                                                idOption: true,
                                                text: true,
                                                value: true,
                                                order: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!user) throw new NotFoundException('Paciente não encontrado');
        return user;
    }

    async create(data: RegisterPatientDto, creatorId?: string) {
        try {
            const createData = {
                ...(data as any),
                password: await this.authService.cryptPassword((data as any).password),
                type: 'PACIENTE',
                ...(creatorId && { user_id_create: creatorId }),
            } as any;

            // busca pelo cpf e retorna falando se ja existe um usuario com esse cpf
            if (data.cpf) {
                const existingCpf = await this.prisma.user.findFirst({
                    where: { cpf: data.cpf },
                    select: { idUser: true },
                });
                if (existingCpf) {
                    // erro 422
                    throw new UnprocessableEntityException('Já existe um paciente com este CPF');
                }
            }

            const created = await this.prisma.user.create({
                data: createData,
                select: patientSelect,
            });
            return created;
        } catch (e: any) {
            console.error('[PatientsService] Erro ao criar paciente:', e);

            if (e instanceof UnprocessableEntityException) {
                throw e;
            }
            // valida se não é um erro de unique constraint
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2002') {
                    const target = (e.meta && (e.meta.target as string[]).join(', ')) || 'campo único';
                    throw new BadRequestException(`Já existe um paciente com este(s) ${target}`);
                }
                // outros erros do Prisma
                throw new BadRequestException({
                    message: 'Erro ao criar paciente no banco de dados',
                    code: e.code,
                    meta: e.meta,
                    originalMessage: e.message,
                });
            }
            // Erros de validação ou outros
            throw new BadRequestException({
                message: 'Não foi possível criar paciente',
                originalError: e?.message || String(e),
                stack: e?.stack?.split('\n').slice(0, 5),
            });
        }
    }

    async update(id: string, data: any) {
        try {
            const updated = await this.prisma.user.update({ where: { idUser: id }, data, select: patientSelect });
            return updated;
        } catch (e) {
            throw new BadRequestException('Não foi possível atualizar paciente');
        }
    }

    async remove(id: string, idUser: string) {
        try {
            // pega o usuario para liberar os campos únicos (cpf e email) com sufixo,
            // permitindo recadastrar o mesmo cpf/email depois da exclusão
            const user = await this.prisma.user.findUnique({ where: { idUser: id }, select: { cpf: true, email: true } });
            if (!user) throw new NotFoundException('Paciente não encontrado');
            const suffix = `_delete_${Date.now()}`;

            await this.prisma.user.update({
                where: { idUser: id },
                data: {
                    user_id_delete: idUser,
                    dt_delete: new Date(),
                    active: false,
                    cpf: `${user.cpf}${suffix}`,
                    email: `${user.email}${suffix}`,
                },
            });

            // cansela os agendamentos futuros do paciente
            await this.prisma.appointment.updateMany({
                where: {
                    patientId: id,
                    status: { in: ['Pendente', 'Confirmado'] },
                },
                data: {
                    status: 'Cancelado',
                },
            });
            return { success: true };
        } catch (e) {
            throw new BadRequestException('Não foi possível deletar paciente');
        }
    }

    /** Restaura um paciente soft-deletado, devolvendo email/cpf originais. */
    async restore(id: string) {
        const user = await this.prisma.user.findFirst({
            where: { idUser: id, type: 'PACIENTE', dt_delete: { not: null } },
            select: { email: true, cpf: true },
        });
        if (!user) throw new NotFoundException('Paciente excluído não encontrado');

        const email = user.email.replace(/_del(?:ete)?_[a-z0-9]+$/i, '');
        const cpf = user.cpf.replace(/_del(?:ete)?_[a-z0-9]+$/i, '');
        const clash = await this.prisma.user.findFirst({
            where: { dt_delete: null, OR: [{ email }, { cpf }] },
            select: { idUser: true },
        });
        if (clash) throw new BadRequestException('Já existe um usuário ativo com este e-mail ou CPF.');

        await this.prisma.user.update({
            where: { idUser: id },
            data: { dt_delete: null, active: true, email, cpf },
        });
        return { success: true, message: 'Paciente restaurado.' };
    }

    async acceptRegistration(id: string) {
        try {
            const user = await this.prisma.user.findUnique({
                where: { idUser: id },
                select: { autoCadastro: true, active: true, cpf: true },
            });

            if (!user) throw new NotFoundException('Paciente não encontrado');
            if (!user.autoCadastro) throw new BadRequestException('Este paciente não está em auto-cadastro');

            const updated = await this.prisma.user.update({
                where: { idUser: id },
                data: {
                    active: true,
                    cpf: user.cpf.split('_AUTO_CADASTRO_')[0],
                    autoCadastro: false,
                },
                select: patientSelect,
            });
            return updated;
        } catch (e) {
            if (e instanceof NotFoundException || e instanceof BadRequestException) {
                throw e;
            }
            throw new BadRequestException('Não foi possível aceitar o cadastro do paciente');
        }
    }

    async darAlta(id: string) {
        const user = await this.prisma.user.findFirst({
            where: { idUser: id, dt_delete: null },
        });
        if (!user) throw new NotFoundException('Paciente não encontrado');
        if (user.alta) throw new BadRequestException('Paciente já possui alta');

        return this.prisma.user.update({
            where: { idUser: id },
            data: { alta: true, altaAt: new Date(), active: false },
            select: patientSelect,
        });
    }

    async reverterAlta(id: string) {
        const user = await this.prisma.user.findFirst({
            where: { idUser: id, dt_delete: null },
        });
        if (!user) throw new NotFoundException('Paciente não encontrado');
        if (!user.alta) throw new BadRequestException('Paciente não possui alta');

        return this.prisma.user.update({
            where: { idUser: id },
            data: { alta: false, altaAt: null, active: true },
            select: patientSelect,
        });
    }
}
