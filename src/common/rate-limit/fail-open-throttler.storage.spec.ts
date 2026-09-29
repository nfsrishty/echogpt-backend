import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { FailOpenThrottlerStorage } from './fail-open-throttler.storage';

describe('FailOpenThrottlerStorage', () => {
  const record = {
    totalHits: 3,
    timeToExpire: 42,
    isBlocked: false,
    timeToBlockExpire: 0,
  };
  let healthy: boolean;
  const inner: ThrottlerStorage = {
    increment: jest.fn(() =>
      healthy
        ? Promise.resolve(record)
        : Promise.reject(new Error('Connection is closed.')),
    ),
  };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    healthy = true;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes results through while the store is healthy', async () => {
    const storage = new FailOpenThrottlerStorage(inner);
    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual(record);
    expect(storage.isFailing).toBe(false);
  });

  it('allows the request (not blocked, not counted) when the store fails', async () => {
    healthy = false;
    const storage = new FailOpenThrottlerStorage(inner);
    const result = await storage.increment('k', 60_000, 5, 60_000, 'default');

    expect(result).toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(storage.isFailing).toBe(true);
  });

  it('warns once, not on every request, during an outage', async () => {
    healthy = false;
    const storage = new FailOpenThrottlerStorage(inner);
    for (let i = 0; i < 50; i++) {
      await storage.increment('k', 60_000, 5, 60_000, 'default');
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resumes counting automatically when the store recovers', async () => {
    healthy = false;
    const storage = new FailOpenThrottlerStorage(inner);
    await storage.increment('k', 60_000, 5, 60_000, 'default');

    healthy = true;
    await expect(
      storage.increment('k', 60_000, 5, 60_000, 'default'),
    ).resolves.toEqual(record);
    expect(storage.isFailing).toBe(false);
  });
});
