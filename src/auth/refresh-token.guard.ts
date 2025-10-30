import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const token = request.cookies['refresh_token']; 

        if (!token) {
            throw new UnauthorizedException('Token não encontrado.');
        }

        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: process.env.JWT_REFRESH_SECRET, 
            });

            const user = await this.authService.findUserById(payload.sub);
            if (!user || !user.active) {
                throw new UnauthorizedException('Usuário associado ao token inválido ou inativo.');
            }

            request['refreshTokenPayload'] = payload;

        } catch (err) {
            const response = context.switchToHttp().getResponse();
            response.clearCookie('refresh_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
            });
            throw new UnauthorizedException('Refresh token inválido ou expirado.');
        }
        return true; 
    }
}