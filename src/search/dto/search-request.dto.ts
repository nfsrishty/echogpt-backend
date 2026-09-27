import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SearchRequestDto {
  @ApiProperty({
    example: 'latest developments in solid-state batteries',
    maxLength: 400,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  query: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Ask the AI to write a short answer that cites the results',
  })
  @IsOptional()
  @IsBoolean()
  summarize?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'AI provider for the summary. Defaults to the default provider.',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxResults?: number;
}

export class RecentSearchesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export class SuggestionsQueryDto {
  @ApiProperty({
    example: 'sol',
    description: 'What the user has typed so far',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;
}
