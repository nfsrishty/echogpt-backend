import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { TokenService } from '../auth/token.service';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { escapeLike } from '../common/utils/sql.util';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../subscriptions/usage.service';
import { AdminUserListQueryDto } from './dto/admin-query.dto';
import {
  AdminUserDetailDto,
  AdminUserDto,
  AdminUserListResponseDto,
} from './dto/admin-response.dto';

const userInclude = (now: Date) =>
  ({
    role: true,
    subscription: { include: { plan: true } },
    _count: {
      select: {
        sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
      },
    },
  }) satisfies Prisma.UserInclude;

type UserWithRelations = Prisma.UserGetPayload<{
  include: ReturnType<typeof userInclude>;
}>;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly usageService: UsageService,
  ) {}

  async list(query: AdminUserListQueryDto): Promise<AdminUserListResponseDto> {
    const term = query.search ? escapeLike(query.search) : undefined;
    const where: Prisma.UserWhereInput = {
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { fullName: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.tier ? { subscription: { plan: { tier: query.tier } } } : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userInclude(new Date()),
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: users.map((user) => this.toDto(user)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.getOrThrow(id);

    const [conversations, searches, totalRequests, lastRequest, usageToday] =
      await Promise.all([
        this.prisma.conversation.count({ where: { userId: id } }),
        this.prisma.webSearch.count({ where: { userId: id } }),
        this.prisma.apiUsageLog.count({ where: { userId: id } }),
        this.prisma.apiUsageLog.findFirst({
          where: { userId: id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.usageService.getUsage(id),
      ]);

    return {
      ...this.toDto(user),
      subscription: user.subscription
        ? {
            tier: user.subscription.plan.tier,
            status: user.subscription.status,
            startedAt: user.subscription.startedAt,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
          }
        : null,
      usageToday,
      stats: {
        conversations,
        searches,
        totalRequests,
        lastActiveAt: lastRequest?.createdAt ?? null,
      },
      updatedAt: user.updatedAt,
    };
  }

  async changeRole(
    actor: AuthUser,
    id: string,
    role: RoleName,
  ): Promise<AdminUserDetailDto> {
    // Prevents an admin from accidentally locking themselves out.
    if (actor.id === id) {
      throw new BadRequestException('You cannot change your own role');
    }

    const user = await this.getOrThrow(id);
    if (user.role.name === role) {
      throw new BadRequestException(`User already has the ${role} role`);
    }
    if (user.role.name === RoleName.ADMIN) {
      await this.assertNotLastAdmin();
    }

    const roleRecord = await this.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    await this.prisma.user.update({
      where: { id },
      data: { roleId: roleRecord.id },
    });

    // No token re-issue needed: JwtAuthGuard reads the role from the DB on
    // every request, so the change applies to the user's next call.
    return this.detail(id);
  }

  async revokeSessions(id: string): Promise<number> {
    await this.getOrThrow(id);
    return this.tokenService.revokeAllSessions(id);
  }

  async remove(actor: AuthUser, id: string): Promise<void> {
    if (actor.id === id) {
      throw new BadRequestException(
        'Use DELETE /users/me to delete your own account',
      );
    }

    const user = await this.getOrThrow(id);
    if (user.role.name === RoleName.ADMIN) {
      await this.assertNotLastAdmin();
    }

    await this.prisma.user.delete({ where: { id } });
  }

  private async assertNotLastAdmin(): Promise<void> {
    const admins = await this.prisma.user.count({
      where: { role: { name: RoleName.ADMIN } },
    });
    if (admins <= 1) {
      throw new BadRequestException('Cannot remove the last admin');
    }
  }

  private async getOrThrow(id: string): Promise<UserWithRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude(new Date()),
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private toDto(user: UserWithRelations): AdminUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      isEmailVerified: user.isEmailVerified,
      tier: user.subscription?.plan.tier ?? null,
      activeSessions: user._count.sessions,
      createdAt: user.createdAt,
    };
  }
}
