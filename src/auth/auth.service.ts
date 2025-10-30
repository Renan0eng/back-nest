import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from 'generated/prisma';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService
    ) { }

    async cryptPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    async createUser(data: Prisma.UserCreateInput) {
        const user = await this.prisma.user.create({
            data: {
                ...data,
                password: await this.cryptPassword(data.password),
            },
        });
        return user;
    }

    async findUserById(id: string) {
        const user = await this.prisma.user.findUnique({ 
            where: { idUser: id, active: true },
            include: {
                nivel_acesso: {
                    include: {
                        menus: true,
                    }
                }
            }
        });
        if (!user) throw new UnauthorizedException('Usuário não encontrado');

        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    async validateUser(email: string, password: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        
        if (!user) throw new UnauthorizedException('Email ou senha inválidos');

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) throw new UnauthorizedException('Email ou senha inválidos');

        const isActive = user.active;
        if (!isActive) throw new UnauthorizedException('Usuário inativo');

        const { password: _, ...userWithoutPassword } = user;
        
        return userWithoutPassword;
    }

    async login(user: { idUser: string; email: string }) {
        const payload = { sub: user.idUser, email: user.email };
        return this.jwtService.sign(payload)
    }

    async loginWeb(userPayload: { idUser: string; email: string }) {
        const payload = { email: userPayload.email, sub: userPayload.idUser };

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

    async validateToken(token: string) {
        try {
            return { valid: true, dataToken: this.jwtService.verify(token) };
        } catch (e) {
            throw new UnauthorizedException('Token inválido');
        }
    }

    async refreshToken(token: string) {
        try {
            const dataToken = this.jwtService.verify(token, {
                secret: process.env.JWT_REFRESH_SECRET,
            });

            const payload = { email: dataToken.email, sub: dataToken.sub };

            const accessToken = await this.jwtService.signAsync(payload, {
                secret: process.env.JWT_ACCESS_SECRET,
                expiresIn: '15m',
            });

            return { accessToken };
        } catch (e) {
            throw new UnauthorizedException('Token inválido');
        }
    }
}
