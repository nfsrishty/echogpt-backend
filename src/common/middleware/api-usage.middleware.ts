import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NextFunction, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../interfaces/auth-user.interface';

/**
 * Writes one api_usage_logs row per API request, after the response is sent.
 *
 * A middleware (not an interceptor) because it must also see requests that
 * guards reject (401, 403, 429). Those never reach interceptors.
 *
 * The write is fire-and-forget: logging must never slow down or break the
 * actual request. At larger scale this would go through a queue instead.
 */
@Injectable()
export class ApiUsageMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiUsageMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(request: AuthenticatedRequest, response: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const path = request.originalUrl.split('?')[0]; // never store query strings
      if (!path.startsWith('/api/')) {
        return;
      }

      const durationMs = Number(
        (process.hrtime.bigint() - startedAt) / 1_000_000n,
      );
      const succeeded = response.statusCode < 400;

      const data: Prisma.ApiUsageLogUncheckedCreateInput = {
        userId: request.user?.id,
        method: request.method,
        path,
        statusCode: response.statusCode,
        durationMs,
        // Failed AI calls do not use up the user's quota.
        countsTowardQuota: Boolean(request.consumesQuota) && succeeded,
        providerId: request.usage?.providerId,
        promptTokens: request.usage?.promptTokens,
        completionTokens: request.usage?.completionTokens,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 512),
      };

      void this.write(data);
    });

    next();
  }

  private async write(
    data: Prisma.ApiUsageLogUncheckedCreateInput,
  ): Promise<void> {
    try {
      await this.prisma.apiUsageLog.create({ data });
    } catch (error) {
      // The request deleted its own user (DELETE /users/me), so the foreign
      // key no longer resolves: keep the row, anonymized like older logs.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003' &&
        data.userId
      ) {
        return this.write({ ...data, userId: null });
      }
      this.logger.warn(`Failed to write usage log: ${String(error)}`);
    }
  }
}
