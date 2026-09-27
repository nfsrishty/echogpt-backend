import { Injectable } from '@nestjs/common';
import {
  PlanTier,
  Prisma,
  ProviderHealthStatus,
  ProviderType,
  RoleName,
} from '@prisma/client';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import {
  escapeLike,
  startOfUtcDay,
  toSqlTimestamp,
} from '../common/utils/sql.util';
import { PrismaService } from '../prisma/prisma.service';
import { RequestLogQueryDto } from './dto/admin-query.dto';
import {
  DashboardResponseDto,
  RequestLogListResponseDto,
  UsageAnalyticsResponseDto,
} from './dto/admin-response.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_N = 10;
/** Any UUID in a path becomes :id so /chat/conversations/<id> groups as one route. */
const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- dashboard ----------

  async dashboard(): Promise<DashboardResponseDto> {
    const now = new Date();
    const today = startOfUtcDay(now);
    const weekAgo = new Date(today.getTime() - 6 * DAY_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);

    const [
      totalUsers,
      newToday,
      newLast7Days,
      emailVerified,
      admins,
      activeLast24h,
      tiers,
      requestsToday,
      aiRequestsToday,
      errorsToday,
      conversations,
      messages,
      searches,
      providers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { isEmailVerified: true } }),
      this.prisma.user.count({ where: { role: { name: RoleName.ADMIN } } }),
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM api_usage_logs
        WHERE user_id IS NOT NULL AND created_at >= ${toSqlTimestamp(dayAgo)}::timestamp
      `,
      // An expired Premium period counts as Free (it reverts on next use).
      this.prisma.$queryRaw<{ tier: PlanTier; count: number }[]>`
        SELECT CASE
                 WHEN p.tier = 'PREMIUM' AND s.current_period_end IS NOT NULL
                      AND s.current_period_end <= ${toSqlTimestamp(now)}::timestamp
                 THEN 'FREE' ELSE p.tier::text
               END AS tier,
               COUNT(*)::int AS count
        FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        GROUP BY 1
      `,
      this.prisma.apiUsageLog.count({ where: { createdAt: { gte: today } } }),
      this.prisma.apiUsageLog.count({
        where: { createdAt: { gte: today }, countsTowardQuota: true },
      }),
      this.prisma.apiUsageLog.count({
        where: { createdAt: { gte: today }, statusCode: { gte: 400 } },
      }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.webSearch.count(),
      this.prisma.aiProvider.findMany({
        select: { isEnabled: true, healthStatus: true },
      }),
    ]);

    const tierCount = (tier: PlanTier) =>
      tiers.find((row) => row.tier === tier)?.count ?? 0;
    const enabled = providers.filter((p) => p.isEnabled);

    return {
      users: {
        total: totalUsers,
        newToday,
        newLast7Days,
        emailVerified,
        admins,
        activeLast24h: activeLast24h[0]?.count ?? 0,
      },
      subscriptions: {
        free: tierCount(PlanTier.FREE),
        premium: tierCount(PlanTier.PREMIUM),
      },
      activity: {
        requestsToday,
        aiRequestsToday,
        errorsToday,
        conversations,
        messages,
        searches,
      },
      providers: {
        total: providers.length,
        enabled: enabled.length,
        healthy: enabled.filter(
          (p) => p.healthStatus === ProviderHealthStatus.HEALTHY,
        ).length,
        unhealthy: enabled.filter(
          (p) => p.healthStatus === ProviderHealthStatus.UNHEALTHY,
        ).length,
      },
      generatedAt: now,
    };
  }

  // ---------- usage analytics ----------

  async usage(days: number): Promise<UsageAnalyticsResponseDto> {
    const today = startOfUtcDay();
    const from = new Date(today.getTime() - (days - 1) * DAY_MS);
    const since = toSqlTimestamp(from);

    const [daily, byProvider, topEndpoints, topUsers] = await Promise.all([
      this.prisma.$queryRaw<
        {
          day: string;
          requests: number;
          ai_requests: number;
          errors: number;
          prompt_tokens: number;
          completion_tokens: number;
          latency_sum: number;
        }[]
      >`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS requests,
               (COUNT(*) FILTER (WHERE counts_toward_quota))::int AS ai_requests,
               (COUNT(*) FILTER (WHERE status_code >= 400))::int AS errors,
               COALESCE(SUM(prompt_tokens), 0)::float8 AS prompt_tokens,
               COALESCE(SUM(completion_tokens), 0)::float8 AS completion_tokens,
               COALESCE(SUM(duration_ms), 0)::float8 AS latency_sum
        FROM api_usage_logs
        WHERE created_at >= ${since}::timestamp
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<
        {
          provider_id: string;
          name: string;
          type: ProviderType;
          requests: number;
          prompt_tokens: number;
          completion_tokens: number;
        }[]
      >`
        SELECT l.provider_id, p.name, p.type,
               COUNT(*)::int AS requests,
               COALESCE(SUM(l.prompt_tokens), 0)::float8 AS prompt_tokens,
               COALESCE(SUM(l.completion_tokens), 0)::float8 AS completion_tokens
        FROM api_usage_logs l
        JOIN ai_providers p ON p.id = l.provider_id
        WHERE l.created_at >= ${since}::timestamp
        GROUP BY l.provider_id, p.name, p.type
        ORDER BY requests DESC
      `,
      this.prisma.$queryRaw<
        {
          method: string;
          route: string;
          requests: number;
          errors: number;
          avg_latency: number;
        }[]
      >`
        SELECT method,
               regexp_replace(path, ${UUID_PATTERN}, ':id', 'g') AS route,
               COUNT(*)::int AS requests,
               (COUNT(*) FILTER (WHERE status_code >= 400))::int AS errors,
               ROUND(AVG(duration_ms))::int AS avg_latency
        FROM api_usage_logs
        WHERE created_at >= ${since}::timestamp
        GROUP BY 1, 2
        ORDER BY requests DESC
        LIMIT ${TOP_N}
      `,
      this.prisma.$queryRaw<
        {
          user_id: string;
          email: string;
          ai_requests: number;
          requests: number;
        }[]
      >`
        SELECT l.user_id, u.email,
               (COUNT(*) FILTER (WHERE l.counts_toward_quota))::int AS ai_requests,
               COUNT(*)::int AS requests
        FROM api_usage_logs l
        JOIN users u ON u.id = l.user_id
        WHERE l.created_at >= ${since}::timestamp
        GROUP BY l.user_id, u.email
        ORDER BY ai_requests DESC, requests DESC
        LIMIT ${TOP_N}
      `,
    ]);

    // Zero-fill: a chart needs every day, including days with no traffic.
    const byDay = new Map(daily.map((row) => [row.day, row]));
    const dailySeries = Array.from({ length: days }, (_, i) => {
      const date = new Date(from.getTime() + i * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const row = byDay.get(date);
      return {
        date,
        requests: row?.requests ?? 0,
        aiRequests: row?.ai_requests ?? 0,
        errors: row?.errors ?? 0,
        promptTokens: row?.prompt_tokens ?? 0,
        completionTokens: row?.completion_tokens ?? 0,
      };
    });

    const sum = (pick: (row: (typeof daily)[number]) => number) =>
      daily.reduce((total, row) => total + pick(row), 0);
    const requests = sum((r) => r.requests);
    const errors = sum((r) => r.errors);

    return {
      from: dailySeries[0].date,
      to: dailySeries[dailySeries.length - 1].date,
      totals: {
        requests,
        aiRequests: sum((r) => r.ai_requests),
        errors,
        errorRate: requests ? Number((errors / requests).toFixed(4)) : 0,
        avgLatencyMs: requests
          ? Math.round(sum((r) => r.latency_sum) / requests)
          : 0,
        promptTokens: sum((r) => r.prompt_tokens),
        completionTokens: sum((r) => r.completion_tokens),
      },
      daily: dailySeries,
      byProvider: byProvider.map((row) => ({
        providerId: row.provider_id,
        name: row.name,
        type: row.type,
        requests: row.requests,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
      })),
      topEndpoints: topEndpoints.map((row) => ({
        method: row.method,
        route: row.route,
        requests: row.requests,
        errors: row.errors,
        avgLatencyMs: row.avg_latency,
      })),
      topUsers: topUsers.map((row) => ({
        userId: row.user_id,
        email: row.email,
        aiRequests: row.ai_requests,
        requests: row.requests,
      })),
    };
  }

  // ---------- request logs ----------

  async logs(query: RequestLogQueryDto): Promise<RequestLogListResponseDto> {
    const statusFilter: Prisma.IntFilter | undefined =
      query.statusCode !== undefined
        ? { equals: query.statusCode }
        : query.minStatus !== undefined
          ? { gte: query.minStatus }
          : undefined;

    const where: Prisma.ApiUsageLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(statusFilter ? { statusCode: statusFilter } : {}),
      ...(query.path ? { path: { contains: escapeLike(query.path) } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.apiUsageLog.count({ where }),
      this.prisma.apiUsageLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: logs.map((log) => ({
        id: log.id,
        method: log.method,
        path: log.path,
        statusCode: log.statusCode,
        durationMs: log.durationMs,
        userId: log.userId,
        userEmail: log.user?.email ?? null,
        providerId: log.providerId,
        countsTowardQuota: log.countsTowardQuota,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
      })),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }
}
