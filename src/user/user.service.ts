import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from 'generated/prisma';
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

    async create(createUserDto: CreateUserDto) {
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

    findAll() {
        return this.prisma.user.findMany({
            select: userSelect, // Usa a seleção
            orderBy: { name: 'asc' },
        });
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

        // Adicionar lógica de soft delete se necessário (atualizar dt_delete)
        // Ex: await this.prisma.user.update({ where: { idUser }, data: { dt_delete: new Date() } });

        // Deleção física:
        await this.prisma.user.delete({
            where: { idUser },
        });
        return { message: `Usuário ${idUser} deletado com sucesso.` }; // Retorna null ou uma mensagem
    }
}