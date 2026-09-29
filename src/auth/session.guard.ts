import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { PUBLIC_ROUTE, ROLES } from '../common/auth.decorators';
import { AuthenticatedRequest, UserRole } from '../common/auth.types';
import { ProblemException } from '../common/problem.exception';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.resolve(
      request.cookies?.mg_session_partitioned ?? request.cookies?.mg_session,
    );
    if (!user)
      throw new ProblemException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Sessão ausente, inválida ou expirada.',
      );
    request.user = user;
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(user.role))
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Você não possui permissão para esta operação.',
      );
    return true;
  }
}
