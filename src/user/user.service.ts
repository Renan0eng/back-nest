import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service'; // Ajuste o caminho
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Define a seleção padrão para evitar retornar a senha
const userSelect = Prisma.validator<Prisma.UserSelect>()({
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
    locaisAtendimento: true,
    nivel_acesso: {
        select: {
            idNivelAcesso: true,
            nome: true,
        },
    },
});

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) { }

    async create(createUserDto: CreateUserDto, createdById?: string) {
        const { password, ...userData } = createUserDto;

        // Verifica email duplicado
        const existingEmail = await this.prisma.user.findUnique({ where: { email: userData.email } });
        if (existingEmail) {
            throw new ConflictException('Este e-mail já está em uso.');
        }
        // Verifica CPF duplicado (se fornecido)
        if (userData.cpf) {
            const existingCpf = await this.prisma.user.findUnique({ where: { cpf: userData.cpf } });
            if (existingCpf) {
                throw new ConflictException('Este CPF já está em uso.');
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            const newUser = await this.prisma.user.create({
                data: {
                    ...userData,
                    password: hashedPassword,
                },
                select: userSelect, // Usa a seleção para não retornar a senha
            });
            await this.assignUserToGroups(newUser.idUser, createUserDto.type, createdById);
            return newUser;
        } catch (error) {
            // Tratamento genérico para outros erros do Prisma
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                // Exemplo: Foreign key constraint failed
                if (error.code === 'P2003') {
                    throw new BadRequestException('Nível de Acesso inválido.');
                }
            }
            console.error("Erro ao criar usuário:", error);
            throw new BadRequestException('Não foi possível criar o usuário.');
        }
    }

    private async assignUserToGroups(userId: string, type?: any, createdById?: string) {
        let groupIds: number[] = [];
        if (createdById) {
            const memberships = await this.prisma.grupo_Membro.findMany({ where: { userId: createdById }, select: { grupoId: true } });
            groupIds = memberships.map(m => m.grupoId);
        }
        if (!groupIds.length) {
            const defaultGroup = await this.prisma.grupo.findFirst({ where: { isDefault: true }, select: { idGrupo: true } });
            if (defaultGroup) groupIds = [defaultGroup.idGrupo];
        }
        if (!groupIds.length) return;
        await this.prisma.grupo_Membro.createMany({ data: groupIds.map(grupoId => ({ grupoId, userId })), skipDuplicates: true });
        if (type === 'PACIENTE') await this.prisma.user.update({ where: { idUser: userId }, data: { grupoPacienteId: groupIds[0] } });
    }

    async findAll(opts?: { page?: number; pageSize?: number; filters?: any }) {
        const filters = opts?.filters;
        const baseWhere: any = { dt_delete: filters?.deleted ? { not: null } : null };

        // Filter by type
        if (filters?.type) {
            baseWhere.type = filters.type;
        } else {
            // Default: keep previous behavior (exclude ADMIN and PACIENTE)
            baseWhere.type = { not: { in: ['ADMIN', 'PACIENTE'] } };
        }

        // Filter by name (case-insensitive partial)
        if (filters?.name) {
            baseWhere.name = { contains: filters.name, mode: 'insensitive' };
        }

        // Filter by access level
        if (typeof filters?.accessLevel === 'number') {
            baseWhere.nivelAcessoId = filters.accessLevel;
        }

        // Filter by active flag
        if (typeof filters?.active === 'boolean') {
            baseWhere.active = filters.active;
        }

        // if pagination opts not provided, keep previous behavior (return array)
        if (!opts || (typeof opts.page === 'undefined' && typeof opts.pageSize === 'undefined')) {
            return this.prisma.user.findMany({
                select: userSelect,
                where: baseWhere,
                orderBy: { name: 'asc' },
            });
        }

        const page = opts.page && opts.page > 0 ? opts.page : 1;
        const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 20;

        const [total, data] = await Promise.all([
            this.prisma.user.count({ where: baseWhere }),
            this.prisma.user.findMany({
                where: baseWhere,
                select: userSelect,
                orderBy: { name: 'asc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);

        return { total, page, pageSize, data };
    }

    async findOne(idUser: string) {
        const user = await this.prisma.user.findUnique({
            where: { idUser },
            select: userSelect, // Usa a seleção
        });
        if (!user) {
            throw new NotFoundException(`Usuário com ID ${idUser} não encontrado.`);
        }
        return user;
    }

    async update(idUser: string, updateUserDto: UpdateUserDto) {
        const { password, ...userData } = updateUserDto;

        // Verifica se o usuário existe
        const existingUser = await this.prisma.user.findUnique({ where: { idUser } });
        if (!existingUser) {
            throw new NotFoundException(`Usuário com ID ${idUser} não encontrado.`);
        }

        // Verifica email duplicado (se diferente do atual)
        if (userData.email && userData.email !== existingUser.email) {
            const existingEmail = await this.prisma.user.findUnique({ where: { email: userData.email } });
            if (existingEmail) {
                throw new ConflictException('Este e-mail já está em uso por outro usuário.');
            }
        }
        // Verifica CPF duplicado (se diferente do atual e fornecido)
        if (userData.cpf && userData.cpf !== existingUser.cpf) {
            const existingCpf = await this.prisma.user.findUnique({ where: { cpf: userData.cpf } });
            if (existingCpf) {
                throw new ConflictException('Este CPF já está em uso por outro usuário.');
            }
        }


        let hashedPassword: string | undefined = undefined;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        try {
            const updatedUser = await this.prisma.user.update({
                where: { idUser },
                data: {
                    ...userData,
                    ...(hashedPassword && { password: hashedPassword }), // Inclui a senha apenas se foi fornecida
                },
                select: userSelect, // Usa a seleção
            });
            return updatedUser;
        } catch (error) {
            // Tratamento genérico para outros erros do Prisma
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                // Exemplo: Foreign key constraint failed
                if (error.code === 'P2003') {
                    throw new BadRequestException('Nível de Acesso inválido.');
                }
            }
            console.error("Erro ao atualizar usuário:", error);
            throw new BadRequestException('Não foi possível atualizar o usuário.');
        }
    }

    async remove(idUser: string) {
        // Verifica se o usuário existe antes de tentar deletar
        const user = await this.prisma.user.findUnique({ where: { idUser } });
        if (!user) {
            throw new NotFoundException(`Usuário com ID ${idUser} não encontrado.`);
        }

        if (user.dt_delete) {
            return { message: 'Usuário já removido.' };
        }

        // Soft delete: mantém o registro/histórico, desativa o acesso e libera os
        // campos únicos (email/cpf) com um sufixo, para permitir recadastro.
        const suffix = `_del_${Date.now()}`;
        await this.prisma.user.update({
            where: { idUser },
            data: {
                dt_delete: new Date(),
                active: false,
                email: `${user.email}${suffix}`,
                cpf: `${user.cpf}${suffix}`,
            },
        });
        return { message: `Usuário removido com sucesso.` };
    }

    /** Restaura um usuário soft-deletado, devolvendo email/cpf originais. */
    async restore(idUser: string) {
        const user = await this.prisma.user.findFirst({ where: { idUser, dt_delete: { not: null } } });
        if (!user) {
            throw new NotFoundException('Usuário excluído não encontrado.');
        }
        const email = user.email.replace(/_del(?:ete)?_[a-z0-9]+$/i, '');
        const cpf = user.cpf.replace(/_del(?:ete)?_[a-z0-9]+$/i, '');
        const clash = await this.prisma.user.findFirst({
            where: { dt_delete: null, OR: [{ email }, { cpf }] },
            select: { idUser: true },
        });
        if (clash) throw new BadRequestException('Já existe um usuário ativo com este e-mail ou CPF.');

        await this.prisma.user.update({
            where: { idUser },
            data: { dt_delete: null, active: true, email, cpf },
        });
        return { message: 'Usuário restaurado com sucesso.' };
    }
}
