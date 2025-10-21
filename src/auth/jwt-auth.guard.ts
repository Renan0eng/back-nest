// src/auth/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Esta guarda estende a funcionalidade do AuthGuard do Passport.
 * Ao passar 'jwt' como argumento, ela automaticamente utiliza a JwtStrategy
 * que você configurou para validar o token JWT em cada requisição protegida.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}