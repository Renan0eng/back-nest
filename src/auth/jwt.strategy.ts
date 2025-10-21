// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: 'SECRET_KEY', // IMPORTANT: Use process.env.JWT_SECRET in production
        });
    }

    async validate(payload: { sub: string; email: string }) {
        const user = await this.prisma.user.findUnique({
            where: { idUser: payload.sub },
        });

        if (!user) {
            throw new UnauthorizedException('User not found.');
        }

        // The user object will be attached to the request
        // You can remove the password before returning
        const { password, ...result } = user;
        return result;
    }
}