import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderHealthStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RateLimitStorage } from '../common/rate-limit/rate-limit.storage';
import { PrismaService } from '../prisma/prisma.service';
import {
  CleanupResponseDto,
  SystemHealthResponseDto,
} from './dto/admin-response.dto';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminSystemService {
  private readonly version = this.readVersion();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rateLimitStorage: RateLimitStorage,
  ) {}

  async health(): Promise<SystemHealthResponseDto> {
    const [database, rateLimitStore] = await Promise.all([
      this.pingDatabase(),
      this.rateLimitStorage.ping(),
    ]);

    const providers =
      database.status === 'up'
        ? await this.prisma.aiProvider.findMany({
            where: { isEnabled: true },
            select: { healthStatus: true },
          })
        : [];
    const countStatus = (status: ProviderHealthStatus) =>
      providers.filter((p) => p.healthStatus === status).length;

    const healthy = countStatus(ProviderHealthStatus.HEALTHY);
    const memory = process.memoryUsage();

    // down = database unreachable; degraded = no AI provider known to work,
    // or the shared rate-limit store is unreachable (limits not enforced).
    const status =
      database.status === 'down'
        ? 'down'
        : providers.length === 0 ||
            healthy === 0 ||
            rateLimitStore.status === 'down'
          ? 'degraded'
          : 'ok';

    return {
      status,
      version: this.version,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      database,
      rateLimitStore: { mode: this.rateLimitStorage.mode, ...rateLimitStore },
      providers: {
        enabled: providers.length,
        healthy,
        unhealthy: countStatus(ProviderHealthStatus.UNHEALTHY),
        unknown: countStatus(ProviderHealthStatus.UNKNOWN),
      },
      webSearch: this.configService.get<string>('TAVILY_API_KEY')
        ? 'keyed'
        : 'keyless',
      timestamp: new Date(),
    };
  }

  /**
   * Housekeeping: removes rows that no longer serve any purpose. Expired or
   * revoked sessions are kept 7 days first, so recent logouts stay auditable.
   */
  async cleanup(): Promise<CleanupResponseDto> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - RETENTION_MS);

    const [sessions, tokens, cache] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
        },
      }),
      this.prisma.emailVerificationToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: cutoff } }] },
      }),
      this.prisma.searchCache.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

    return {
      sessionsDeleted: sessions.count,
      verificationTokensDeleted: tokens.count,
      searchCacheEntriesDeleted: cache.count,
    };
  }

  async pingDatabase(): Promise<{
    status: 'up' | 'down';
    latencyMs: number | null;
  }> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  private readVersion(): string {
    try {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      ) as { version?: string };
      return pkg.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
