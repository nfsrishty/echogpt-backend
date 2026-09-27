import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsageResponseDto } from './dto/subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily quota = number of successful quota-consuming requests since 00:00 UTC.
 * Counted straight from api_usage_logs (indexed on user + flag + time), so
 * there's no separate counter that could drift out of sync.
 */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getUsage(userId: string): Promise<UsageResponseDto> {
    const { plan } =
      await this.subscriptionsService.getEffectiveSubscription(userId);
    const { start, end } = this.todayUtc();

    const usedToday = await this.prisma.apiUsageLog.count({
      where: {
        userId,
        countsTowardQuota: true,
        createdAt: { gte: start, lt: end },
      },
    });

    return {
      tier: plan.tier,
      dailyLimit: plan.dailyRequestLimit,
      usedToday,
      remaining: Math.max(plan.dailyRequestLimit - usedToday, 0),
      resetsAt: end,
    };
  }

  /** Throws 429 when the user has no requests left today. */
  async assertWithinLimit(userId: string): Promise<void> {
    const usage = await this.getUsage(userId);

    if (usage.remaining <= 0) {
      throw new HttpException(
        {
          error: 'Quota Exceeded',
          message: `Daily limit of ${usage.dailyLimit} requests reached on the ${usage.tier} plan. Resets at ${usage.resetsAt.toISOString()}.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private todayUtc(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    return { start, end: new Date(start.getTime() + DAY_MS) };
  }
}
