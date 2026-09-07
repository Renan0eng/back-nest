import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { AuthService } from './auth.service'
import { getJwtSecrets } from '../config/jwt-secrets'

@Injectable()
export class AppStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecrets().legacy,
    })
  }

  async validate(payload: { sub: string; email: string; origin?: 'web' | 'mobile' }) {
    const user = await this.authService.findUserById(payload.sub)

    if (!user) throw new UnauthorizedException('Usuário não encontrado.')
    if (!user.active) throw new UnauthorizedException('Usuário inativo.')

    if (payload.origin && !['web', 'mobile'].includes(payload.origin)) {
      throw new UnauthorizedException('Origem inválida.')
    }

    return { ...user, origin: payload.origin || 'web' }
  }
}
