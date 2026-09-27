import { SetMetadata } from '@nestjs/common';

export const CONSUMES_QUOTA_KEY = 'consumesQuota';

/**
 * Marks a route as counting toward the user's daily request limit
 * (AI chat and AI web search). The QuotaGuard blocks the call when the limit
 * is reached; the ApiUsageInterceptor records it only if it succeeded.
 */
export const ConsumesQuota = () => SetMetadata(CONSUMES_QUOTA_KEY, true);
