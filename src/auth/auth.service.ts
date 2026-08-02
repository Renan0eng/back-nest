import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private mailService: MailService,
    ) { }

    async cryptPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    async createUser(data: Prisma.UserCreateInput, createdById?: string) {
        const user = await this.prisma.user.create({
            data: ({
                ...(data as any),
                password: await this.cryptPassword(data.password),
            } as any),
        });
        await this.assignUserToGroups(user.idUser, (data as any).type, createdById);
        return user;
    }

    private async assignUserToGroups(userId: string, type?: string, createdById?: string) {
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

    async createUserMobile(data: any) {
        const { grupoId: _ignoredGrupoId, ...userData } = data;

        const user = await this.createUser(userData);

        const { password: _, ...userWithoutPassword } = user;
        const access_token = this.jwtService.sign({
            sub: user.idUser,
            email: user.email,
            cpf: (user as any).cpf,
            preApproval: true,
        });
        return { access_token, user: { ...userWithoutPassword, active: false } };
    }

    async findAllGrupos() {
        return this.prisma.grupo.findMany({
            select: { idGrupo: true, nome: true },
            orderBy: { nome: 'asc' },
        });
    }

    async findUserByIdBasic(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { idUser: id },
            select: {
                idUser: true,
                name: true,
                email: true,
                cpf: true,
                active: true,
                type: true,
                avatar: true,
            },
        });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');
        return user;
    }

    async findUserById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { idUser: id, active: true },
            include: {
                nivel_acesso: {
                    include: {
                        permissoes: { include: { menu_acesso: true } },
                    }
                }
            }
        });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');

        const { password: _, ...userWithoutPassword } = user;
        return this.transformUserPermissions(userWithoutPassword);
    }

    private transformUserPermissions(user: any) {
        const menus = (user.nivel_acesso?.permissoes || []).map((p: any) => ({
            idMenuAcesso: p.menu_acesso.idMenuAcesso,
            nome: p.menu_acesso.nome,
            slug: p.menu_acesso.slug,
            visualizar: p.visualizar,
            criar: p.criar,
            editar: p.editar,
            excluir: p.excluir,
            relatorio: p.relatorio,
        }));

        return {
            ...user,
            nivel_acesso: {
                idNivelAcesso: user.nivel_acesso.idNivelAcesso,
                nome: user.nivel_acesso.nome,
                descricao: user.nivel_acesso.descricao,
                menus,
            },
        };
    }

    async validateUserWeb(email: string, password: string) {
        const user = await this.prisma.user.findUnique({
            where: {
                email,
                type: { not: { in: ['PACIENTE'] } }
            }
        });

        if (!user) throw new UnauthorizedException('Email ou senha inválidos');

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException('Email ou senha inválidos');

        const isActive = user.active;
        if (!isActive) throw new UnauthorizedException('Usuário inativo');

        const { password: _, ...userWithoutPassword } = user;

        return userWithoutPassword;
    }

    async validateUser(cpf: string, password: string, allowInactive = false) {
        const user = await this.prisma.user.findUnique({
            where: {
                cpf,
            }
        });

        if (!user) throw new UnauthorizedException('CPF ou senha inválidos');

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException('CPF ou senha inválidos');

        if (!allowInactive && !user.active) {
            throw new UnauthorizedException('Usuário inativo');
        }

        const { password: _, ...userWithoutPassword } = user;

        return userWithoutPassword;
    }

    async login(user: { idUser: string; email: string; cpf: string }) {
        const payload = { sub: user.idUser, email: user.email, cpf: user.cpf };
        return this.jwtService.sign(payload)
    }

    async loginWeb(userPayload: { idUser: string; email: string }) {
        const payload = { email: userPayload.email, sub: userPayload.idUser, web: true };

        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_ACCESS_SECRET,
                expiresIn: '15m',
            }),

            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: '7d',
            }),
        ]);

        return {
            accessToken,
            refreshToken,
        };
    }

    async createImpersonationSession(actorId: string, targetId: string) {
        const [actor, target] = await Promise.all([
            this.prisma.user.findUnique({ where: { idUser: actorId } }),
            this.findUserById(targetId),
        ]);

        if (!actor || !actor.active) throw new UnauthorizedException('Usuário principal inválido.');
        if (!target.active || target.dt_delete) throw new BadRequestException('Não é possível acessar um usuário inativo.');
        if (actor.idUser === target.idUser) throw new BadRequestException('Selecione outro usuário.');

        const accessToken = await this.jwtService.signAsync(
            { email: target.email, sub: target.idUser, impersonatedBy: actor.idUser },
            { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '1h' },
        );

        return { accessToken, user: target };
    }

    async validateToken(
        token: string,
        options: { type?: 'access' | 'refresh' | 'any' } = {},
    ) {
        const { type = 'any' } = options;
        const defaultSecret = process.env.JWT_SECRET || 'SECRET_KEY';

        const secretsToTry: string[] = [];
        const pushSecret = (secret?: string) => {
            if (!secret) return;
            if (!secretsToTry.includes(secret)) {
                secretsToTry.push(secret);
            }
        };

        if (type === 'access' || type === 'any') {
            pushSecret(process.env.JWT_ACCESS_SECRET);
        }

        if (type === 'refresh' || type === 'any') {
            pushSecret(process.env.JWT_REFRESH_SECRET);
        }

        if (type !== 'refresh') {
            // Tokens gerados pelo login clássico usam o secret padrão do módulo JWT.
            pushSecret(defaultSecret);
        }

        if (!secretsToTry.length) {
            pushSecret(defaultSecret);
        }

        for (const secret of secretsToTry) {
            try {
                const decoded = this.jwtService.verify(token, {
                    secret,
                    ignoreExpiration: false,
                });
                return { valid: true, dataToken: decoded };
            } catch (e: any) {
                if (e?.name === 'TokenExpiredError') {
                    throw new UnauthorizedException('Token expirado');
                }

                // Se estivermos validando explicitamente um refresh token, não devemos
                // tentar outros segredos além do configurado; nesse caso propaga o erro.
                if (type === 'refresh') {
                    throw new UnauthorizedException('Token inválido');
                }
            }
        }

        throw new UnauthorizedException('Token inválido');
    }


    async refreshToken(token: string) {
        try {
            const dataToken = this.jwtService.verify(token, {
                secret: process.env.JWT_REFRESH_SECRET,
                ignoreExpiration: false,
            });

            const user = await this.findUserById(dataToken.sub);
            if (!user) {
                throw new UnauthorizedException('Usuário não encontrado');
            }

            const payload = { email: user.email, sub: user.idUser };

            const [accessToken, refreshToken] = await Promise.all([
                this.jwtService.signAsync(payload, {
                    secret: process.env.JWT_ACCESS_SECRET,
                    expiresIn: '15m',
                }),
                this.jwtService.signAsync(payload, {
                    secret: process.env.JWT_REFRESH_SECRET,
                    expiresIn: '7d',
                }),
            ]);

            return { accessToken, refreshToken };
        } catch (e: any) {
            if (e?.name === 'TokenExpiredError') {
                throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
            }
            throw new UnauthorizedException('Token inválido');
        }
    }

    async updateUser(id: string, data: Partial<{
        name: string;
        birthDate?: string | Date;
        cpf: string;
        sexo?: string;
        unidadeSaude?: string;
        medicamentos?: string;
        exames?: boolean;
        examesDetalhes?: string;
        alergias?: string;
        phone?: string;
        cep?: string;
        avatar?: string;
    }>) {
        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.birthDate) updateData.birthDate = new Date(data.birthDate as any);
        if (typeof data.cpf !== 'undefined') updateData.cpf = data.cpf;
        if (typeof data.sexo !== 'undefined') updateData.sexo = data.sexo;
        if (typeof data.unidadeSaude !== 'undefined') updateData.unidadeSaude = data.unidadeSaude;
        if (typeof data.medicamentos !== 'undefined') updateData.medicamentos = data.medicamentos;
        if (typeof data.exames !== 'undefined') updateData.exames = data.exames;
        if (typeof data.examesDetalhes !== 'undefined') updateData.examesDetalhes = data.examesDetalhes;
        if (typeof data.alergias !== 'undefined') updateData.alergias = data.alergias;
        if (typeof data.phone !== 'undefined') updateData.phone = data.phone;
        if (typeof data.cep !== 'undefined') updateData.cep = data.cep;
        if (typeof data.avatar !== 'undefined') updateData.avatar = data.avatar;

        const user = await this.prisma.user.update({
            where: { idUser: id },
            data: updateData,
        });

        const { password, ...rest } = user as any;
        return rest;
    }

    async updateProfile(userId: string, data: { name?: string; email?: string; phone?: string; cep?: string; cpf?: string; crm?: string; especialidade?: string; cargaHoraria?: number; locaisAtendimento?: string[] }) {
        const user = await this.prisma.user.findUnique({ where: { idUser: userId } });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');

        if (data.email && data.email !== user.email) {
            const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
            if (existing) throw new BadRequestException('Este e-mail já está em uso.');
        }

        if (data.cpf && data.cpf !== user.cpf) {
            const existing = await this.prisma.user.findUnique({ where: { cpf: data.cpf } });
            if (existing) throw new BadRequestException('Este CPF já está em uso.');
        }

        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.email) updateData.email = data.email;
        if (typeof data.phone !== 'undefined') updateData.phone = data.phone;
        if (typeof data.cep !== 'undefined') updateData.cep = data.cep;
        if (typeof data.cpf !== 'undefined') updateData.cpf = data.cpf;

        // Campos de médico — só aplicam quando o próprio usuário é MEDICO
        if (user.type === 'MEDICO') {
            if (typeof data.crm !== 'undefined') updateData.crm = data.crm;
            if (typeof data.especialidade !== 'undefined') updateData.especialidade = data.especialidade;
            if (typeof data.cargaHoraria !== 'undefined') updateData.cargaHoraria = data.cargaHoraria;
        }

        // Locais de atendimento — aplicam a profissionais (MEDICO/USUARIO)
        if ((user.type === 'MEDICO' || user.type === 'USUARIO') && Array.isArray(data.locaisAtendimento)) {
            updateData.locaisAtendimento = data.locaisAtendimento;
        }

        const updated = await this.prisma.user.update({
            where: { idUser: userId },
            data: updateData,
            include: {
                nivel_acesso: {
                    include: {
                        permissoes: { include: { menu_acesso: true } },
                    },
                },
            },
        });

        const { password, ...rest } = updated as any;
        return this.transformUserPermissions(rest);
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { idUser: userId } });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) throw new BadRequestException('Senha atual incorreta.');

        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { idUser: userId },
            data: { password: hashed },
        });

        return { message: 'Senha alterada com sucesso.' };
    }

    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            return { message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' };
        }

        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.idUser, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await this.prisma.passwordResetToken.create({
            data: {
                token,
                userId: user.idUser,
                expiresAt,
            },
        });

        await this.mailService.sendPasswordReset(user.email, user.name, token);

        return { message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' };
    }

    async sendVerificationEmail(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { idUser: userId } });
        if (!user) throw new BadRequestException('Usuário não encontrado.');
        if (user.emailVerified) return { message: 'E-mail já verificado.' };

        await this.prisma.emailVerificationToken.updateMany({
            where: { userId: user.idUser, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.prisma.emailVerificationToken.create({
            data: { token, userId: user.idUser, expiresAt },
        });

        await this.mailService.sendEmailVerification(user.email, user.name, token);

        return { message: 'E-mail de verificação enviado.' };
    }

    async verifyEmail(token: string) {
        const verificationToken = await this.prisma.emailVerificationToken.findUnique({ where: { token } });

        if (!verificationToken) throw new BadRequestException('Token inválido.');
        if (verificationToken.usedAt) throw new BadRequestException('Este link já foi utilizado.');
        if (verificationToken.expiresAt < new Date()) throw new BadRequestException('Este link expirou. Solicite um novo e-mail de verificação.');

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { idUser: verificationToken.userId },
                data: { emailVerified: true, emailVerifiedAt: new Date() },
            }),
            this.prisma.emailVerificationToken.update({
                where: { id: verificationToken.id },
                data: { usedAt: new Date() },
            }),
        ]);

        return { message: 'E-mail verificado com sucesso.' };
    }

    async sendWelcomeEmail(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { idUser: userId } });
        if (!user) throw new BadRequestException('Usuário não encontrado.');

        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.idUser, usedAt: null },
            data: { usedAt: new Date() },
        });

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.prisma.passwordResetToken.create({
            data: { token, userId: user.idUser, expiresAt },
        });

        await this.mailService.sendWelcome(user.email, user.name, token);

        return { message: 'E-mail de boas-vindas enviado com sucesso.' };
    }

    async resetPassword(token: string, newPassword: string) {
        const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token } });

        if (!resetToken) throw new BadRequestException('Token inválido.');
        if (resetToken.usedAt) throw new BadRequestException('Este link já foi utilizado.');
        if (resetToken.expiresAt < new Date()) throw new BadRequestException('Este link expirou. Solicite uma nova redefinição.');

        const hashed = await bcrypt.hash(newPassword, 10);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { idUser: resetToken.userId },
                // Receber o link por e-mail comprova a posse do e-mail
                data: { password: hashed, emailVerified: true, emailVerifiedAt: new Date() },
            }),
            this.prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() },
            }),
        ]);

        return { message: 'Senha redefinida com sucesso.' };
    }
}
