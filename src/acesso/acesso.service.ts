import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { CreateMenuAcessoDto, CreateNivelAcessoDto, UpdateMenuAcessoDto, UpdateNivelAcessoDto } from './dto/acesso.dto';
// Importe os DTOs que o controller usa

@Injectable()
export class AcessoService {
    constructor(private prisma: PrismaService) { }

    // --- Nivel_Acesso ---

    findNiveisComMenus() {
        return this.prisma.nivel_Acesso.findMany({
            include: {
                menus: true, // Inclui os menus vinculados
            },
            orderBy: { nome: 'asc' },
        });
    }

    createNivel(data: CreateNivelAcessoDto) {
        return this.prisma.nivel_Acesso.create({ data });
    }

    updateNivel(id: number, data: UpdateNivelAcessoDto) {
        return this.prisma.nivel_Acesso.update({
            where: { idNivelAcesso: id },
            data,
        });
    }

    deleteNivel(id: number) {
        // Desvincular usuários e menus antes de deletar
        return this.prisma.nivel_Acesso.delete({
            where: { idNivelAcesso: id },
        });
    }

    // --- Vínculo M-N ---

    updateNivelMenus(nivelId: number, menuIds: number[]) {
        return this.prisma.nivel_Acesso.update({
            where: { idNivelAcesso: nivelId },
            data: {
                menus: {
                    // 'set' remove os vínculos antigos e adiciona os novos
                    set: menuIds.map(id => ({ idMenuAcesso: id })),
                },
            },
        });
    }

    // --- Menu_Acesso ---

    findMenus() {
        return this.prisma.menu_Acesso.findMany({
            orderBy: { nome: 'asc' },
        });
    }

    createMenu(data: CreateMenuAcessoDto) {
        // Como o menu é criado sem vínculos, é simples
        return this.prisma.menu_Acesso.create({ data });
    }

    updateMenu(id: number, data: UpdateMenuAcessoDto) {
        // Atualiza o menu e suas permissões base
        return this.prisma.menu_Acesso.update({
            where: { idMenuAcesso: id },
            data,
        });
    }

    deleteMenu(id: number) {
        // O Prisma M-N cuidará de remover os vínculos
        return this.prisma.menu_Acesso.delete({
            where: { idMenuAcesso: id },
        });
    }

    findUsers() {
        return this.prisma.user.findMany({
            select: {
                idUser: true,
                name: true,
                email: true,
                avatar: true,
                active: true,
                nivelAcessoId: true,
                nivel_acesso: { // Inclui o objeto do nível de acesso
                    select: {
                        idNivelAcesso: true,
                        nome: true,
                    }
                }
            },
            orderBy: { name: 'asc' },
        });
    }

    async updateUserNivel(idUser: string, nivelAcessoId: number) {
        // 1. Verifica se o usuário existe
        const user = await this.prisma.user.findUnique({
            where: { idUser },
        });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado.');
        }

        // 2. Verifica se o nível de acesso existe
        const nivel = await this.prisma.nivel_Acesso.findUnique({
            where: { idNivelAcesso: nivelAcessoId },
        });
        if (!nivel) {
            throw new NotFoundException('Nível de acesso não encontrado.');
        }

        // 3. Atualiza o usuário
        return this.prisma.user.update({
            where: { idUser },
            data: {
                nivelAcessoId: nivelAcessoId,
            },
            include: { // Retorna o usuário com o nível atualizado
                nivel_acesso: true,
            },
        });
    }
}