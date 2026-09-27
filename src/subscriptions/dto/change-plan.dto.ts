import { ApiProperty } from '@nestjs/swagger';
import { PlanTier } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.PREMIUM })
  @IsEnum(PlanTier)
  tier: PlanTier;
}
