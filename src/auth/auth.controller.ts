import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from 'src/auth/public.decorator';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { AppTokenGuard } from './app-token.guard';
import { Menu } from './menu.decorator';

function cookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number; domain?: string } {
    const opts: any = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    if (process.env.COOKIE_DOMAIN) {
        opts.domain = process.env.COOKIE_DOMAIN;
    }
    return opts;
}

function clearCookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; domain?: string } {
    const opts: any = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
    };
    if (process.env.COOKIE_DOMAIN) {
        opts.domain = process.env.COOKIE_DOMAIN;
    }
    return opts;
}

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Get('grupos')
    @Public()
    async grupos() {
        return this.authService.findAllGrupos();
    }

    @Post('register')
    @Public()
    async register(@Body() data: RegisterUserDto) {
        return this.authService.createUserMobile(data);
    }

    @Post('register-web')
    @Public()
    async registerWeb(@Body() data: RegisterUserDto) {
        const user = await this.authService.createUser({ ...data, type: 'USUARIO' } as any);

        // Envia e-mail de verificação (não bloqueia o cadastro se o SMTP falhar)
        try {
            await this.authService.sendVerificationEmail(user.idUser);
        } catch (err) {
            console.error('Falha ao enviar e-mail de verificação no cadastro:', err?.message || err);
        }

        const { password: _, ...userWithoutPassword } = user as any;
        return userWithoutPassword;
    }

    @Post('login')
    @Public()
    async login(@Body() data: LoginUserDto) {
        if (!data.cpf) {
            throw new BadRequestException('CPF é obrigatório para login padrão');
        }

        const user = await this.authService.validateUser(data.cpf, data.password, true);
        const payload: any = { sub: user.idUser, email: user.email, cpf: user.cpf };

        if (!user.active) {
            payload.preApproval = true;
        }

        const access_token = await this.authService.login({ idUser: user.idUser, email: user.email, cpf: user.cpf });
        return { access_token, user: { ...user, active: user.active } };
    }

    @Post('login-web')
    async loginWeb(
        @Body() data: LoginUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        if (!data.email) {
            throw new BadRequestException('Email é obrigatório para login web');
        }

        const user = await this.authService.validateUserWeb(data.email, data.password);

        const { accessToken, refreshToken } = await this.authService.loginWeb({
            idUser: user.idUser,
            email: user.email,
        });

        response.cookie('refresh_token', refreshToken, cookieOptions());

        return {
            accessToken,
            user: user
        };
    }

    @Post('logout-web')
    async logout(@Res({ passthrough: true }) response: Response) {
        response.clearCookie('refresh_token', clearCookieOptions());

        return { message: 'Logout realizado com sucesso' };
    }

    @Post('impersonate/:id')
    @UseGuards(AppTokenGuard)
    @Menu('logar-como')
    async impersonate(@Param('id') id: string, @Req() request: Request) {
        const tokenPayload = request['refreshTokenPayload'] as { impersonatedBy?: string } | undefined;
        const currentUser = request['user'] as { idUser: string };
        const actorId = tokenPayload?.impersonatedBy || currentUser.idUser;
        return this.authService.createImpersonationSession(actorId, id);
    }

    @Post('refresh')
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        try {
            const token = request.cookies['refresh_token'];
            if (!token) {
                throw new UnauthorizedException('Nenhuma sessão encontrada.');
            }

            const { accessToken, refreshToken } = await this.authService.refreshToken(token);

            response.cookie('refresh_token', refreshToken, cookieOptions());

            return { accessToken };

        } catch (err) {
            response.clearCookie('refresh_token', clearCookieOptions());
            if (err instanceof UnauthorizedException) {
                throw err;
            }
            throw new UnauthorizedException('Sessão inválida ou expirada.');
        }
    }

    @Get('me')
    async me(@Req() request: Request) {
        const token = request.cookies['refresh_token'];
        if (!token) throw new UnauthorizedException('Token não fornecido');

        const dataToken = await this.authService.validateToken(token, { type: 'refresh' });

        const user = await this.authService.findUserById(dataToken.dataToken.sub);

        return user;
    }

    @Get('me-token')
    @UseGuards(AppTokenGuard)
    async meToken(@Req() request: Request) {
        return request['user'];
    }

    @Post('validate')
    async validate(@Body('token') token: string) {
        return this.authService.validateToken(token);
    }

    @Patch('profile')
    async updateProfile(
        @Req() request: Request,
        @Body() data: { name?: string; email?: string; phone?: string; cep?: string; cpf?: string; crm?: string; especialidade?: string; cargaHoraria?: number; locaisAtendimento?: string[] },
    ) {
        const token = request.cookies['refresh_token'];
        if (!token) throw new UnauthorizedException('Token não fornecido');

        const dataToken = await this.authService.validateToken(token, { type: 'refresh' });
        return this.authService.updateProfile(dataToken.dataToken.sub, data);
    }

    @Post('change-password')
    async changePassword(
        @Req() request: Request,
        @Body() data: { currentPassword: string; newPassword: string },
    ) {
        const token = request.cookies['refresh_token'];
        if (!token) throw new UnauthorizedException('Token não fornecido');

        if (!data.currentPassword || !data.newPassword) {
            throw new BadRequestException('Senha atual e nova senha são obrigatórias.');
        }
        if (data.newPassword.length < 6) {
            throw new BadRequestException('A nova senha deve ter no mínimo 6 caracteres.');
        }

        const dataToken = await this.authService.validateToken(token, { type: 'refresh' });
        return this.authService.changePassword(dataToken.dataToken.sub, data.currentPassword, data.newPassword);
    }

    @Post('forgot-password')
    @Public()
    async forgotPassword(@Body('email') email: string) {
        if (!email) throw new BadRequestException('E-mail é obrigatório.');
        return this.authService.forgotPassword(email);
    }

    @Post('verify-email')
    @Public()
    async verifyEmail(@Body('token') token: string) {
        if (!token) throw new BadRequestException('Token é obrigatório.');
        return this.authService.verifyEmail(token);
    }

    @Post('resend-verification')
    async resendVerification(@Req() request: Request) {
        const token = request.cookies['refresh_token'];
        if (!token) throw new UnauthorizedException('Token não fornecido');

        const dataToken = await this.authService.validateToken(token, { type: 'refresh' });
        return this.authService.sendVerificationEmail(dataToken.dataToken.sub);
    }

    @Post('reset-password')
    @Public()
    async resetPassword(@Body() data: { token: string; password: string }) {
        if (!data.token || !data.password) {
            throw new BadRequestException('Token e nova senha são obrigatórios.');
        }
        if (data.password.length < 6) {
            throw new BadRequestException('A senha deve ter no mínimo 6 caracteres.');
        }
        return this.authService.resetPassword(data.token, data.password);
    }
}
