import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private authService: AuthService 
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'SECRET_KEY',
        });
    }

    async validate(payload: { sub: string; email: string }) {
        const user = await this.authService.findUserById(payload.sub);

        if (!user) {
            throw new UnauthorizedException('Usuário não encontrado.');
        }

        if (!user.active) {
            throw new UnauthorizedException('Usuário inativo.');
        }

        return user;
    }
}
