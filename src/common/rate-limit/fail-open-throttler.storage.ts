import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

const WARN_INTERVAL_MS = 30_000;

/**
 * Wraps a rate-limit store so that a store outage (e.g. Redis down) never
 * takes the API down with it. On error, the request is allowed and not
 * counted ("fail open"); a warning is logged at most every 30 s.
 *
 * Why fail open: rate limiting is a protective extra. Briefly losing it is
 * far less harmful than rejecting every request because the counter store
 * is unreachable. Counting resumes automatically when the store recovers.
 */
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('RateLimitStorage');
  private lastWarningAt = 0;
  private failing = false;

  constructor(private readonly inner: ThrottlerStorage) {}

  /** True while the underlying store is failing. */
  get isFailing(): boolean {
    return this.failing;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const record = await this.inner.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
      if (this.failing) {
        this.failing = false;
        this.logger.log('Rate-limit store recovered; counting resumed');
      }
      return record;
    } catch (error) {
      this.failing = true;
      const now = Date.now();
      if (now - this.lastWarningAt >= WARN_INTERVAL_MS) {
        this.lastWarningAt = now;
        this.logger.warn(
          `Rate-limit store unavailable, allowing requests uncounted: ${(error as Error).message}`,
        );
      }

      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
