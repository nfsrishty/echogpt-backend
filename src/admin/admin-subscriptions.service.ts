import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlanTier, Prisma, SubscriptionStatus } from '@prisma/client';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSubscriptionListQueryDto } from './dto/admin-query.dto';
import { SetUserPlanDto, UpdatePlanDto } from './dto/admin-command.dto';
import {
  AdminPlanDto,
  AdminSubscriptionDto,
  AdminSubscriptionListResponseDto,
} from './dto/admin-response.dto';

const DEFAULT_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AdminSubscriptionListQueryDto,
  ): Promise<AdminSubscriptionListResponseDto> {
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.tier ? { plan: { tier: query.tier } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, subscriptions] = await this.prisma.$transaction([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: { plan: true, user: true },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const now = new Date();

    return {
      items: subscriptions.map((s): AdminSubscriptionDto => ({
        userId: s.userId,
        email: s.user.email,
        fullName: s.user.fullName,
        tier: s.plan.tier,
        status: s.status,
        startedAt: s.startedAt,
        currentPeriodEnd: s.currentPeriodEnd,
        periodExpired: s.currentPeriodEnd !== null && s.currentPeriodEnd <= now,
      })),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /**
   * Grants, extends or removes a paid plan for any user (support cases,
   * refunds, promotions). Unlike the user's own upgrade endpoint, setting the
   * same tier again is allowed: it restarts the period.
   */
  async setUserPlan(
    userId: string,
    dto: SetUserPlanDto,
  ): Promise<AdminSubscriptionDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const plan = await this.prisma.plan.findUnique({
      where: { tier: dto.tier },
    });
    if (!plan || !plan.isActive) {
      throw new BadRequestException(`The ${dto.tier} plan is not available`);
    }

    const currentPeriodEnd =
      dto.tier === PlanTier.FREE
        ? null
        : new Date(
            Date.now() + (dto.periodDays ?? DEFAULT_PERIOD_DAYS) * DAY_MS,
          );
    const data = {
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      startedAt: new Date(),
      currentPeriodEnd,
      canceledAt: null,
    };

    const subscription = await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return {
      userId,
      email: user.email,
      fullName: user.fullName,
      tier: plan.tier,
      status: subscription.status,
      startedAt: subscription.startedAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      periodExpired: false,
    };
  }

  async listPlans(): Promise<AdminPlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { priceCents: 'asc' },
    });

    return plans.map((plan) => ({
      tier: plan.tier,
      displayName: plan.displayName,
      dailyRequestLimit: plan.dailyRequestLimit,
      priceCents: plan.priceCents,
      isActive: plan.isActive,
      subscribers: plan._count.subscriptions,
      updatedAt: plan.updatedAt,
    }));
  }

  async updatePlan(tier: PlanTier, dto: UpdatePlanDto): Promise<AdminPlanDto> {
    // New accounts are always created on FREE, so it must stay available.
    if (tier === PlanTier.FREE && dto.isActive === false) {
      throw new BadRequestException('The FREE plan cannot be deactivated');
    }

    const existing = await this.prisma.plan.findUnique({ where: { tier } });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    const plan = await this.prisma.plan.update({
      where: { tier },
      data: {
        displayName: dto.displayName,
        dailyRequestLimit: dto.dailyRequestLimit,
        priceCents: dto.priceCents,
        isActive: dto.isActive,
      },
      include: { _count: { select: { subscriptions: true } } },
    });

    return {
      tier: plan.tier,
      displayName: plan.displayName,
      dailyRequestLimit: plan.dailyRequestLimit,
      priceCents: plan.priceCents,
      isActive: plan.isActive,
      subscribers: plan._count.subscriptions,
      updatedAt: plan.updatedAt,
    };
  }
}
