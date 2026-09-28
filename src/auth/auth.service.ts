import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PlanTier, Role, RoleName, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSync } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  BCRYPT_ROUNDS,
  hashPassword,
  verifyPassword,
} from '../common/utils/password.util';
import { ClientMeta } from '../common/utils/request-meta.util';
import { describeUserAgent } from '../common/utils/user-agent.util';
import {
  AuthResponseDto,
  AuthUserResponseDto,
  TokensResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { EmailVerificationService } from './email-verification.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  /**
   * Compared against when the email doesn't exist, so "unknown email" and
   * "wrong password" take the same ~250 ms. Otherwise response time would
   * reveal which emails are registered (user enumeration).
   */
  private readonly dummyPasswordHash = hashSync(
    randomBytes(16).toString('hex'),
    BCRYPT_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto, meta: ClientMeta): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const [userRole, freePlan] = await Promise.all([
      this.prisma.role.findUnique({ where: { name: RoleName.USER } }),
      this.prisma.plan.findUnique({ where: { tier: PlanTier.FREE } }),
    ]);
    if (!userRole || !freePlan) {
      throw new InternalServerErrorException(
        'Default role or plan missing. Run `npm run db:seed`.',
      );
    }

    // Nested create: user + FREE subscription are written atomically.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        fullName: dto.fullName,
        roleId: userRole.id,
        subscription: { create: { planId: freePlan.id } },
      },
      include: { role: true },
    });

    await this.emailVerificationService.sendVerification(user);
    const tokens = await this.tokenService.createSession(user, meta);

    return { ...tokens, user: this.toUserResponse(user) };
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    const passwordValid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );

    // Same message for both cases: never reveal whether the email exists.
    if (!user || !passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokenService.createSession(user, meta);

    return { ...tokens, user: this.toUserResponse(user) };
  }

  refresh(refreshToken: string, meta: ClientMeta): Promise<TokensResponseDto> {
    return this.tokenService.rotate(refreshToken, meta);
  }

  logout(user: AuthUser): Promise<void> {
    return this.tokenService.revokeSession(user.sessionId);
  }

  async logoutAll(user: AuthUser): Promise<number> {
    return this.tokenService.revokeAllSessions(user.id);
  }

  /** Active sessions (logged-in devices) of the user, newest activity first. */
  async listSessions(user: AuthUser): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      device: describeUserAgent(session.userAgent),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActiveAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      current: session.id === user.sessionId,
    }));
  }

  /** Signs one of the user's own devices out. */
  async revokeSession(user: AuthUser, sessionId: string): Promise<void> {
    const { count } = await this.prisma.session.updateMany({
      // userId in the filter: users can only revoke their OWN sessions.
      where: {
        id: sessionId,
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  verifyEmail(token: string): Promise<void> {
    return this.emailVerificationService.verify(token);
  }

  resendVerification(user: AuthUser): Promise<void> {
    return this.emailVerificationService.resend(user.id);
  }

  private toUserResponse(user: User & { role: Role }): AuthUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      isEmailVerified: user.isEmailVerified,
    };
  }
}
