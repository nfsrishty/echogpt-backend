import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminSystemService } from './admin-system.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminAnalyticsController,
  AdminSubscriptionsController,
  AdminSystemController,
  AdminUsersController,
} from './admin.controllers';

@Module({
  imports: [AuthModule, SubscriptionsModule],
  controllers: [
    AdminAnalyticsController,
    AdminUsersController,
    AdminSubscriptionsController,
    AdminSystemController,
  ],
  providers: [
    AdminAnalyticsService,
    AdminUsersService,
    AdminSubscriptionsService,
    AdminSystemService,
  ],
  exports: [AdminSystemService],
})
export class AdminModule {}
