import { ApiProperty } from '@nestjs/swagger';
import {
  PlanTier,
  ProviderType,
  RoleName,
  SubscriptionStatus,
} from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';
import { UsageResponseDto } from '../../subscriptions/dto/subscription-response.dto';

// ---------- dashboard ----------

class DashboardUsersDto {
  @ApiProperty({ example: 1250 }) total: number;
  @ApiProperty({ example: 14 }) newToday: number;
  @ApiProperty({ example: 96 }) newLast7Days: number;
  @ApiProperty({ example: 1100 }) emailVerified: number;
  @ApiProperty({ example: 2 }) admins: number;
  @ApiProperty({
    example: 310,
    description: 'Distinct users with any request in the last 24h',
  })
  activeLast24h: number;
}

class DashboardSubscriptionsDto {
  @ApiProperty({ example: 1050 }) free: number;
  @ApiProperty({
    example: 200,
    description: 'Premium with an unexpired paid period',
  })
  premium: number;
}

class DashboardActivityDto {
  @ApiProperty({ example: 5400 }) requestsToday: number;
  @ApiProperty({ example: 1800 }) aiRequestsToday: number;
  @ApiProperty({ example: 37 }) errorsToday: number;
  @ApiProperty({ example: 8200 }) conversations: number;
  @ApiProperty({ example: 61000 }) messages: number;
  @ApiProperty({ example: 4300 }) searches: number;
}

class DashboardProvidersDto {
  @ApiProperty({ example: 3 }) total: number;
  @ApiProperty({ example: 3 }) enabled: number;
  @ApiProperty({ example: 2 }) healthy: number;
  @ApiProperty({ example: 1 }) unhealthy: number;
}

export class DashboardResponseDto {
  @ApiProperty({ type: DashboardUsersDto }) users: DashboardUsersDto;
  @ApiProperty({ type: DashboardSubscriptionsDto })
  subscriptions: DashboardSubscriptionsDto;
  @ApiProperty({ type: DashboardActivityDto }) activity: DashboardActivityDto;
  @ApiProperty({ type: DashboardProvidersDto })
  providers: DashboardProvidersDto;
  @ApiProperty() generatedAt: Date;
}

// ---------- users ----------

export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'jane@example.com' }) email: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName: string;
  @ApiProperty({ enum: RoleName, example: RoleName.USER }) role: RoleName;
  @ApiProperty({ example: true }) isEmailVerified: boolean;
  @ApiProperty({ enum: PlanTier, nullable: true, example: PlanTier.FREE })
  tier: PlanTier | null;
  @ApiProperty({ example: 2 }) activeSessions: number;
  @ApiProperty() createdAt: Date;
}

export class AdminUserListResponseDto {
  @ApiProperty({ type: AdminUserDto, isArray: true }) items: AdminUserDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}

class AdminUserSubscriptionDto {
  @ApiProperty({ enum: PlanTier }) tier: PlanTier;
  @ApiProperty({ enum: SubscriptionStatus }) status: SubscriptionStatus;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd: Date | null;
}

class AdminUserStatsDto {
  @ApiProperty({ example: 12 }) conversations: number;
  @ApiProperty({ example: 40 }) searches: number;
  @ApiProperty({ example: 380 }) totalRequests: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastActiveAt: Date | null;
}

export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty({ type: AdminUserSubscriptionDto, nullable: true })
  subscription: AdminUserSubscriptionDto | null;
  @ApiProperty({ type: UsageResponseDto }) usageToday: UsageResponseDto;
  @ApiProperty({ type: AdminUserStatsDto }) stats: AdminUserStatsDto;
  @ApiProperty() updatedAt: Date;
}

// ---------- subscriptions & plans ----------

export class AdminSubscriptionDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ example: 'jane@example.com' }) email: string;
  @ApiProperty({ example: 'Jane Doe' }) fullName: string;
  @ApiProperty({ enum: PlanTier }) tier: PlanTier;
  @ApiProperty({ enum: SubscriptionStatus }) status: SubscriptionStatus;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentPeriodEnd: Date | null;
  @ApiProperty({
    example: false,
    description: 'Paid period has ended (reverts to FREE on next use)',
  })
  periodExpired: boolean;
}

export class AdminSubscriptionListResponseDto {
  @ApiProperty({ type: AdminSubscriptionDto, isArray: true })
  items: AdminSubscriptionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}

export class AdminPlanDto {
  @ApiProperty({ enum: PlanTier }) tier: PlanTier;
  @ApiProperty({ example: 'Premium' }) displayName: string;
  @ApiProperty({ example: 500 }) dailyRequestLimit: number;
  @ApiProperty({ example: 999 }) priceCents: number;
  @ApiProperty({ example: true }) isActive: boolean;
  @ApiProperty({ example: 200 }) subscribers: number;
  @ApiProperty() updatedAt: Date;
}

// ---------- analytics ----------

class DailyUsageDto {
  @ApiProperty({ example: '2026-09-27' }) date: string;
  @ApiProperty({ example: 820 }) requests: number;
  @ApiProperty({ example: 260 }) aiRequests: number;
  @ApiProperty({ example: 9 }) errors: number;
  @ApiProperty({ example: 41000 }) promptTokens: number;
  @ApiProperty({ example: 98000 }) completionTokens: number;
}

class UsageTotalsDto {
  @ApiProperty({ example: 5400 }) requests: number;
  @ApiProperty({ example: 1800 }) aiRequests: number;
  @ApiProperty({ example: 37 }) errors: number;
  @ApiProperty({ example: 0.0069, description: 'errors / requests' })
  errorRate: number;
  @ApiProperty({ example: 142 }) avgLatencyMs: number;
  @ApiProperty({ example: 290000 }) promptTokens: number;
  @ApiProperty({ example: 690000 }) completionTokens: number;
}

class ProviderUsageDto {
  @ApiProperty({ format: 'uuid' }) providerId: string;
  @ApiProperty({ example: 'Gemini' }) name: string;
  @ApiProperty({ enum: ProviderType }) type: ProviderType;
  @ApiProperty({ example: 900 }) requests: number;
  @ApiProperty({ example: 150000 }) promptTokens: number;
  @ApiProperty({ example: 360000 }) completionTokens: number;
}

class EndpointUsageDto {
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({
    example: '/api/v1/chat/conversations/:id',
    description: 'IDs replaced by :id',
  })
  route: string;
  @ApiProperty({ example: 1200 }) requests: number;
  @ApiProperty({ example: 14 }) errors: number;
  @ApiProperty({ example: 910 }) avgLatencyMs: number;
}

class TopUserDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ example: 'power@example.com' }) email: string;
  @ApiProperty({ example: 480 }) aiRequests: number;
  @ApiProperty({ example: 900 }) requests: number;
}

export class UsageAnalyticsResponseDto {
  @ApiProperty({ example: '2026-09-21' }) from: string;
  @ApiProperty({ example: '2026-09-27' }) to: string;
  @ApiProperty({ type: UsageTotalsDto }) totals: UsageTotalsDto;
  @ApiProperty({
    type: DailyUsageDto,
    isArray: true,
    description: 'One entry per day, zero-filled',
  })
  daily: DailyUsageDto[];
  @ApiProperty({ type: ProviderUsageDto, isArray: true })
  byProvider: ProviderUsageDto[];
  @ApiProperty({ type: EndpointUsageDto, isArray: true })
  topEndpoints: EndpointUsageDto[];
  @ApiProperty({ type: TopUserDto, isArray: true }) topUsers: TopUserDto[];
}

// ---------- request logs ----------

export class RequestLogDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ example: '/api/v1/chat/messages' }) path: string;
  @ApiProperty({ example: 201 }) statusCode: number;
  @ApiProperty({ example: 912 }) durationMs: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) userId:
    string | null;
  @ApiProperty({ type: String, nullable: true, example: 'jane@example.com' })
  userEmail: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) providerId:
    string | null;
  @ApiProperty({ example: true }) countsTowardQuota: boolean;
  @ApiProperty({ type: Number, nullable: true }) promptTokens: number | null;
  @ApiProperty({ type: Number, nullable: true }) completionTokens:
    number | null;
  @ApiProperty({ type: String, nullable: true, example: '203.0.113.7' })
  ipAddress: string | null;
  @ApiProperty() createdAt: Date;
}

export class RequestLogListResponseDto {
  @ApiProperty({ type: RequestLogDto, isArray: true }) items: RequestLogDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta: PaginationMetaDto;
}

// ---------- system ----------

class DatabaseHealthDto {
  @ApiProperty({ enum: ['up', 'down'] }) status: 'up' | 'down';
  @ApiProperty({ type: Number, nullable: true, example: 3 }) latencyMs:
    number | null;
}

class ProvidersHealthSummaryDto {
  @ApiProperty({ example: 3 }) enabled: number;
  @ApiProperty({ example: 2 }) healthy: number;
  @ApiProperty({ example: 1 }) unhealthy: number;
  @ApiProperty({ example: 0 }) unknown: number;
}

class MemoryDto {
  @ApiProperty({ example: 142 }) rssMb: number;
  @ApiProperty({ example: 61 }) heapUsedMb: number;
}

export class SystemHealthResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded', 'down'], example: 'ok' }) status:
    'ok' | 'degraded' | 'down';
  @ApiProperty({ example: '0.0.1' }) version: string;
  @ApiProperty({ example: 'v22.11.0' }) nodeVersion: string;
  @ApiProperty({ example: 3600 }) uptimeSeconds: number;
  @ApiProperty({ type: MemoryDto }) memory: MemoryDto;
  @ApiProperty({ type: DatabaseHealthDto }) database: DatabaseHealthDto;
  @ApiProperty({
    type: ProvidersHealthSummaryDto,
    description: 'From the last stored health checks (no live calls)',
  })
  providers: ProvidersHealthSummaryDto;
  @ApiProperty({
    enum: ['keyed', 'keyless'],
    description: 'Tavily web search mode',
  })
  webSearch: 'keyed' | 'keyless';
  @ApiProperty() timestamp: Date;
}

export class CleanupResponseDto {
  @ApiProperty({ example: 120 }) sessionsDeleted: number;
  @ApiProperty({ example: 40 }) verificationTokensDeleted: number;
  @ApiProperty({ example: 300 }) searchCacheEntriesDeleted: number;
}
