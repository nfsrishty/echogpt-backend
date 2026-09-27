import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  Plan,
  PlanTier,
  Prisma,
  Subscription,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PlanResponseDto,
  SubscriptionResponseDto,
} from './dto/subscription-response.dto';

const PREMIUM_PERIOD_DAYS = 30;

export type SubscriptionWithPlan = Subscription & { plan: Plan };

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PlanResponseDto[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });

    return plans.map((plan) => this.toPlanResponse(plan));
  }

  async getMySubscription(userId: string): Promise<SubscriptionResponseDto> {
    return this.toResponse(await this.getEffectiveSubscription(userId));
  }

  /**
   * Upgrade or downgrade. There is no payment gateway in this assignment, so
   * upgrading grants a 30-day Premium period directly; in production this
   * method would run from the payment provider's success webhook instead.
   */
  async changePlan(
    userId: string,
    tier: PlanTier,
  ): Promise<SubscriptionResponseDto> {
    const current = await this.getEffectiveSubscription(userId);

    if (current.plan.tier === tier) {
      throw new BadRequestException(`You are already on the ${tier} plan`);
    }

    const plan = await this.findActivePlan(tier);
    const isPaid = plan.priceCents > 0;

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date(),
        currentPeriodEnd: isPaid ? this.daysFromNow(PREMIUM_PERIOD_DAYS) : null,
        canceledAt: null,
      },
      include: { plan: true },
    });

    return this.toResponse(updated);
  }

  /**
   * Returns the user's subscription, applying expiry lazily: a Premium plan
   * whose paid period has ended is moved back to Free the first time anyone
   * reads it. No cron job needed.
   */
  async getEffectiveSubscription(
    userId: string,
  ): Promise<SubscriptionWithPlan> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription) {
      // Self-healing for accounts created before subscriptions existed.
      return this.createFreeSubscription(userId);
    }

    const expired =
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd <= new Date();

    if (!expired) {
      return subscription;
    }

    const freePlan = await this.findActivePlan(PlanTier.FREE);

    return this.prisma.subscription.update({
      where: { userId },
      data: {
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: new Date(),
        currentPeriodEnd: null,
      },
      include: { plan: true },
    });
  }

  private async createFreeSubscription(
    userId: string,
  ): Promise<SubscriptionWithPlan> {
    const freePlan = await this.findActivePlan(PlanTier.FREE);

    try {
      return await this.prisma.subscription.create({
        data: { userId, planId: freePlan.id },
        include: { plan: true },
      });
    } catch (error) {
      // Two concurrent requests both tried to create it: read the winner's row.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.subscription.findUniqueOrThrow({
          where: { userId },
          include: { plan: true },
        });
      }
      throw error;
    }
  }

  private async findActivePlan(tier: PlanTier): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { tier } });

    if (!plan) {
      throw new InternalServerErrorException(
        `Plan ${tier} is missing. Run \`npm run db:seed\`.`,
      );
    }
    if (!plan.isActive) {
      throw new NotFoundException(`The ${tier} plan is not available`);
    }

    return plan;
  }

  private daysFromNow(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private toPlanResponse(plan: Plan): PlanResponseDto {
    return {
      tier: plan.tier,
      displayName: plan.displayName,
      dailyRequestLimit: plan.dailyRequestLimit,
      priceCents: plan.priceCents,
    };
  }

  private toResponse(
    subscription: SubscriptionWithPlan,
  ): SubscriptionResponseDto {
    return {
      ...this.toPlanResponse(subscription.plan),
      status: subscription.status,
      startedAt: subscription.startedAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }
}
