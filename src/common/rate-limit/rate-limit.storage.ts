import {
  Global,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { FailOpenThrottlerStorage } from './fail-open-throttler.storage';

export type RateLimitMode = 'redis' | 'memory';

/**
 * Where rate-limit counters live.
 *
 * - REDIS_URL set   -> Redis: every API instance shares ONE counter per
 *                      client, so running N instances still enforces 1x the
 *                      limit (in memory, N instances would allow Nx).
 * - REDIS_URL empty -> in-process memory: fine for a single instance.
 */
@Injectable()
export class RateLimitStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  readonly mode: RateLimitMode;
  private readonly logger = new Logger(RateLimitStorage.name);
  private readonly redis?: Redis;
  private readonly store: ThrottlerStorage & {
    onApplicationShutdown?: () => void;
  };
  private readonly failOpen?: FailOpenThrottlerStorage;
  private closing?: Promise<void>;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.mode = 'memory';
      this.store = new ThrottlerStorageService();
      return;
    }

    this.mode = 'redis';
    this.redis = new Redis(redisUrl, {
      // Fail fast instead of queueing commands while disconnected, so a
      // Redis outage never makes requests hang (see FailOpenThrottlerStorage).
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });
    this.redis.on('error', () => {
      // Reported (rate-limited) by FailOpenThrottlerStorage; ioredis keeps
      // reconnecting in the background.
    });
    this.redis.on('ready', () => this.logger.log('Connected to Redis'));

    this.failOpen = new FailOpenThrottlerStorage(
      new ThrottlerStorageRedisService(this.redis),
    );
    this.store = this.failOpen;
  }

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    return this.store.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  /** For system health: is the shared counter store reachable? */
  async ping(): Promise<{ status: 'up' | 'down'; latencyMs: number | null }> {
    if (!this.redis) {
      return { status: 'up', latencyMs: 0 };
    }
    const startedAt = Date.now();
    try {
      await this.redis.ping();
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  /**
   * Idempotent: this instance is registered both as its own provider and as
   * the throttler's storage, so Nest calls this hook twice. A second quit()
   * on a closing connection would fail and fall back to a forced disconnect
   * that leaves a 2 s timer running (delaying process exit).
   */
  onApplicationShutdown(): Promise<void> {
    this.closing ??= this.close();
    return this.closing;
  }

  private async close(): Promise<void> {
    // The in-memory store holds timers; clear them so the process can exit.
    this.store.onApplicationShutdown?.();
    if (this.redis && this.redis.status !== 'end') {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }
}

@Global()
@Module({
  providers: [RateLimitStorage],
  exports: [RateLimitStorage],
})
export class RateLimitModule {}
