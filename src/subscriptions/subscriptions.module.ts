import { Module } from '@nestjs/common';
import { QuotaGuard } from './quota.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, UsageService, QuotaGuard],
  exports: [SubscriptionsService, UsageService, QuotaGuard],
})
export class SubscriptionsModule {}
