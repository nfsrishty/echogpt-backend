import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CONSUMES_QUOTA_KEY } from '../common/decorators/consumes-quota.decorator';
import { AuthenticatedRequest } from '../common/interfaces/auth-user.interface';
import { UsageService } from './usage.service';

/** Global guard: blocks @ConsumesQuota() routes once the daily limit is hit. */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usageService: UsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const consumesQuota = this.reflector.getAllAndOverride<boolean>(
      CONSUMES_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!consumesQuota) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user) {
      await this.usageService.assertWithinLimit(request.user.id);
    }

    // Tells the usage logger to count this request (if it succeeds).
    request.consumesQuota = true;

    return true;
  }
}
