import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'

@Injectable()
export class AppTokenGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()
        const response = context.switchToHttp().getResponse<Response>()

        let token: string | undefined
        let isBearerToken = false

        if (request.headers.authorization?.startsWith('Bearer ')) {
            token = request.headers.authorization.split(' ')[1]
            isBearerToken = true
        } else {
            token = request.cookies?.['refresh_token']
        }

        if (!token) throw new UnauthorizedException('Token não encontrado.')

        try {
            const validated = await this.authService.validateToken(token, {
                type: isBearerToken ? 'access' : 'refresh',
            })

            const payload = validated.dataToken
            let user: any

            try {
                user = await this.authService.findUserById(payload.sub)
            } catch {
                if (isBearerToken) {
                    user = await this.authService.findUserByIdBasic(payload.sub)
                } else {
                    throw new UnauthorizedException('Usuário inválido ou inativo.')
                }
            }

            request['user'] = user
            request['refreshTokenPayload'] = payload
            return true
        } catch (err) {
            if (err instanceof UnauthorizedException) throw err
            if (!isBearerToken) {
                response.clearCookie('refresh_token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    path: '/',
                })
            }
            throw new UnauthorizedException('Token inválido ou expirado.')
        }
    }
}
