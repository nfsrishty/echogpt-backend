import { ApiProperty } from '@nestjs/swagger';
import { PlanTier, SubscriptionStatus } from '@prisma/client';

export class PlanResponseDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.PREMIUM })
  tier: PlanTier;

  @ApiProperty({ example: 'Premium' })
  displayName: string;

  @ApiProperty({ example: 500, description: 'AI requests allowed per day' })
  dailyRequestLimit: number;

  @ApiProperty({ example: 999, description: 'Monthly price in cents' })
  priceCents: number;
}

export class SubscriptionResponseDto extends PlanResponseDto {
  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @ApiProperty({ example: '2026-09-27T10:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-27T10:00:00.000Z',
    description: 'End of the paid period. null on the Free plan.',
  })
  currentPeriodEnd: Date | null;
}

export class UsageResponseDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.FREE })
  tier: PlanTier;

  @ApiProperty({ example: 20 })
  dailyLimit: number;

  @ApiProperty({ example: 7 })
  usedToday: number;

  @ApiProperty({ example: 13 })
  remaining: number;

  @ApiProperty({
    example: '2026-09-28T00:00:00.000Z',
    description: 'When the counter resets (00:00 UTC)',
  })
  resetsAt: Date;
}
