import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    async register(@Body() data: RegisterUserDto) {
        return this.authService.createUser(data);
    }

    @Post('login')
    async login(@Body() data: LoginUserDto) {
        const user = await this.authService.validateUser(data.email, data.password);
        const access_token = await this.authService.login({ idUser: user.idUser, email: user.email });
        return { access_token, user };
    }

    @Post('login-web')
    async loginWeb(
        @Body() data: LoginUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const user = await this.authService.validateUser(data.email, data.password);

        const { accessToken, refreshToken } = await this.authService.loginWeb({
            idUser: user.idUser,
            email: user.email,
        });

        response.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000, // Validade de 7 dias
        });

        return {
            accessToken,
            user: user
        };
    }

    @Post('logout-web')
    async logout(@Res({ passthrough: true }) response: Response) {
        // Simplesmente limpa o cookie
        response.clearCookie('refresh_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
        });

        return { message: 'Logout realizado com sucesso' };
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

            const { accessToken } = await this.authService.refreshToken(token);

            return { accessToken };

        } catch (err) {
            response.clearCookie('refresh_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
            });
            throw new UnauthorizedException('Sessão inválida ou expirada.');
        }
    }

    // rota me para retornar o usuario logado
    @Get('me')
    async me(@Req() request: Request) {
        const token = request.cookies['refresh_token'];
        if (!token) throw new UnauthorizedException('Token não fornecido');

        if (!token) throw new UnauthorizedException('Token malformado');

        const dataToken = await this.authService.validateToken(token);

        const user = await this.authService.findUserById(dataToken.dataToken.sub);

        return user;
    }

    @Post('validate')
    async validate(@Body('token') token: string) {
        return this.authService.validateToken(token);
    }
}
