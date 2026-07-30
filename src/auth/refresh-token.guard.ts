import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
    constructor(private authService: AuthService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const cookieToken = request.cookies['refresh_token'];
        const bearerToken = request.headers.authorization?.startsWith('Bearer ')
            ? request.headers.authorization.split(' ')[1]
            : undefined;
        const token = bearerToken || cookieToken;

        if (!token) {
            throw new UnauthorizedException('Token não encontrado.');
        }

        try {
            const validated = await this.authService.validateToken(token, {
                type: bearerToken ? 'access' : 'refresh',
            });

            const user = await this.authService.findUserById(validated.dataToken.sub);
            if (!user || !user.active) {
                throw new UnauthorizedException('Usuário associado ao token inválido ou inativo.');
            }

            request['refreshTokenPayload'] = validated.dataToken;

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
