import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AuthenticatedRequest,
  JwtAccessPayload,
} from '../interfaces/auth-user.interface';

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 *
 * Besides checking the JWT signature, it confirms the session still exists and
 * is not revoked. That one indexed lookup is what makes logout take effect
 * immediately instead of when the access token happens to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    let payload: JwtAccessPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtAccessPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: { id: true, email: true, role: { select: { name: true } } },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    // Role is read fresh from the DB, so a promotion/demotion applies instantly.
    request.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role.name,
      sessionId: payload.sid,
    };

    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    return scheme === 'Bearer' && token ? token : null;
  }
}
