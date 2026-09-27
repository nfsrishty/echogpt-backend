import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  JwtAccessPayload,
  JwtRefreshPayload,
} from '../common/interfaces/auth-user.interface';
import { safeEqual, sha256 } from '../common/utils/hash.util';
import { ClientMeta } from '../common/utils/request-meta.util';
import { TokensResponseDto } from './dto/auth-response.dto';

interface TokenSubject {
  id: string;
  email: string;
  role: { name: RoleName };
}

type JwtExpiresIn = NonNullable<
  Parameters<JwtService['signAsync']>[1]
>['expiresIn'];

/**
 * Issues and rotates token pairs.
 *
 * Rotation: every refresh swaps the stored hash for a new token's hash, so each
 * refresh token works exactly once. If an OLD token is presented again, someone
 * copied it (the real owner already used it), so the whole session is revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Opens a new session (one per login/device) and returns its first token pair. */
  async createSession(
    user: TokenSubject,
    meta: ClientMeta,
  ): Promise<TokensResponseDto> {
    // We choose the session id up front so it can go inside the refresh token.
    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken(user.id, sessionId);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        expiresAt: this.expiryOf(refreshToken),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    const accessToken = await this.signAccessToken(user, sessionId);

    return this.toResponse(accessToken, refreshToken);
  }

  /** Exchanges a valid refresh token for a brand-new pair (rotation). */
  async rotate(
    refreshToken: string,
    meta: ClientMeta,
  ): Promise<TokensResponseDto> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(
        refreshToken,
        { secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { role: true } } },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const presentedHash = sha256(refreshToken);

    if (!safeEqual(presentedHash, session.refreshTokenHash)) {
      // A validly-signed but already-rotated token: treat as theft.
      await this.revokeSession(session.id);
      throw new UnauthorizedException(
        'Refresh token reuse detected. Please log in again.',
      );
    }

    const newRefreshToken = await this.signRefreshToken(
      session.userId,
      session.id,
    );

    // Conditional update = atomic compare-and-swap. If two requests race with
    // the same token, only one matches the old hash; the other gets count 0.
    const { count } = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: presentedHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: sha256(newRefreshToken),
        expiresAt: this.expiryOf(newRefreshToken),
        lastUsedAt: new Date(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    if (count === 0) {
      throw new UnauthorizedException('Refresh token has already been used');
    }

    const accessToken = await this.signAccessToken(session.user, session.id);

    return this.toResponse(accessToken, newRefreshToken);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session of a user, optionally keeping one. */
  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    return count;
  }

  private signAccessToken(
    user: TokenSubject,
    sessionId: string,
  ): Promise<string> {
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      sid: sessionId,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) as JwtExpiresIn,
    });
  }

  private signRefreshToken(userId: string, sessionId: string): Promise<string> {
    // jti makes every token unique, even two issued in the same second.
    const payload: JwtRefreshPayload = {
      sub: userId,
      sid: sessionId,
      jti: randomUUID(),
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>(
        'JWT_REFRESH_EXPIRES_IN',
      ) as JwtExpiresIn,
    });
  }

  /** Reads the `exp` claim so the DB expiry always matches the token's own. */
  private expiryOf(token: string): Date {
    const { exp } = this.jwtService.decode<{ exp: number }>(token);

    return new Date(exp * 1000);
  }

  private toResponse(
    accessToken: string,
    refreshToken: string,
  ): TokensResponseDto {
    const { exp, iat } = this.jwtService.decode<{ exp: number; iat: number }>(
      accessToken,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: exp - iat,
    };
  }
}
