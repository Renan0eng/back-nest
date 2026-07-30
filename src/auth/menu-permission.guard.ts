import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { MENU_SLUG_KEY } from './menu.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class MenuPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector, private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredMeta = this.reflector.getAllAndOverride<string | string[]>(MENU_SLUG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no slug is provided, allow by default (backwards compatible).
    if (!requiredMeta) return true;

    const requiredSlugs = Array.isArray(requiredMeta) ? requiredMeta : [requiredMeta];

    const req: Request = context.switchToHttp().getRequest();

    // Try to obtain token (Bearer or refresh cookie)
    let token: string | undefined = undefined;
    let tokenType: 'access' | 'refresh' | 'any' = 'any';

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      tokenType = 'access';
    } else if (req.cookies && req.cookies['refresh_token']) {
      token = req.cookies['refresh_token'];
      tokenType = 'refresh';
    }

    if (!token) throw new UnauthorizedException('Token não fornecido.');

    const validated = await this.authService.validateToken(token, { type: tokenType });

    // Mobile Bearer tokens: authenticate and attach user, skip menu permissions.
    // Mobile users (PACIENTE/MEDICO) don't have nivel_acesso menus —
    // their data access is scoped per-user/per-group in the service layer.
    if (tokenType === 'access') {
      let user: any;
      try {
        user = await this.authService.findUserById(validated.dataToken.sub);
      } catch {
        user = await this.authService.findUserByIdBasic(validated.dataToken.sub);
      }
      if (!req.user) req.user = user;
      if (!validated.dataToken.web && !validated.dataToken.impersonatedBy) return true;

      // A ação de abrir outra simulação continua pertencendo ao administrador
      // original, mesmo quando solicitada a partir de uma aba já simulada.
      const permissionUser = validated.dataToken.impersonatedBy && requiredSlugs.includes('logar-como')
        ? await this.authService.findUserById(validated.dataToken.impersonatedBy)
        : user;
      const targetMenus = permissionUser?.nivel_acesso?.menus || [];
      const targetAllowed = targetMenus.some((m: any) => requiredSlugs.includes(m.slug));
      if (!targetAllowed) throw new ForbiddenException('Acesso negado para este recurso.');
      return true;
    }

    // Web refresh token: full permission check
    const user = await this.authService.findUserById(validated.dataToken.sub);

    const menus = user?.nivel_acesso?.menus || [];
    const allowed = menus.some((m: any) => requiredSlugs.includes(m.slug));

    if (!allowed) throw new ForbiddenException('Acesso negado para este recurso.');

    // Attach user to request for downstream handlers if not already present
    if (!req.user) req.user = user as any;

    return true;
  }
}
