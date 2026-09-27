import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AdminModule],
  controllers: [HealthController],
})
export class HealthModule {}
