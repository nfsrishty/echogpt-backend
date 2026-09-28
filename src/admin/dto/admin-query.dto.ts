import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlanTier, RoleName, SubscriptionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AdminUserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Matches email or full name (case-insensitive)',
    example: 'jane',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ enum: PlanTier })
  @IsOptional()
  @IsEnum(PlanTier)
  tier?: PlanTier;
}

export class AdminSubscriptionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PlanTier })
  @IsOptional()
  @IsEnum(PlanTier)
  tier?: PlanTier;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 90,
    default: 7,
    description: 'Days to include, ending today (UTC)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  days: number = 7;
}

export class RequestLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
  method?: string;

  @ApiPropertyOptional({ example: 429, description: 'Exact status code' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @ApiPropertyOptional({
    example: 400,
    description: 'Only responses with status >= this (e.g. 400 = all errors)',
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  minStatus?: number;

  @ApiPropertyOptional({
    example: '/chat',
    description: 'Path contains this text',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  path?: string;

  @ApiPropertyOptional({ example: '2026-09-27T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-28T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
