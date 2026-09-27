import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier, RoleName } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ChangeRoleDto {
  @ApiProperty({ enum: RoleName, example: RoleName.ADMIN })
  @IsEnum(RoleName)
  role: RoleName;
}

export class SetUserPlanDto {
  @ApiProperty({ enum: PlanTier, example: PlanTier.PREMIUM })
  @IsEnum(PlanTier)
  tier: PlanTier;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 3650,
    default: 30,
    description: 'Length of the paid period in days (ignored for FREE)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  periodDays?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Premium' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName?: string;

  @ApiPropertyOptional({ example: 1000, minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  dailyRequestLimit?: number;

  @ApiPropertyOptional({
    example: 1499,
    minimum: 0,
    description: 'Monthly price in cents',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  priceCents?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
