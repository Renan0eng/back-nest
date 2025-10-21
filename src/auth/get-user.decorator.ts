// src/auth/get-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from 'generated/prisma';

/**
 * Cria um decorador de parâmetro personalizado chamado @GetUser.
 * Ele extrai o objeto 'user' que foi anexado à requisição pela
 * estratégia de autenticação (JwtStrategy) após a validação do token.
 */
export const GetUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): User => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);